import "server-only";

import { NautilusRuntimeClient } from "@/lib/nautilus/runtime/client";
import { resolveSchemaPath } from "@/lib/nautilus/schema";

export type { RawQueryRunner as NautilusDelegate } from "@/lib/nautilus/runtime/client";

declare global {
  var __nautilusDbPromise: Promise<NautilusRuntimeClient> | undefined;
}

export async function getDb(): Promise<NautilusRuntimeClient> {
  if (!globalThis.__nautilusDbPromise) {
    globalThis.__nautilusDbPromise = (async () => {
      const db = new NautilusRuntimeClient(resolveSchemaPath());
      await db.connect();
      return db;
    })().catch((error) => {
      globalThis.__nautilusDbPromise = undefined;
      throw error;
    });
  }

  return globalThis.__nautilusDbPromise;
}
