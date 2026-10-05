import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const config = "dist/server/wrangler.json";
try {
  await readFile(config);
} catch {
  throw new Error("Run npm run build before npm run db:migrate.");
}
function run(args) {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      config,
      "--persist-to",
      ".wrangler/state",
      ...args,
    ],
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
run([
  "--command",
  "CREATE TABLE IF NOT EXISTS __clausedesk_migrations (name TEXT PRIMARY KEY NOT NULL)",
]);
const raw = run([
  "--command",
  "SELECT name FROM __clausedesk_migrations",
  "--json",
]);
const applied = new Set(JSON.parse(raw)[0].results.map((r) => r.name));
for (const file of (await readdir("drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  if (applied.has(file)) continue;
  const sql = await readFile(resolve("drizzle", file), "utf8");
  // Wrangler batches this file; the record is committed with the schema change.
  const temporary = resolve(".sites-runtime", "migration.sql");
  await writeFile(
    temporary,
    sql +
      `\nINSERT INTO __clausedesk_migrations (name) VALUES ('${file.replaceAll("'", "''")}');\n`,
  );
  run(["--file", temporary]);
  console.log(`Applied ${file}`);
}
console.log("Local database is up to date.");
