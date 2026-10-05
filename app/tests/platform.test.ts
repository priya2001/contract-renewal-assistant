import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { libsqlDatabase } from "../lib/platform/libsql";
import { validBasicAuth } from "../lib/platform/basic-auth";
import { readFile } from "node:fs/promises";
const password = "test-only-long-random-password-12345";
const header = (name: string, pass: string) =>
  "Basic " + btoa(name + ":" + pass);
test("Vercel authentication fails closed for missing, short and incorrect credentials", async () => {
  assert.equal(await validBasicAuth(null, password), false);
  assert.equal(
    await validBasicAuth(header("admin", password), undefined),
    false,
  );
  assert.equal(await validBasicAuth(header("admin", "short"), "short"), false);
  assert.equal(await validBasicAuth(header("user", password), password), false);
  assert.equal(
    await validBasicAuth(header("admin", password + "wrong"), password),
    false,
  );
  assert.equal(await validBasicAuth("Basic #invalid", password), false);
  assert.equal(await validBasicAuth(header("admin", password), password), true);
});
test("libSQL adapter supports bound queries, atomic D1-style batches, and changes() audit guards", async () => {
  const client = createClient({ url: "file::memory:" });
  const db = libsqlDatabase(client);
  try {
    const sql = await readFile("drizzle/0000_melodic_mathemanic.sql", "utf8");
    await client.batch(
      sql.split("--> statement-breakpoint").filter((s) => s.trim()),
      "write",
    );
    await client.execute(
      "INSERT INTO workspaces (owner,current_id,revision) VALUES ('owner','v1',0)",
    );
    await client.execute({
      sql: "INSERT INTO items (id,version_id,data,revision) VALUES (?,?,?,?)",
      args: ["item", "v1", JSON.stringify({ status: "pending" }), 0],
    });
    const update = (revision: number, event: string) =>
      db.batch([
        db
          .prepare(
            "UPDATE items SET revision=revision+1,data=? WHERE id=? AND revision=?",
          )
          .bind(JSON.stringify({ status: "approved" }), "item", revision),
        db
          .prepare(
            "INSERT INTO history (id,owner,version_id,action,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
          )
          .bind(event, "owner", "v1", "approved", "2026-10-05"),
      ]);
    const result = await update(0, "first");
    assert.equal(result[0].meta.changes, 1);
    assert.equal(result[1].meta.changes, 1);
    const conflict = await update(0, "stale");
    assert.equal(conflict[0].meta.changes, 0);
    assert.equal(conflict[1].meta.changes, 0);
    const row = await db
      .prepare("SELECT revision FROM items WHERE id=?")
      .bind("item")
      .first<{ revision: number }>();
    assert.equal(row?.revision, 1);
    assert.equal(
      (await db.prepare("SELECT id FROM history").all()).results.length,
      1,
    );
    assert.equal(
      await db
        .prepare("SELECT id FROM items WHERE id=?")
        .bind("absent")
        .first(),
      null,
    );
    // Batch rollback must undo every earlier statement if a later statement fails.
    await assert.rejects(
      db.batch([
        db.prepare("UPDATE items SET revision=99 WHERE id=?").bind("item"),
        db.prepare("INSERT INTO non_existent_table VALUES (1)"),
      ]),
    );
    assert.equal(
      (
        await db
          .prepare("SELECT revision FROM items WHERE id=?")
          .bind("item")
          .first<{ revision: number }>()
      )?.revision,
      1,
    );
    // SQLite JSON behavior used by stale approval flags is preserved.
    await db.batch([
      db
        .prepare(
          "UPDATE items SET data=json_set(data,'$.stale',json('true')) WHERE id=?",
        )
        .bind("item"),
    ]);
    const updated = await db
      .prepare("SELECT data FROM items WHERE id=?")
      .bind("item")
      .first<{ data: string }>();
    assert.equal(JSON.parse(updated!.data).stale, true);
  } finally {
    client.close();
  }
});
test("libSQL adapter keeps competing optimistic updates and audit events consistent", async () => {
  const client = createClient({ url: "file::memory:" });
  const db = libsqlDatabase(client);
  try {
    await client.batch([
      "CREATE TABLE counter(id TEXT PRIMARY KEY,n INTEGER)",
      "CREATE TABLE audit(id TEXT PRIMARY KEY)",
      "INSERT INTO counter VALUES ('counter',0)",
    ]);
    const save = (id: string) =>
      db.batch([
        db.prepare("UPDATE counter SET n=1 WHERE n=0"),
        db.prepare("INSERT INTO audit SELECT ? WHERE changes()=1").bind(id),
      ]);
    const results = await Promise.all([save("a"), save("b")]);
    assert.equal(
      results.reduce((n, r) => n + r[0].meta.changes, 0),
      1,
    );
    assert.equal(
      (await db.prepare("SELECT id FROM audit").all()).results.length,
      1,
    );
  } finally {
    client.close();
  }
});
