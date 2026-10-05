// Native Next.js / Vercel runtime. Vite aliases this module to runtime.cloudflare.ts.
import { createClient } from "@libsql/client/web";
import { put, get, del } from "@vercel/blob";
import { libsqlDatabase } from "./libsql";
import type { Database, ObjectStore } from "./types";
let db: Database | undefined;
export function setting(name: string): string | undefined {
  return process.env[name];
}
export function getDatabase(): Database {
  if (db) return db;
  const url = process.env.TURSO_DATABASE_URL,
    authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken)
    throw new Error(
      "Database is not configured. Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel, then apply the database migrations.",
    );
  db = libsqlDatabase(createClient({ url, authToken }));
  return db;
}
export function getBucket(): ObjectStore {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID)
    throw new Error(
      "Document storage is not configured. Connect a private Vercel Blob store.",
    );
  return {
    async put(key, body, options) {
      return put(key, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: options?.httpMetadata?.contentType,
      });
    },
    async get(key) {
      const result = await get(key, { access: "private" });
      if (!result || result.statusCode !== 200) return null;
      return {
        body: result.stream,
        httpMetadata: { contentType: result.blob.contentType },
      };
    },
    async delete(key) {
      await del(key);
    },
  };
}
