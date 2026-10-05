import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  shiftDays,
  resolveDate,
  schedule,
} from "../lib/contracts/dates";
import { demoItems, demoSections } from "../lib/contracts/demo";
import { verifySources, extractionSchema } from "../lib/contracts/validation";
import { summaryText } from "../lib/contracts/summary";
import { textDocument } from "../lib/contracts/parse";
import type { Item, Version } from "../lib/contracts/types";
const items = (): Item[] =>
  demoItems.map((i) => ({
    ...structuredClone(i),
    id: i.key,
    status: "pending",
    stale: false,
    revision: 0,
    note: "",
    original: structuredClone(i),
    citationValid: true,
    updatedAt: "2026-10-05T00:00:00Z",
  }));
test("notice and reminder cross month/year boundaries deterministically", () => {
  const list = items();
  const notice = list.find((i) => i.key === "notice")!;
  assert.equal(resolveDate(notice, list).date, "2026-11-01");
  assert.equal(
    schedule(list, "2026-10-05").find((d) => d.item.key === "notice")!
      .reminderDate,
    "2026-10-25",
  );
  assert.equal(shiftDays("2026-01-01", -1), "2025-12-31");
});
test("leap day and invalid calendar dates", () => {
  assert.equal(shiftDays("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDays("2025-03-01", -1), "2025-02-28");
  assert.throws(() => parseDate("2026-02-29"));
  assert.throws(() => parseDate("2026-2-01"));
});
test("business and unspecified day rules never guess", () => {
  const list = items();
  const i = list.find((i) => i.key === "notice")!;
  for (const basis of ["business", "unspecified"] as const) {
    i.dateRule.basis = basis;
    assert.equal(resolveDate(i, list).date, null);
  }
});
test("anchor edits propagate, rejection stops calculation", () => {
  const list = items();
  const expiry = list.find((i) => i.key === "expiry")!;
  const notice = list.find((i) => i.key === "notice")!;
  expiry.dateRule.date = "2027-01-31";
  assert.equal(resolveDate(notice, list).date, "2026-12-02");
  expiry.status = "rejected";
  assert.equal(resolveDate(notice, list).date, null);
});
test("circular anchors fail closed", () => {
  const list = items();
  const expiry = list.find((i) => i.key === "expiry")!;
  const notice = list.find((i) => i.key === "notice")!;
  expiry.dateRule = { ...notice.dateRule, anchorId: "notice" };
  assert.match(resolveDate(notice, list).reason, /Circular/);
});
test("date is reviewed only when every anchor is approved and fresh", () => {
  const list = items();
  const notice = list.find((i) => i.key === "notice")!;
  const expiry = list.find((i) => i.key === "expiry")!;
  notice.status = "approved";
  assert.equal(
    schedule(list).find((d) => d.item.id === notice.id)!.reviewed,
    false,
  );
  expiry.status = "approved";
  assert.equal(
    schedule(list).find((d) => d.item.id === notice.id)!.reviewed,
    true,
  );
  expiry.stale = true;
  assert.equal(
    schedule(list).find((d) => d.item.id === notice.id)!.reviewed,
    false,
  );
});
test("source verification detects fabricated or misattributed quotes", () => {
  const i = structuredClone(demoItems[0]);
  assert.equal(verifySources(i, demoSections), true);
  i.sources[0].quote = "The Vendor must pay $5000";
  assert.equal(verifySources(i, demoSections), false);
  i.sources = [{ sectionId: "MISSING", quote: demoSections[0].text }];
  assert.equal(verifySources(i, demoSections), false);
});
test("monthly rules handle year rollover and preserve unclear month end", () => {
  const i = items()[0];
  i.dateRule = { ...i.dateRule, type: "monthly", dayOfMonth: 5 };
  assert.equal(resolveDate(i, [i], "2026-12-06").date, "2027-01-05");
  assert.equal(resolveDate(i, [i], "2026-12-05").date, "2026-12-05");
  i.dateRule.dayOfMonth = 31;
  assert.equal(resolveDate(i, [i]).date, null);
});
test("schema rejects duplicate item keys, invalid dates, and oversized offsets", () => {
  assert.throws(() =>
    extractionSchema.parse({
      items: [demoItems[0], demoItems[0]],
      warnings: [],
    }),
  );
  const i = structuredClone(demoItems[2]);
  i.dateRule.date = "2026-13-01";
  assert.throws(() => extractionSchema.parse({ items: [i], warnings: [] }));
  i.dateRule = { ...demoItems[4].dateRule, days: 99999 };
  assert.throws(() => extractionSchema.parse({ items: [i], warnings: [] }));
});
test("summary excludes rejected and stale facts; uncertain approvals remain labelled", () => {
  const list = items();
  list[0].status = "rejected";
  list[2].status = "approved";
  list[2].stale = true;
  list[7].status = "approved";
  const v: Version = {
    id: "v1",
    number: 1,
    title: "Test",
    createdAt: "2026-10-05",
    mode: "demo",
    contractName: "test.txt",
    policyName: null,
    items: list,
    sections: demoSections,
    warnings: [],
  };
  const summary = summaryText(v, "v1");
  const approved = summary.split("## Pending")[0];
  assert.ok(!approved.includes("### Customer"));
  assert.ok(!approved.includes("### Initial contract"));
  assert.match(approved, /Uncertain interpretation \(reviewed\)/);
  assert.match(approved, /Clarification question:/);
  assert.match(approved, /Source \[C6\]/);
});
test("pasted text has stable source IDs and keeps policy provenance", () => {
  const doc = textDocument(
    "Section 1\nHello.\n\nSection 2\nWorld.",
    "test.txt",
    "policy",
  );
  assert.deepEqual(
    doc.sections.map((s) => s.id),
    ["P1", "P2"],
  );
  assert.equal(doc.sections[1].document, "policy");
  assert.throws(() => textDocument("   ", "empty", "contract"));
});
