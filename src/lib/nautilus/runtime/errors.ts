export interface NautilusErrorDetails {
  code?: number;
  data?: unknown;
}

export class NautilusError extends Error {
  readonly code?: number;
  readonly data?: unknown;

  constructor(message: string, details?: NautilusErrorDetails, name = "NautilusError") {
    super(message);
    this.name = name;
    this.code = details?.code;
    this.data = details?.data;
  }
}

export class ProtocolError extends NautilusError {
  constructor(message: string) {
    super(message, undefined, "ProtocolError");
  }
}

export class HandshakeError extends NautilusError {
  constructor(message: string) {
    super(message, undefined, "HandshakeError");
  }
}

const ERROR_NAMES: Record<number, string> = {
  3001: "ConnectionError",
  3002: "ConstraintViolationError",
  3003: "QueryTimeoutError",
  3004: "NotFoundError",
  3005: "UniqueConstraintError",
  3006: "ForeignKeyConstraintError",
  3007: "CheckConstraintError",
  3008: "NullConstraintError",
  3009: "DeadlockError",
  3010: "SerializationError",
  4002: "TransactionTimeoutError",
};

export function errorFromCode(code: number, message: string, data?: unknown): NautilusError {
  const name = ERROR_NAMES[code]
    ?? (code >= 1000 && code < 2000 ? "ValidationError"
      : code >= 2000 && code < 3000 ? "QueryError"
        : code >= 3000 && code < 4000 ? "DatabaseError"
          : code >= 4001 && code <= 4004 ? "TransactionError"
            : code >= 9000 && code < 10000 ? "InternalError" : "ProtocolError");
  return new NautilusError(`[${code}] ${message}`, { code, data }, name);
}
