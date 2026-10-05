// Exercises the built Next server with an ephemeral test password and no cloud credentials.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const password = randomBytes(32).toString("hex");
const port = 3210,
  origin = `http://127.0.0.1:${port}`;
const processEnv = {
  ...process.env,
  APP_ACCESS_PASSWORD: password,
  TURSO_DATABASE_URL: "",
  TURSO_AUTH_TOKEN: "",
  BLOB_READ_WRITE_TOKEN: "",
  BLOB_STORE_ID: "",
  OPENAI_API_KEY: "",
};
const server = spawn(
  process.execPath,
  ["scripts/run-next.mjs", "start", "--port", String(port)],
  { env: processEnv, stdio: ["ignore", "pipe", "pipe"] },
);
let logs = "";
server.stdout.on("data", (chunk) => {
  logs += chunk;
});
server.stderr.on("data", (chunk) => {
  logs += chunk;
});
try {
  let ready = false;
  for (let attempts = 0; attempts < 60; attempts++) {
    if (server.exitCode !== null)
      throw new Error(`Next.js server exited: ${logs}`);
    try {
      const r = await fetch(origin);
      if (r.status === 401) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "Next.js production server should be ready");
  const anon = await fetch(origin);
  assert.equal(anon.status, 401);
  assert.match(anon.headers.get("www-authenticate"), /Basic/);
  const forged = await fetch(origin + "/api/workspace", {
    headers: {
      "oai-authenticated-user-id": "owner",
      "oai-authenticated-user-email": "owner@example.test",
    },
  });
  assert.equal(forged.status, 401);
  const authorization =
    "Basic " + Buffer.from("admin:" + password).toString("base64");
  const home = await fetch(origin, { headers: { authorization } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /ClauseDesk/);
  const missing = await fetch(origin + "/api/workspace", {
    headers: { authorization },
  });
  assert.equal(missing.status, 503);
  assert.match((await missing.json()).error, /TURSO_DATABASE_URL/);
  const cross = await fetch(origin + "/api/workspace", {
    method: "POST",
    headers: { authorization, origin: "https://unrelated.example" },
  });
  assert.equal(cross.status, 403);
  const wrong = await fetch(origin + "/api/workspace", {
    headers: {
      authorization:
        "Basic " + Buffer.from("admin:incorrect").toString("base64"),
    },
  });
  assert.equal(wrong.status, 401);
  const worker = await fetch(origin + "/pdf.worker.min.mjs");
  assert.equal(worker.status, 200);
  console.log(
    "Native Next.js HTTP smoke passed: build serves UI, private access, forged-header rejection, missing-storage setup error, cross-origin rejection, PDF worker asset.",
  );
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
}
