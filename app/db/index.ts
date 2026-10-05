import { env } from "cloudflare:workers";
export function database() {
  if (!env.DB)
    throw new Error(
      "Database is unavailable. Apply the local setup steps in README.",
    );
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new Error("Document storage is unavailable.");
  return env.BUCKET;
}
