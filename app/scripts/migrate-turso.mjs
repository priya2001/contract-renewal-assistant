import { createClient } from "@libsql/client";
import { readFile, readdir } from "node:fs/promises";
const url = process.env.TURSO_DATABASE_URL;
if (!url || (!url.startsWith("file:") && !process.env.TURSO_AUTH_TOKEN))
  throw new Error(
    "Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before running migrations.",
  );
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  await client.execute(
    "CREATE TABLE IF NOT EXISTS __clausedesk_migrations (name TEXT PRIMARY KEY NOT NULL)",
  );
  const applied = new Set(
    (await client.execute("SELECT name FROM __clausedesk_migrations")).rows.map(
      (r) => r.name,
    ),
  );
  for (const name of (await readdir("drizzle"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (applied.has(name)) continue;
    const source = await readFile(`drizzle/${name}`, "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await client.batch(
      [
        ...statements,
        {
          sql: "INSERT INTO __clausedesk_migrations (name) VALUES (?)",
          args: [name],
        },
      ],
      "write",
    );
    console.log(`Applied ${name}`);
  }
  console.log("Database schema is up to date.");
} finally {
  client.close();
}
