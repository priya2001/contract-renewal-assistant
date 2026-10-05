import http from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Store } from "./lib/store.mjs";
import {
  RULES,
  MAX_RECORDS,
  InputError,
  requireThat,
  propose,
} from "./lib/engine.mjs";
import { proposeWithAI } from "./lib/agent.mjs";
const root = dirname(fileURLToPath(import.meta.url));
export async function createApp({
  dbPath = resolve(root, ".data/workbench.sqlite"),
  ai = proposeWithAI,
} = {}) {
  if (dbPath !== ":memory:") await mkdir(dirname(dbPath), { recursive: true });
  const store = new Store(dbPath);
  const token = randomBytes(32).toString("hex");
  let aiBusy = false;
  const reply = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const host = req.headers.host || "";
      requireThat(
        /^127\.0\.0\.1:\d+$/.test(host),
        "Use the printed 127.0.0.1 URL.",
        403,
      );
      const url = new URL(req.url, `http://${host}`);
      const path = url.pathname;
      if (req.method === "GET" && path === "/api/state") {
        const state = store.read();
        return reply(res, 200, {
          ...state,
          reconciliation: store.reconcile(state),
          rules: RULES,
          maxRecords: MAX_RECORDS,
          csrf: token,
          aiConfigured: Boolean(process.env.OPENAI_API_KEY),
        });
      }
      if (req.method === "GET" && path === "/api/example")
        return reply(
          res,
          200,
          JSON.parse(
            await readFile(resolve(root, "examples/customers.json"), "utf8"),
          ),
        );
      if (req.method === "GET" && path === "/api/export") {
        const s = store.read();
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="migration-evidence.json"',
        );
        return reply(res, 200, { ...s, reconciliation: store.reconcile(s) });
      }
      if (req.method === "POST" && path.startsWith("/api/")) {
        requireThat(
          !req.headers.origin || req.headers.origin === `http://${host}`,
          "Cross-origin writes are blocked.",
          403,
        );
        requireThat(
          req.headers["sec-fetch-site"] !== "cross-site",
          "Cross-site writes are blocked.",
          403,
        );
        const supplied = String(req.headers["x-workbench-token"] || "");
        requireThat(
          supplied.length === token.length &&
            timingSafeEqual(Buffer.from(supplied), Buffer.from(token)),
          "Refresh the app before changing the workspace.",
          403,
        );
        requireThat(
          req.headers["content-type"]?.startsWith("application/json"),
          "Send JSON.",
          415,
        );
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          requireThat(bytes <= 2 * 1024 * 1024, "Input exceeds 2 MB.", 413);
          chunks.push(chunk);
        }
        let data;
        try {
          data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          throw new InputError("Invalid JSON.");
        }
        requireThat(data && typeof data === "object", "Expected JSON object.");
        let result;
        const rev = data.revision;
        if (path === "/api/dataset") result = store.dataset(data.dataset, rev);
        else if (path === "/api/propose") {
          const snapshot = store.read();
          requireThat(snapshot.dataset, "Import a dataset first.");
          requireThat(
            snapshot.revision === rev,
            "Workspace changed. Refresh.",
            409,
          );
          if (data.mode === "ai") {
            requireThat(!aiBusy, "AI planning is already in progress.", 409);
            aiBusy = true;
            try {
              const proposal = await ai(snapshot.dataset, {
                targetRecords: snapshot.target.map((row) => row.data),
              });
              result = store.save(proposal.plan, rev, "ai", proposal.trace);
            } finally {
              aiBusy = false;
            }
          } else {
            result = store.save(propose(snapshot.dataset), rev, "sample", [
              { tool: "inspect_schemas", outcome: "ok" },
              { tool: "inspect_samples", outcome: "ok" },
              { tool: "inspect_transformations", outcome: "ok" },
              { tool: "deterministic_proposal", outcome: "no AI request" },
            ]);
          }
        } else if (path === "/api/plans") result = store.save(data.plan, rev);
        else if (path === "/api/dry-run")
          result = store.preview(data.planId, rev);
        else if (path === "/api/approve")
          result = store.approve(
            data.planId,
            data.previewId,
            data.reviewer,
            data.note,
            rev,
          );
        else if (path === "/api/reject")
          result = store.reject(data.planId, data.note, rev);
        else if (path === "/api/execute")
          result = store.execute(data.planId, rev);
        else if (path === "/api/retry") result = store.retry(data.runId, rev);
        else if (path === "/api/rollback")
          result = store.rollback(data.runId, rev);
        else throw new InputError("Unknown action.", 404);
        return reply(res, 200, {
          ...result.state,
          result: result.result,
          reconciliation: store.reconcile(result.state),
          rules: RULES,
          maxRecords: MAX_RECORDS,
          csrf: token,
          aiConfigured: Boolean(process.env.OPENAI_API_KEY),
        });
      }
      if (
        req.method === "GET" &&
        ["/", "/app.js", "/style.css"].includes(path)
      ) {
        res.setHeader(
          "Content-Type",
          path.endsWith(".js")
            ? "text/javascript"
            : path.endsWith(".css")
              ? "text/css"
              : "text/html",
        );
        res.end(
          await readFile(
            resolve(
              root,
              "public",
              path === "/" ? "index.html" : path.slice(1),
            ),
          ),
        );
        return;
      }
      throw new InputError("Not found.", 404);
    } catch (e) {
      reply(res, e.status || 500, {
        error:
          e instanceof InputError
            ? e.message
            : e.name === "TimeoutError"
              ? "AI timed out. No plan was approved or executed."
              : "Action failed. No partial migration was committed. Check configuration and retry.",
      });
    }
  });
  return { server, store };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4310);
  const { server } = await createApp({
    dbPath: process.env.DATA_FILE ? resolve(process.env.DATA_FILE) : undefined,
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `Migration Workbench → http://127.0.0.1:${port}\nLocal mock target only. Open the URL to load the sample or import your dataset.`,
    ),
  );
}
