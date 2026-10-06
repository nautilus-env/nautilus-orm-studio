import * as readline from "node:readline";

import { EngineProcess } from "./engine";
import { errorFromCode, HandshakeError, ProtocolError } from "./errors";

type RpcResult = Record<string, unknown>;

interface PendingRequest {
  resolve: (value: RpcResult) => void;
  reject: (error: Error) => void;
  data: unknown[];
}

export type IsolationLevel =
  | "readUncommitted"
  | "readCommitted"
  | "repeatableRead"
  | "serializable";

export interface TransactionOptions {
  timeout?: number;
  isolationLevel?: IsolationLevel;
}

export interface RawQueryRunner {
  rawQuery(sql: string): Promise<Record<string, unknown>[]>;
  rawStmtQuery(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
}

export class NautilusRuntimeClient implements RawQueryRunner {
  private readonly engine: EngineProcess;
  private nextId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private rl: readline.Interface | null = null;

  constructor(
    readonly schemaPath: string,
    options?: { migrate?: boolean },
  ) {
    this.engine = new EngineProcess(undefined, options?.migrate ?? false);
  }

  async connect(): Promise<void> {
    if (this.engine.isRunning()) return;

    this.engine.spawn(this.schemaPath);
    this.startReading();
    await this.handshake();

    process.once("exit", () => {
      this.engine.terminate().catch(() => {});
    });
  }

  async disconnect(): Promise<void> {
    this.rl?.close();
    this.rl = null;

    await this.engine.terminate();

    const error = new ProtocolError("Client disconnected");
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }

  private async query(method: string, params: Record<string, unknown>) {
    const result = await this._rpc(method, params);
    return Array.isArray(result.data) ? result.data as Record<string, unknown>[] : [];
  }

  rawQuery(sql: string) {
    return this.query("query.rawQuery", { sql });
  }

  rawStmtQuery(sql: string, params: unknown[] = []) {
    return this.query("query.rawStmtQuery", { sql, params });
  }

  async $transaction<T>(
    fn: (tx: RawQueryRunner) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    const result = await this._rpc("transaction.start", {
      timeoutMs: options?.timeout ?? 5000,
      isolationLevel: options?.isolationLevel,
    });
    const transactionId = String(result.id);
    const tx: RawQueryRunner = {
      rawQuery: (sql) => this.query("query.rawQuery", { sql, transactionId }),
      rawStmtQuery: (sql, params = []) => this.query("query.rawStmtQuery", { sql, params, transactionId }),
    };

    try {
      const result = await fn(tx);
      await this._rpc("transaction.commit", { id: transactionId });
      return result;
    } catch (error) {
      try { await this._rpc("transaction.rollback", { id: transactionId }); } catch {}
      throw error;
    }
  }

  async _rpc(method: string, params: Record<string, unknown>): Promise<RpcResult> {
    if (!this.engine.isRunning()) {
      throw new ProtocolError("Engine is not running. Call connect() first.");
    }

    const id = ++this.nextId;
    const payload = JSON.stringify(
      { jsonrpc: "2.0", id, method, params: { protocolVersion: 1, ...params } },
      (_key, value) => {
        if (value instanceof Date) return value.toISOString();
        if (value instanceof Buffer) return value.toString("base64");
        return value;
      },
    ) + "\n";

    return await new Promise<RpcResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, data: [] });

      this.engine.stdin?.write(payload, (error) => {
        if (!error) return;

        this.pending.delete(id);
        reject(new ProtocolError(`Write failed: ${error.message}`));
      });
    });
  }

  private startReading() {
    const stdout = this.engine.stdout;
    if (!stdout) {
      throw new ProtocolError("Engine stdout is not available.");
    }

    this.rl = readline.createInterface({ input: stdout, crlfDelay: Infinity });

    this.rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let response: Record<string, unknown>;
      try {
        response = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        console.error("[nautilus-js] Failed to parse response:", trimmed);
        return;
      }

      const id = response.id;
      if (typeof id !== "number") return;

      const pending = this.pending.get(id);
      if (!pending) return;

      if (response.partial === true) {
        const result = response.result as Record<string, unknown> | undefined;
        const chunkData = Array.isArray(result?.data) ? result.data : [];
        pending.data.push(...chunkData);
        return;
      }

      this.pending.delete(id);

      if (response.error && typeof response.error === "object") {
        const error = response.error as Record<string, unknown>;
        pending.reject(
          errorFromCode(
            Number(error.code ?? 0),
            String(error.message ?? "Unknown Nautilus error"),
            error.data,
          ),
        );
        return;
      }

      let result = (response.result as RpcResult | undefined) ?? {};

      if (pending.data.length > 0) {
        const data = Array.isArray(result.data) ? result.data : [];
        result = { ...result, data: [...pending.data, ...data] };
      }

      pending.resolve(result);
    });

    this.rl.on("close", () => {
      const stderr = this.engine.getStderrOutput().trim();
      const message = stderr
        ? `Engine process exited unexpectedly.\nDetails: ${stderr}`
        : "Engine process exited unexpectedly (no output on stderr).";
      const error = new ProtocolError(message);

      for (const { reject } of this.pending.values()) {
        reject(error);
      }

      this.pending.clear();
    });
  }

  private async handshake() {
    let response: RpcResult;
    const clientVersion = "0.1.0";

    try {
      response = await this._rpc("engine.handshake", {
        clientName: "nautilus-studio",
        clientVersion,
      });
    } catch (error) {
      await this.disconnect();
      throw new HandshakeError(`Handshake failed: ${String(error)}`);
    }

    const protocolVersion = response.protocolVersion;
    if (protocolVersion !== 1) {
      await this.disconnect();
      throw new HandshakeError(
        `Protocol version mismatch: engine uses ${String(protocolVersion)}, client expects 1`,
      );
    }
  }
}
