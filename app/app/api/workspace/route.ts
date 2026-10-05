import {
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  MAX_REQUEST_BYTES,
} from "@/lib/contracts/limits";
import { database, bucket } from "@/db";
import {
  owner,
  failure,
  HttpError,
  loadWorkspace,
} from "@/lib/contracts/server";
import { documentSchema, verifySources } from "@/lib/contracts/validation";
import { extract } from "@/lib/contracts/ai";
import { demoItems, demoSections, demoTitle } from "@/lib/contracts/demo";
import type {
  DocumentData,
  ExtractedItem,
  Item,
  Section,
} from "@/lib/contracts/types";
export const maxDuration = 120;
export async function GET(req: Request) {
  try {
    return Response.json(await loadWorkspace(await owner(req)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  const uploaded: string[] = [];
  try {
    const user = await owner(req);
    const db = database();
    if (Number(req.headers.get("content-length")) > MAX_REQUEST_BYTES)
      throw new HttpError(
        413,
        `Files are too large. Use up to ${MAX_FILE_MB} MB per document.`,
      );
    const form = await req.formData();
    const mode = form.get("mode") === "demo" ? "demo" : "ai";
    const expected = String(form.get("expectedCurrentId") ?? "") || null;
    const ws = await loadWorkspace(user);
    if (ws.currentId !== expected)
      throw new HttpError(
        409,
        "A newer version was saved elsewhere. Refresh before uploading.",
      );
    if (mode === "demo" && ws.versions.some((v) => v.mode === "ai"))
      throw new HttpError(
        400,
        "Sample revisions are only available in a sample workspace.",
      );
    const revision = ws.versions.length + 1;
    let sections: Section[],
      extracted: ExtractedItem[],
      warnings: string[],
      contractName: string,
      policyName: string | null,
      title: string;
    let contract: DocumentData | undefined, policy: DocumentData | undefined;
    if (mode === "demo") {
      sections = structuredClone(demoSections);
      extracted = structuredClone(demoItems);
      title = demoTitle;
      contractName = "Northstar-services-agreement.txt";
      policyName = "Procurement-policy.txt";
      if (revision > 1) {
        sections = sections.map((s) =>
          s.id === "C4"
            ? {
                ...s,
                text: s.text.replace("15 October 2026", "22 October 2026"),
              }
            : s,
        );
        extracted = extracted.map((i) =>
          i.key === "report"
            ? {
                ...i,
                dateRule: { ...i.dateRule, date: "2026-10-22" },
                sources: [
                  {
                    sectionId: "C4",
                    quote: sections.find((s) => s.id === "C4")!.text,
                  },
                ],
              }
            : i,
        );
      }
      warnings = [
        "Illustrative sample with prewritten extraction. No AI call was made. Review decisions are yours.",
      ];
    } else {
      contract = documentSchema.parse(
        JSON.parse(String(form.get("contract") ?? "{}")),
      );
      const policyValue = form.get("policy");
      policy = policyValue
        ? documentSchema.parse(JSON.parse(String(policyValue)))
        : undefined;
      if (
        contract.sections.some((s) => s.document !== "contract") ||
        policy?.sections.some((s) => s.document !== "policy")
      )
        throw new HttpError(400, "Document labels do not match.");
      sections = [...contract.sections, ...(policy?.sections ?? [])];
      if (new Set(sections.map((s) => s.id)).size !== sections.length)
        throw new HttpError(400, "Source section identifiers must be unique.");
      const total = sections.reduce((n, s) => n + s.text.length, 0);
      if (total > 80000)
        throw new HttpError(
          413,
          "Text limit is 80,000 characters across both documents.",
        );
      if (contract.sections.reduce((n, s) => n + s.text.trim().length, 0) < 50)
        throw new HttpError(
          400,
          "A contract needs at least 50 readable characters. Scanned PDFs require OCR, which is not supported.",
        );
      title =
        String(form.get("title") ?? "")
          .trim()
          .slice(0, 180) || contract.name;
      contractName = contract.name;
      policyName = policy?.name ?? null;
      for (const field of ["contractFile", "policyFile"]) {
        const file = form.get(field);
        if (file instanceof File && file.size > MAX_FILE_BYTES)
          throw new HttpError(
            413,
            `File limit is ${MAX_FILE_MB} MB per document.`,
          );
      }
      const result = await extract(sections);
      extracted = result.items;
      warnings = result.warnings;
    }
    const id = crypto.randomUUID(),
      now = new Date().toISOString();
    const objects: Record<string, string | null> = {
      contract: null,
      policy: null,
    };
    for (const kind of ["contract", "policy"] as const) {
      if (kind === "policy" && !policyName) continue;
      const file = mode === "ai" ? form.get(`${kind}File`) : null;
      const key = `${encodeURIComponent(user)}/${id}/${kind}`;
      const text = sections
        .filter((s) => s.document === kind)
        .map((s) => `${s.label}\n${s.text}`)
        .join("\n\n");
      const body = file instanceof File ? await file.arrayBuffer() : text;
      await bucket().put(key, body, {
        httpMetadata: {
          contentType:
            file instanceof File
              ? file.type || "application/octet-stream"
              : "text/plain; charset=utf-8",
        },
      });
      uploaded.push(key);
      objects[kind] = key;
    }
    const items: Item[] = extracted.map((i) => {
      const valid = verifySources(i, sections);
      return {
        ...i,
        id: crypto.randomUUID(),
        status: "pending",
        stale: false,
        revision: 0,
        note: "",
        original: structuredClone(i),
        citationValid: valid,
        certainty: valid ? i.certainty : "uncertain",
        updatedAt: now,
      };
    });
    if (items.some((i) => !i.citationValid))
      warnings.push(
        "Some source quotes could not be verified. Those items cannot be approved until their citations are corrected.",
      );
    const guard = "EXISTS (SELECT 1 FROM versions WHERE id=?)";
    const statements = [
      db
        .prepare(
          "INSERT OR IGNORE INTO workspaces (owner,current_id,revision) VALUES (?,NULL,0)",
        )
        .bind(user),
      db
        .prepare(
          "INSERT INTO versions (id,owner,number,title,created_at,mode,contract_name,policy_name,sections,warnings,contract_key,policy_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM workspaces WHERE owner=? AND current_id IS ?)",
        )
        .bind(
          id,
          user,
          revision,
          title,
          now,
          mode,
          contractName,
          policyName,
          JSON.stringify(sections),
          JSON.stringify(warnings),
          objects.contract,
          objects.policy,
          user,
          expected,
        ),
      ...items.map((i) =>
        db
          .prepare(
            `INSERT INTO items (id,version_id,data,revision) SELECT ?,?,?,0 WHERE ${guard}`,
          )
          .bind(i.id, id, JSON.stringify({ ...i, versionId: id }), id),
      ),
      db
        .prepare(
          `UPDATE items SET data=json_set(data,'$.stale',json('true')),revision=revision+1 WHERE version_id IN (SELECT id FROM versions WHERE owner=? AND id!=?) AND json_extract(data,'$.status')='approved' AND ${guard}`,
        )
        .bind(user, id, id),
      db
        .prepare(
          `INSERT INTO history (id,owner,version_id,action,created_at) SELECT ?,?,?,?,? WHERE ${guard}`,
        )
        .bind(
          crypto.randomUUID(),
          user,
          id,
          `Uploaded version ${revision}${mode === "demo" ? " (sample)" : ""}; earlier approvals marked potentially stale`,
          now,
          id,
        ),
      db
        .prepare(
          `UPDATE workspaces SET current_id=?,revision=revision+1 WHERE owner=? AND ${guard}`,
        )
        .bind(id, user, id),
    ];
    const results = await db.batch(statements);
    if (!results[1].meta.changes)
      throw new HttpError(
        409,
        "Another version was saved while extraction ran. Refresh and try again.",
      );
    uploaded.length = 0;
    return Response.json(await loadWorkspace(user), { status: 201 });
  } catch (e) {
    if (uploaded.length)
      await Promise.allSettled(uploaded.map((key) => bucket().delete(key)));
    return failure(e);
  }
}
