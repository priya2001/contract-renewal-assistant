// Local development only. Creates sample versions; never contacts OpenAI.
import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:5173";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Smoke tests must run against loopback.");
const headers = { Cookie: "__sites_local_auth=1" };
const call = async (path, options = {}) => {
  const r = await fetch(base + path, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }
  return { status: r.status, data };
};
const get = () => call("/api/workspace");
const fresh = () => call("/api/workspace", { headers: { Cookie: "" } });
assert.equal((await fresh()).status, 401);
let ws = (await get()).data;
assert.ok(
  ws.versions.every((v) => v.mode === "demo"),
  "Use a fresh local database; do not test over real contracts.",
);
const form = new FormData();
form.set("mode", "demo");
form.set("expectedCurrentId", ws.currentId ?? "");
let r = await call("/api/workspace", { method: "POST", body: form });
assert.equal(r.status, 201);
ws = r.data;
const id = ws.currentId;
const getItem = (key) =>
  ws.versions.find((v) => v.id === id).items.find((i) => i.key === key);
const patch = async (i, status = "approved", override = {}) => {
  const {
    id,
    revision,
    note,
    status: oldStatus,
    stale,
    original,
    citationValid,
    updatedAt,
    versionId,
    ...item
  } = i;
  return call(`/api/items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revision,
      note,
      status,
      item: { ...item, ...override },
    }),
  });
};
let expiry = getItem("expiry");
r = await patch(expiry);
assert.equal(r.status, 200);
ws = r.data;
assert.equal((await patch(expiry)).status, 409, "stale write must be rejected");
r = await patch(getItem("notice"));
assert.equal(r.status, 200);
ws = r.data;
assert.equal(getItem("notice").status, "approved");
r = await patch(getItem("expiry"), "pending", {
  dateRule: { ...getItem("expiry").dateRule, date: "2027-01-31" },
});
assert.equal(r.status, 200);
ws = r.data;
assert.equal(
  getItem("notice").stale,
  true,
  "changing anchor invalidates dependent approval",
);
const report = getItem("report");
r = await patch(report, "approved", {
  description: "Reviewer-corrected description",
  sources: [{ sectionId: "C4", quote: "invented" }],
});
assert.equal(r.status, 400);
r = await patch(report, "pending", {
  description: "Reviewer-corrected description",
});
assert.equal(r.status, 200);
ws = r.data;
assert.notEqual(
  getItem("report").description,
  getItem("report").original.description,
);
r = await patch(getItem("security"), "rejected");
assert.equal(r.status, 200);
ws = r.data;
r = await patch(getItem("parties"));
assert.equal(r.status, 200);
ws = r.data;
const summary = await fetch(`${base}/api/summary`, { headers }).then((r) =>
  r.text(),
);
assert.match(summary, /Customer & service provider/);
assert.ok(!summary.includes("### Submit annual security assessment"));
const download = await fetch(`${base}/api/documents/${id}`, { headers });
assert.equal(download.status, 200);
assert.match(await download.text(), /Services Agreement/);
const rejectedOrigin = await call(`/api/items/${getItem("parties").id}`, {
  method: "PATCH",
  headers: { Origin: "https://unrelated.example" },
});
assert.equal(rejectedOrigin.status, 403);
const upload = new FormData();
upload.set("mode", "demo");
upload.set("expectedCurrentId", id);
r = await call("/api/workspace", { method: "POST", body: upload });
assert.equal(r.status, 201);
ws = r.data;
const old = ws.versions.find((v) => v.id === id);
assert.equal(old.items.find((i) => i.key === "parties").stale, true);
assert.equal(
  old.items.find((i) => i.key === "report").description,
  "Reviewer-corrected description",
);
assert.equal(
  (await patch(old.items[0])).status,
  409,
  "historical versions are read only",
);
assert.equal(
  (await call("/api/workspace", { method: "POST", body: upload })).status,
  409,
  "concurrent old version upload is rejected",
);
const ai = new FormData();
ai.set("expectedCurrentId", ws.currentId);
ai.set(
  "contract",
  JSON.stringify({
    name: "test.txt",
    sections: [
      {
        id: "C1",
        label: "Test",
        document: "contract",
        text: "This test agreement is between Acme and Northstar and expires on 31 December 2026.",
      },
    ],
  }),
);
if (!ws.aiConfigured) {
  assert.equal(
    (await call("/api/workspace", { method: "POST", body: ai })).status,
    503,
  );
  assert.equal((await get()).data.currentId, ws.currentId);
}
assert.ok(ws.history.some((e) => e.before && e.after));
console.log(
  "API smoke passed: auth, persistence, approvals, edits, rejection, citations, concurrency, dependent staleness, version staleness, originals, summary, and missing-key recovery.",
);
