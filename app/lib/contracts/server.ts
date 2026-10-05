import { database } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { aiConfig } from "./ai";
import type { Workspace, Version, Item, HistoryEntry } from "./types";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function owner(request: Request) {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    const host = new URL(request.url).host;
    if (origin && new URL(origin).host !== host)
      throw new HttpError(403, "Cross-origin writes are not allowed.");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      throw new HttpError(403, "Cross-site writes are not allowed.");
  }
  const user = await getChatGPTUser();
  if (!user)
    throw new HttpError(
      401,
      "Sign in to open your private contract workspace.",
    );
  return user.userId;
}
export function failure(error: unknown) {
  if (error instanceof SyntaxError)
    return Response.json(
      { error: "Malformed input. Check your document and try again." },
      { status: 400 },
    );
  if (error instanceof HttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Error && error.message === "AI_NOT_CONFIGURED")
    return Response.json(
      {
        error:
          "AI extraction is not connected yet. Configure OPENAI_API_KEY on the server or explore the sample contract.",
      },
      { status: 503 },
    );
  if (error instanceof Error && error.name === "ZodError")
    return Response.json(
      {
        error:
          "Some fields are invalid. Check the date rule, required fields, and document limits.",
      },
      { status: 400 },
    );
  if (error instanceof Error && error.name === "TimeoutError")
    return Response.json(
      {
        error:
          "AI extraction timed out. No new version was saved; please retry.",
      },
      { status: 504 },
    );
  const safe =
    error instanceof Error &&
    /^(AI |The configured AI|That calendar|Use a valid|Document |Database |File |Text |Unsupported|A contract)/.test(
      error.message,
    );
  return Response.json(
    {
      error: safe
        ? (error as Error).message
        : "The operation could not complete. Your input is preserved; retry or check the local setup.",
    },
    { status: 500 },
  );
}
export async function loadWorkspace(user: string): Promise<Workspace> {
  const db = database();
  const [ws, vs, rows, events] = await Promise.all([
    db
      .prepare("SELECT current_id FROM workspaces WHERE owner=?")
      .bind(user)
      .first<{ current_id: string | null }>(),
    db
      .prepare("SELECT * FROM versions WHERE owner=? ORDER BY number DESC")
      .bind(user)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        "SELECT i.data, i.revision FROM items i JOIN versions v ON v.id=i.version_id WHERE v.owner=?",
      )
      .bind(user)
      .all<{ data: string; revision: number }>(),
    db
      .prepare(
        "SELECT * FROM history WHERE owner=? ORDER BY created_at DESC LIMIT 250",
      )
      .bind(user)
      .all<Record<string, unknown>>(),
  ]);
  const versions = vs.results.map((v) => ({
    id: v.id,
    number: v.number,
    title: v.title,
    createdAt: v.created_at,
    mode: v.mode,
    contractName: v.contract_name,
    policyName: v.policy_name,
    sections: JSON.parse(v.sections as string),
    warnings: JSON.parse(v.warnings as string),
    items: rows.results
      .map((r) => ({ ...JSON.parse(r.data), revision: r.revision }))
      .filter((i: Item & { versionId: string }) => i.versionId === v.id),
  })) as Version[];
  const history = events.results.map((e) => ({
    id: e.id,
    versionId: e.version_id,
    itemId: e.item_id,
    action: e.action,
    createdAt: e.created_at,
    before: e.before,
    after: e.after,
  })) as HistoryEntry[];
  return {
    currentId: ws?.current_id ?? null,
    versions,
    history,
    aiConfigured: !!aiConfig().key,
  };
}
