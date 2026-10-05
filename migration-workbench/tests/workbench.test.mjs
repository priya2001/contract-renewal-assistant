import test from "node:test";
import http from "node:http";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateDataset,
  validatePlan,
  dryRun,
  propose,
  transform,
  hash,
  MAX_RECORDS,
} from "../lib/engine.mjs";
import { Store } from "../lib/store.mjs";
import { inspectionSession, proposeWithAI, TOOLS } from "../lib/agent.mjs";
import { createApp } from "../server.mjs";
const fixture = () =>
  JSON.parse(
    readFileSync(
      new URL("../examples/customers.json", import.meta.url),
      "utf8",
    ),
  );
function initialized(path) {
  const s = new Store(path);
  s.dataset(fixture(), 0);
  s.save(propose(s.read().dataset), 1);
  return s;
}
function approved(s) {
  const p = s.read().plans.at(-1);
  s.preview(p.id, s.read().revision);
  s.approve(
    p.id,
    s.read().previews.at(-1).id,
    "Priya",
    "Reviewed invalid rows and accepted the quarantine policy.",
    s.read().revision,
  );
  return p;
}
test("sample dry run is deterministic, quarantines four rows and retains field evidence", () => {
  const d = fixture(),
    p = propose(d);
  const a = dryRun(d, p),
    b = dryRun(d, p);
  assert.equal(hash(a), hash(b));
  assert.deepEqual(a.counts, {
    source: 12,
    transformed: 10,
    accepted: 8,
    rejected: 4,
  });
  assert.equal(a.totals.balance, 700);
  assert.equal(a.results[0].output.email, "aditi@example.test");
  assert.deepEqual(
    a.results.filter((r) => r.errors.length).map((r) => r.index),
    [4, 5, 7, 8],
  );
  const e = a.results[3].errors[0];
  assert.equal(e.original, "forty");
  assert.equal(e.field, "age");
  assert.equal(e.rule, "to_integer");
});
test("strict transformations do not guess, truncate, overflow or execute arbitrary code", () => {
  for (const value of ["", "12cats", "Infinity", "1e9", true])
    assert.throws(() => transform(value, "to_number"));
  for (const value of ["2.5", "1000000001"])
    assert.throws(() => transform(value, "to_integer"));
  for (const value of ["2025-02-29", "04/05/2025"])
    assert.throws(() => transform(value, "iso_date"));
  assert.equal(transform("2024-02-29", "iso_date"), "2024-02-29");
  assert.throws(() => transform("x", "eval"));
  assert.equal(transform("false", "to_boolean"), false);
  assert.throws(() => transform("perhaps", "to_boolean"));
});
test("input bounds, unsafe keys, schema constraints and missing mappings fail closed", () => {
  const d = fixture();
  assert.equal(validateDataset(d), d);
  const huge = fixture();
  huge.records = Array.from({ length: MAX_RECORDS + 1 }, () => huge.records[0]);
  assert.throws(() => validateDataset(huge));
  const bad = fixture();
  bad.target.primaryKey = "age_text";
  assert.throws(() => validateDataset(bad));
  const unknown = fixture();
  unknown.records[0].unexpected = "x";
  assert.throws(() => validateDataset(unknown));
  const nested = fixture();
  nested.records[0].name = { nested: "x" };
  assert.throws(() => validateDataset(nested));
  const p = propose(d);
  p.mappings[0].transforms = ["eval"];
  assert.ok(validatePlan(d, p).length);
  assert.throws(() => dryRun(d, p));
});
test("missing required values, source mismatches and explicit constants are validated", () => {
  const d = fixture();
  d.records = [{ ...d.records[0], name: null, age_text: 28 }];
  const r = dryRun(d, propose(d));
  assert.equal(r.counts.rejected, 1);
  assert.ok(r.results[0].errors.some((e) => e.stage === "source"));
  const p = propose(fixture());
  p.mappings.find((m) => m.target === "active").source = null;
  p.mappings.find((m) => m.target === "active").constant = true;
  assert.equal(dryRun(fixture(), p).results[0].output.active, true);
});
test("execution requires exact latest approval and fresh dry-run snapshot", () => {
  const s = initialized();
  const p = s.read().plans[0];
  assert.throws(() => s.execute(p.id, 2), /approval/);
  assert.throws(
    () => s.approve(p.id, "none", "A B", "reviewed", 2),
    /fresh dry run/,
  );
  approved(s);
  s.save(p.content, s.read().revision);
  assert.throws(() => s.execute(p.id, s.read().revision), /latest/);
  assert.equal(s.read().target.length, 0);
  s.close();
});
test("execution, duplicate retry, reconciliation and rollback preserve immutable evidence", () => {
  const s = initialized();
  const p = approved(s);
  const before = s.read().previews[0];
  s.execute(p.id, s.read().revision);
  let data = s.read();
  const run = data.runs[0];
  assert.equal(data.target.length, 8);
  assert.equal(s.reconcile()[0].balanced, true);
  for (let i = 0; i < 3; i++) s.retry(run.id, s.read().revision);
  assert.equal(s.read().target.length, 8);
  assert.equal(
    s.read().events.filter((e) => e.type === "migration_retried").length,
    3,
  );
  s.rollback(run.id, s.read().revision);
  assert.equal(s.read().target.length, 0);
  assert.equal(s.reconcile()[0].balanced, true);
  assert.equal(s.reconcile()[0].expectedTarget, 0);
  assert.deepEqual(s.read().previews[0], before);
  s.rollback(run.id, s.read().revision);
  assert.throws(() => s.retry(run.id, s.read().revision), /rolled-back/);
  s.close();
});
test("duplicate keys in existing target are quarantined across plan versions", () => {
  const s = initialized();
  const p = approved(s);
  s.execute(p.id, s.read().revision);
  s.save(p.content, s.read().revision);
  const next = s.read().plans.at(-1);
  s.preview(next.id, s.read().revision);
  assert.equal(s.read().previews.at(-1).counts.accepted, 0);
  assert.throws(
    () =>
      s.approve(
        next.id,
        s.read().previews.at(-1).id,
        "Priya",
        "reviewed risks",
        s.read().revision,
      ),
    /No valid/,
  );
  s.close();
});
test("optimistic locking rejects stale writes; transaction exceptions leave state unchanged", () => {
  const s = initialized();
  const old = s.read();
  assert.throws(() => s.save(old.plans[0].content, 0), /changed/);
  assert.throws(() =>
    s.change(old.revision, "test", (state) => {
      state.target.push({ bad: true });
      throw Error("forced failure");
    }),
  );
  assert.deepEqual(s.read(), old);
  s.close();
});
test("persistent plans, approval and rows survive process/store restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "transit-"));
  try {
    const path = join(dir, "db.sqlite");
    let s = initialized(path);
    const p = approved(s);
    s.execute(p.id, s.read().revision);
    s.close();
    s = new Store(path);
    assert.equal(s.read().target.length, 8);
    assert.ok(s.read().plans[0].approval);
    assert.ok(s.reconcile()[0].balanced);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("rollback only removes owned rows, and later runs reconcile independently", () => {
  const s = initialized();
  const p = approved(s);
  s.execute(p.id, s.read().revision);
  const a = s.read().runs[0];
  const revised = structuredClone(p.content);
  revised.mappings[0] = {
    target: "customer_id",
    source: null,
    constant: "OTHER",
    transforms: ["copy"],
  };
  s.save(revised, s.read().revision);
  const next = approved(s);
  s.execute(next.id, s.read().revision);
  assert.equal(s.read().target.length, 9);
  s.rollback(a.id, s.read().revision);
  assert.equal(s.read().target.length, 1);
  assert.equal(s.read().target[0].data.customer_id, "OTHER");
  assert.ok(s.reconcile().every((r) => r.balanced));
  s.close();
});
test("AI inspection tools cannot approve, execute, or submit unvalidated content", () => {
  const d = fixture(),
    s = inspectionSession(d),
    p = propose(d);
  assert.throws(() => s.call("execute"));
  assert.throws(() => s.call("submit_plan", { plan_json: JSON.stringify(p) }));
  for (const n of [
    "inspect_schemas",
    "inspect_samples",
    "inspect_transformations",
  ])
    s.call(n);
  s.call("validate_plan", { plan_json: JSON.stringify(p) });
  const altered = structuredClone(p);
  altered.summary = "Changed";
  assert.throws(() =>
    s.call("submit_plan", { plan_json: JSON.stringify(altered) }),
  );
  assert.deepEqual(
    s.call("submit_plan", { plan_json: JSON.stringify(p) }).submitted,
    p,
  );
  assert.ok(
    TOOLS.every((t) => !["execute", "approve", "rollback"].includes(t.name)),
  );
});
test("AI orchestration uses only supplied tools and returns a validated draft", async () => {
  const d = fixture(),
    p = propose(d);
  const sequence = [
    "inspect_schemas",
    "inspect_samples",
    "inspect_transformations",
    "validate_plan",
    "submit_plan",
  ];
  let i = 0;
  const mock = async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(options.body);
    assert.equal(body.store, false);
    assert.equal(body.tools.length, 5);
    const name = sequence[i++];
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output: [
          {
            type: "function_call",
            name,
            call_id: String(i),
            arguments: JSON.stringify(
              name.endsWith("plan") ? { plan_json: JSON.stringify(p) } : {},
            ),
          },
        ],
      }),
    };
  };
  const result = await proposeWithAI(d, {
    key: "test-not-real",
    fetcher: mock,
  });
  assert.deepEqual(result.plan, p);
  assert.equal(result.trace.length, 5);
});
test("HTTP server blocks cross-origin/CSRF writes and supports end-to-end approved migration", async () => {
  const { server, store } = await createApp({ dbPath: ":memory:" });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    let state = await (await fetch(base + "/api/state")).json();
    assert.equal(
      (
        await fetch(base + "/api/dataset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    const post = async (path, data) => {
      const r = await fetch(base + "/api/" + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Workbench-Token": state.csrf,
        },
        body: JSON.stringify({ revision: state.revision, ...data }),
      });
      const out = await r.json();
      if (r.ok) state = out;
      return { status: r.status, data: out };
    };
    const cross = await fetch(base + "/api/dataset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workbench-Token": state.csrf,
        Origin: "https://evil.example",
      },
      body: "{}",
    });
    assert.equal(cross.status, 403);
    assert.equal((await post("dataset", { dataset: fixture() })).status, 200);
    await post("propose", { mode: "sample" });
    const id = state.plans[0].id;
    assert.equal((await post("execute", { planId: id })).status, 409);
    await post("dry-run", { planId: id });
    await post("approve", {
      planId: id,
      previewId: state.previews[0].id,
      reviewer: "Priya",
      note: "Reviewed all quarantine evidence.",
    });
    await post("execute", { planId: id });
    assert.equal(state.target.length, 8);
    await post("retry", { runId: state.runs[0].id });
    assert.equal(state.target.length, 8);
    await post("rollback", { runId: state.runs[0].id });
    assert.equal(state.target.length, 0);
    assert.ok(state.reconciliation[0].balanced);
    const exported = await (await fetch(base + "/api/export")).json();
    assert.equal(exported.csrf, undefined);
    assert.ok(exported.events.length);
    const hostStatus = await new Promise((resolve, reject) => {
      const q = http.get(
        base + "/api/state",
        { headers: { host: "evil.example" } },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      );
      q.on("error", reject);
    });
    assert.equal(hostStatus, 403);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});

