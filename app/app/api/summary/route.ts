import {
  owner,
  failure,
  loadWorkspace,
  HttpError,
} from "@/lib/contracts/server";
import { summaryText } from "@/lib/contracts/summary";
export async function GET(req: Request) {
  try {
    const ws = await loadWorkspace(await owner(req));
    const id = new URL(req.url).searchParams.get("version") ?? ws.currentId;
    const version = ws.versions.find((v) => v.id === id);
    if (!version) throw new HttpError(404, "Version not found.");
    return new Response(summaryText(version, ws.currentId), {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="reviewed-summary-v${version.number}.md"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
