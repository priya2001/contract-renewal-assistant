import { resolveDate } from "./dates";
import type { Version } from "./types";
export function summaryText(version: Version, currentId: string | null) {
  const approved = version.items.filter(
    (i) => i.status === "approved" && !i.stale,
  );
  const pending = version.items.filter(
    (i) => i.status === "pending" || i.stale,
  );
  const lines = [
    `# Reviewed contract summary`,
    version.title,
    `Version ${version.number} · ${version.contractName}`,
    `Generated: ${new Date().toISOString()}`,
    version.mode === "demo"
      ? "SAMPLE DOCUMENT — prewritten extraction."
      : "AI-assisted extraction with human review.",
    version.id !== currentId
      ? "HISTORICAL VERSION — potentially stale."
      : "CURRENT VERSION",
    "Information management only. Not legal advice. Approval does not establish legal correctness.",
    "",
    `## Approved items (${approved.length})`,
  ];
  for (const i of approved) {
    lines.push(
      "",
      `### ${i.title}`,
      i.description,
      `Responsible party: ${i.party || "Unknown"}`,
      `Evidence: ${i.certainty === "explicit" ? "Explicit in source" : "Uncertain interpretation (reviewed)"}`,
    );
    const date = resolveDate(i, version.items);
    const dependenciesApproved = date.dependencies.every((id) =>
      approved.some((a) => a.id === id),
    );
    if (date.date)
      lines.push(
        `Calculated date: ${date.date}${dependenciesApproved ? "" : " — tentative; anchor is not approved"}`,
        `Calculation: ${date.reason}`,
      );
    if (i.question) lines.push(`Clarification question: ${i.question}`);
    if (i.note) lines.push(`Reviewer note: ${i.note}`);
    for (const source of i.sources) {
      const section = version.sections.find((s) => s.id === source.sectionId);
      lines.push(
        `Source [${source.sectionId}] ${section?.label ?? ""} (${section?.document ?? "unknown"}, version ${version.number}): “${source.quote}”`,
      );
    }
  }
  lines.push(
    "",
    `## Pending / stale items (${pending.length})`,
    "These items are excluded from the approved facts above.",
  );
  for (const i of pending)
    lines.push(
      `- ${i.title}${i.stale ? " [potentially stale]" : ""}${i.question ? ` — Question: ${i.question}` : ""}`,
    );
  lines.push(
    "",
    `Rejected items excluded: ${version.items.filter((i) => i.status === "rejected").length}`,
  );
  if (version.warnings.length)
    lines.push(
      "",
      "## Extraction notes",
      ...version.warnings.map((w) => `- ${w}`),
    );
  return lines.join("\n");
}
