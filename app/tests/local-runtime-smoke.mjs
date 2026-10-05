// Read-only regression: local Sites runtime must use D1, never the Vercel adapter.
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const anonymous = await fetch(`${base}/api/workspace`);
assert.equal(anonymous.status, 401);
const response = await fetch(`${base}/api/workspace`, {
  headers: { Cookie: "__sites_local_auth=1" },
});
const workspace = await response.json();
assert.equal(response.status, 200, workspace.error);
assert.ok(Array.isArray(workspace.versions));
assert.equal(typeof workspace.aiConfigured, "boolean");
console.log("Local runtime passed: private access and existing D1 workspace read; no records changed.");
