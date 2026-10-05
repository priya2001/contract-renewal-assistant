import { z } from "zod";
import { database } from "@/db";
import {
  extractionItemSchema,
  verifySources,
} from "@/lib/contracts/validation";
import {
  failure,
  owner,
  HttpError,
  loadWorkspace,
} from "@/lib/contracts/server";
import type { Item } from "@/lib/contracts/types";
const patch = z
  .object({
    revision: z.number().int(),
    status: z.enum(["pending", "approved", "rejected"]),
    note: z.string().max(3000),
    item: extractionItemSchema,
  })
  .strict();
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await owner(req);
    const { id } = await params;
    const input = patch.parse(await req.json());
    const db = database();
    const workspace = await loadWorkspace(user);
    const version = workspace.versions.find((v) =>
      v.items.some((i) => i.id === id),
    );
    const old = version?.items.find((i) => i.id === id);
    if (!version || !old) throw new HttpError(404, "Item not found.");
    if (version.id !== workspace.currentId)
      throw new HttpError(
        409,
        "Historical versions are read-only. Review the current version instead.",
      );
    if (input.item.key !== old.key)
      throw new HttpError(400, "Item keys cannot change.");
    if (old.revision !== input.revision)
      throw new HttpError(
        409,
        "This item changed elsewhere. Refresh before saving.",
      );
    const citationValid = verifySources(input.item, version.sections);
    if (input.status === "approved" && !citationValid)
      throw new HttpError(
        400,
        "All source quotes must match their source sections before approval.",
      );
    if (
      input.status === "approved" &&
      input.item.certainty === "uncertain" &&
      !input.item.question.trim()
    )
      throw new HttpError(
        400,
        "Keep a clarification question for an uncertain interpretation.",
      );
    if (
      input.item.dateRule.type === "relative" &&
      (input.item.dateRule.anchorId === old.key ||
        !version.items.some((i) => i.key === input.item.dateRule.anchorId))
    )
      throw new HttpError(
        400,
        "Choose another existing item as the date anchor.",
      );
    const now = new Date().toISOString(),
      eventId = crypto.randomUUID();
    const next: Item = {
      ...old,
      ...input.item,
      status: input.status,
      note: input.note,
      stale: false,
      citationValid,
      revision: old.revision + 1,
      updatedAt: now,
    };
    const changedRule =
      JSON.stringify(old.dateRule) !== JSON.stringify(next.dateRule) ||
      old.status !== next.status;
    const statements = [
      db
        .prepare(
          "UPDATE items SET data=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM workspaces WHERE owner=? AND current_id=?)",
        )
        .bind(
          JSON.stringify({ ...next, versionId: version.id }),
          id,
          input.revision,
          user,
          version.id,
        ),
      db
        .prepare(
          "INSERT INTO history (id,owner,version_id,item_id,action,created_at,before,after) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1",
        )
        .bind(
          eventId,
          user,
          version.id,
          id,
          `${next.status === "pending" ? "Edited" : next.status[0].toUpperCase() + next.status.slice(1)}: ${next.title}`,
          now,
          JSON.stringify(old),
          JSON.stringify(next),
        ),
    ];
    if (changedRule)
      statements.push(
        db
          .prepare(
            "UPDATE items SET data=json_set(data,'$.stale',json('true')),revision=revision+1 WHERE version_id=? AND id!=? AND json_extract(data,'$.status')='approved' AND json_extract(data,'$.dateRule.type')='relative' AND EXISTS(SELECT 1 FROM history WHERE id=?)",
          )
          .bind(version.id, id, eventId),
      );
    const result = await db.batch(statements);
    if (!result[0].meta.changes)
      throw new HttpError(
        409,
        "A newer review or version exists. Refresh before saving.",
      );
    return Response.json(await loadWorkspace(user));
  } catch (e) {
    return failure(e);
  }
}
