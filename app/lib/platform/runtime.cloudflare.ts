import { env } from "cloudflare:workers";
import type { Database, ObjectStore } from "./types";
export function setting(name: string): string | undefined {
  return (
    (env as unknown as Record<string, string | undefined>)[name] ||
    process.env[name]
  );
}
export function getDatabase(): Database {
  if (!env.DB)
    throw new Error(
      "Database is unavailable. Apply the local setup steps in README.",
    );
  return env.DB;
}
export function getBucket(): ObjectStore {
  if (!env.BUCKET) throw new Error("Document storage is unavailable.");
  return env.BUCKET as unknown as ObjectStore;
}