test("a full 1,000-row bounded dataset validates and reconciles without count loss", () => {
  const d = fixture();
  d.records = Array.from({ length: 1000 }, (_, i) => ({
    ...d.records[0],
    legacy_id: `C-${i}`,
  }));
  validateDataset(d);
  const r = dryRun(d, propose(d));
  assert.equal(r.counts.accepted, 1000);
  assert.equal(r.totals.balance, 120500);
});

test("target changes after approval invalidate execution; rejected plans cannot execute", () => {
  const s = initialized();
  const p = approved(s);
  s.execute(p.id, s.read().revision);
  const revised = structuredClone(p.content);
  revised.mappings[0] = {
    target: "customer_id",
    source: null,
    constant: "OTHER",
    transforms: ["copy"],
  };
  s.save(revised, s.read().revision);
  const next = approved(s);
  s.rollback(s.read().runs[0].id, s.read().revision);
  assert.throws(
    () => s.execute(next.id, s.read().revision),
    /changed after approval/,
  );
  s.save(revised, s.read().revision);
  const rejected = s.read().plans.at(-1);
  s.reject(
    rejected.id,
    "Mapping assumptions need clarification.",
    s.read().revision,
  );
  assert.throws(() => s.execute(rejected.id, s.read().revision), /approval/);
  s.close();
});
