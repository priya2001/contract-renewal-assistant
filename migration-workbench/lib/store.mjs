import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  validateDataset,
  validatePlan,
  dryRun,
  hash,
  requireThat,
  keyOf,
  totals,
  canonical,
} from "./engine.mjs";
const fresh = () => ({
  revision: 0,
  dataset: null,
  plans: [],
  previews: [],
  runs: [],
  target: [],
  targetRevision: 0,
  events: [],
});
export class Store {
  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS workspace(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)",
    );
    this.db
      .prepare("INSERT OR IGNORE INTO workspace VALUES(1,?)")
      .run(JSON.stringify(fresh()));
  }
  close() {
    this.db.close();
  }
  read() {
    return JSON.parse(
      this.db.prepare("SELECT data FROM workspace WHERE id=1").get().data,
    );
  }
  change(expected, action, fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const s = this.read();
      requireThat(
        Number.isInteger(expected) && expected === s.revision,
        "Workspace changed. Refresh before trying again.",
        409,
      );
      const result = fn(s);
      s.revision++;
      this.db
        .prepare("UPDATE workspace SET data=? WHERE id=1")
        .run(JSON.stringify(s));
      this.db.exec("COMMIT");
      return { state: s, result };
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  event(s, type, details) {
    s.events.push({
      id: randomUUID(),
      at: new Date().toISOString(),
      type,
      details,
    });
  }
  dataset(data, rev) {
    validateDataset(data);
    return this.change(rev, "dataset", (s) => {
      requireThat(
        !s.dataset,
        "This workbench already has its bounded dataset. Start a separate data file for another assignment.",
        409,
      );
      s.dataset = { ...data, fingerprint: hash(data) };
      this.event(s, "dataset_imported", {
        source: data.source.name,
        target: data.target.name,
        records: data.records.length,
        fingerprint: s.dataset.fingerprint,
      });
    });
  }
  save(plan, rev, origin = "manual", trace = []) {
    return this.change(rev, "plan", (s) => {
      requireThat(s.dataset, "Import a dataset first.");
      const errors = validatePlan(s.dataset, plan);
      requireThat(!errors.length, errors.join(" "));
      const p = {
        id: randomUUID(),
        version: s.plans.length + 1,
        createdAt: new Date().toISOString(),
        content: plan,
        hash: hash({ plan, dataset: s.dataset.fingerprint }),
        origin,
        trace,
        status: "draft",
        approval: null,
      };
      s.plans.push(p);
      this.event(s, "plan_version_created", {
        planId: p.id,
        version: p.version,
        origin,
        hash: p.hash,
      });
      return p.id;
    });
  }
  preview(planId, rev) {
    return this.change(rev, "dry_run", (s) => {
      const p = s.plans.find((p) => p.id === planId);
      requireThat(p, "Plan not found.", 404);
      const report = dryRun(
        s.dataset,
        p.content,
        s.target.map((t) => t.data),
      );
      const preview = {
        id: randomUUID(),
        at: new Date().toISOString(),
        planId,
        planHash: p.hash,
        targetRevision: s.targetRevision,
        ...report,
      };
      s.previews.push(preview);
      this.event(s, "dry_run", {
        planId,
        previewId: preview.id,
        counts: report.counts,
      });
      return preview.id;
    });
  }
  approve(planId, previewId, reviewer, note, rev) {
    requireThat(
      typeof reviewer === "string" &&
        reviewer.trim().length >= 2 &&
        reviewer.length <= 100,
      "Enter your reviewer name (2–100 characters).",
    );
    requireThat(
      typeof note === "string" &&
        note.trim().length >= 5 &&
        note.length <= 2000,
      "Record your review decision (5–2,000 characters), including any accepted risks.",
    );
    return this.change(rev, "approval", (s) => {
      const p = s.plans.at(-1);
      requireThat(
        p?.id === planId,
        "Only the latest plan version can be approved.",
        409,
      );
      requireThat(
        p.status === "draft",
        "This version already has a decision.",
        409,
      );
      const preview = s.previews.find(
        (r) => r.id === previewId && r.planId === planId,
      );
      requireThat(
        preview &&
          preview.planHash === p.hash &&
          preview.targetRevision === s.targetRevision,
        "Run a fresh dry run before approval.",
        409,
      );
      requireThat(
        preview.counts.accepted > 0,
        "No valid records to migrate. Revise the plan first.",
      );
      p.status = "approved";
      p.approval = {
        reviewer: reviewer.trim(),
        note: note.trim(),
        at: new Date().toISOString(),
        previewId,
        planHash: p.hash,
      };
      this.event(s, "plan_approved", {
        planId,
        ...p.approval,
        accepted: preview.counts.accepted,
        quarantined: preview.counts.rejected,
      });
    });
  }
  reject(planId, note, rev) {
    return this.change(rev, "reject", (s) => {
      const p = s.plans.at(-1);
      requireThat(
        p?.id === planId && p.status === "draft",
        "Only the latest draft can be rejected.",
        409,
      );
      requireThat(
        typeof note === "string" &&
          note.trim().length >= 5 &&
          note.length <= 2000,
        "Give a rejection reason.",
      );
      p.status = "rejected";
      this.event(s, "plan_rejected", { planId, note });
    });
  }
  execute(planId, rev) {
    return this.change(rev, "execution", (s) => {
      const existing = s.runs.find((r) => r.planId === planId);
      if (existing) {
        requireThat(
          existing.status === "completed",
          "A rolled-back run cannot be retried. Save and approve a new plan version.",
          409,
        );
        this.event(s, "migration_retried", {
          runId: existing.id,
          inserted: 0,
          skipped: existing.counts.accepted,
        });
        return existing.id;
      }
      const p = s.plans.at(-1);
      requireThat(
        p?.id === planId &&
          p.status === "approved" &&
          p.approval?.planHash === p.hash,
        "Execution requires approval of the latest exact plan version.",
        409,
      );
      const preview = s.previews.find((r) => r.id === p.approval.previewId);
      requireThat(
        preview.targetRevision === s.targetRevision,
        "Mock target changed after approval. Save a new version and review a fresh dry run.",
        409,
      );
      const check = dryRun(
        s.dataset,
        p.content,
        s.target.map((t) => t.data),
      );
      requireThat(
        hash(check) ===
          hash({
            counts: preview.counts,
            totals: preview.totals,
            results: preview.results,
          }),
        "Dry-run evidence has changed.",
        409,
      );
      const run = {
        id: randomUUID(),
        planId,
        planVersion: p.version,
        planHash: p.hash,
        previewId: preview.id,
        status: "completed",
        at: new Date().toISOString(),
        counts: preview.counts,
        before: s.target.length,
        expectedTotals: preview.totals,
        expectedHash: hash(
          preview.results
            .filter((r) => r.status === "accepted")
            .map((r) => r.output),
        ),
        rowCount: preview.counts.accepted,
      };
      for (const row of preview.results.filter((r) => r.status === "accepted"))
        s.target.push({
          key: keyOf(s.dataset, row.output),
          sourceIndex: row.index,
          runId: run.id,
          data: row.output,
        });
      run.after = s.target.length;
      s.targetRevision++;
      s.runs.push(run);
      this.event(s, "migration_executed", {
        runId: run.id,
        planId,
        inserted: run.rowCount,
        quarantined: run.counts.rejected,
      });
      return run.id;
    });
  }
  retry(runId, rev) {
    const run = this.read().runs.find((r) => r.id === runId);
    requireThat(run, "Run not found.", 404);
    return this.execute(run.planId, rev);
  }
  rollback(runId, rev) {
    return this.change(rev, "rollback", (s) => {
      const run = s.runs.find((r) => r.id === runId);
      requireThat(run, "Run not found.", 404);
      if (run.status === "rolled_back") {
        this.event(s, "rollback_retried", { runId, removed: 0 });
        return runId;
      }
      const own = s.target.filter((r) => r.runId === runId);
      requireThat(
        hash(own.map((r) => r.data)) === run.expectedHash,
        "Target rows differ from the execution snapshot; rollback stopped.",
        409,
      );
      s.target = s.target.filter((r) => r.runId !== runId);
      s.targetRevision++;
      run.status = "rolled_back";
      run.rolledBackAt = new Date().toISOString();
      this.event(s, "migration_rolled_back", {
        runId,
        removed: own.length,
        remaining: s.target.length,
      });
      return runId;
    });
  }
  reconcile(state = this.read()) {
    return state.runs.map((run) => {
      const rows = state.target
          .filter((t) => t.runId === run.id)
          .map((t) => t.data),
        actualTotals = totals(state.dataset, rows);
      const expected = run.status === "rolled_back" ? 0 : run.rowCount;
      return {
        runId: run.id,
        planVersion: run.planVersion,
        status: run.status,
        source: run.counts.source,
        accepted: run.counts.accepted,
        quarantined: run.counts.rejected,
        expectedTarget: expected,
        actualTarget: rows.length,
        expectedTotals:
          run.status === "rolled_back"
            ? totals(state.dataset, [])
            : run.expectedTotals,
        actualTotals,
        balanced:
          run.counts.source === run.counts.accepted + run.counts.rejected &&
          rows.length === expected &&
          (run.status === "rolled_back" || hash(rows) === run.expectedHash) &&
          canonical(actualTotals) ===
            canonical(
              run.status === "rolled_back"
                ? totals(state.dataset, [])
                : run.expectedTotals,
            ),
      };
    });
  }
}
