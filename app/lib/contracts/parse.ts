import type { DocumentData, Section } from "./types";
export function textDocument(
  text: string,
  name: string,
  document: "contract" | "policy",
): DocumentData {
  const prefix = document === "contract" ? "C" : "P";
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks = parts.flatMap((p) =>
    p.length <= 12000 ? [p] : (p.match(/[\s\S]{1,12000}/g) ?? []),
  );
  const sections = chunks.map((text, i) => ({
    id: `${prefix}${i + 1}`,
    label: `Paragraph ${i + 1}`,
    text,
    document,
  }));
  if (!sections.length)
    throw new Error(
      "No readable text was found. Scanned PDFs are not supported.",
    );
  return { name, sections };
}
export async function parseFile(
  file: File,
  document: "contract" | "policy",
): Promise<DocumentData> {
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Each file must be 8 MB or smaller.");
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  if (ext === "pdf") {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;
    try {
      if (pdf.numPages > 50)
        throw new Error("Use a document with 50 pages or fewer.");
      const sections: Section[] = [];
      const prefix = document === "contract" ? "C" : "P";
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        let text = "";
        for (const item of content.items) {
          if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
        }
        const chunks = text.trim().match(/[\s\S]{1,12000}/g) ?? [];
        chunks.forEach((text, i) =>
          sections.push({
            id: `${prefix}-p${p}-${i + 1}`,
            label: `Page ${p}${chunks.length > 1 ? ` · block ${i + 1}` : ""}`,
            text: text.trim(),
            document,
          }),
        );
      }
      if (
        !sections.length ||
        sections.reduce((n, s) => n + s.text.length, 0) < 50
      )
        throw new Error(
          "This PDF has no usable text layer. Scanned PDFs and OCR are not supported.",
        );
      return { name: file.name, sections };
    } finally {
      await loadingTask.destroy();
    }
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    return textDocument(result.value, file.name, document);
  }
  if (ext === "txt")
    return textDocument(new TextDecoder().decode(buffer), file.name, document);
  throw new Error("Choose a text-based PDF, DOCX, TXT, or paste the text.");
}
