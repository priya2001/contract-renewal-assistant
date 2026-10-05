import { database, bucket } from "@/db";
import { owner, failure, HttpError } from "@/lib/contracts/server";
import type { Section } from "@/lib/contracts/types";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await owner(req);
    const { id } = await params;
    const policy = new URL(req.url).searchParams.get("kind") === "policy";
    const v = await database()
      .prepare(
        "SELECT contract_key,policy_key,contract_name,policy_name,mode,sections FROM versions WHERE id=? AND owner=?",
      )
      .bind(id, user)
      .first<{
        contract_key: string | null;
        mode: string;
        sections: string;
        policy_key: string | null;
        contract_name: string;
        policy_name: string | null;
      }>();
    if (!v) throw new HttpError(404, "Version not found.");
    const key = policy ? v.policy_key : v.contract_key;
    if (v.mode === "demo") {
      const sections = (JSON.parse(v.sections) as Section[]).filter(
        (section) => section.document === (policy ? "policy" : "contract"),
      );
      if (!sections.length) throw new HttpError(404, "Document not found.");
      return new Response(
        sections.map((s) => `${s.label}\n${s.text}`).join("\n\n"),
        {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent((policy ? v.policy_name : v.contract_name) ?? "sample.txt")}`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
    if (!key) throw new HttpError(404, "Document not found.");
    const object = await bucket().get(key);
    if (!object) throw new HttpError(404, "Original file is unavailable.");
    const name = policy ? v.policy_name : v.contract_name;
    return new Response(object.body, {
      headers: {
        "Content-Type":
          object.httpMetadata?.contentType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name ?? "document.txt")}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
