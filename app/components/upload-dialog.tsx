"use client";
import { MAX_FILE_MB, MAX_REQUEST_BYTES } from "@/lib/contracts/limits";
import { useEffect, useRef, useState } from "react";
import { X, Upload, FileText, LoaderCircle, Info } from "lucide-react";
import { parseFile, textDocument } from "@/lib/contracts/parse";
import type { Workspace } from "@/lib/contracts/types";
export default function UploadDialog({
  currentId,
  aiConfigured,
  onClose,
  onSaved,
}: {
  currentId: string | null;
  aiConfigured: boolean;
  onClose: () => void;
  onSaved: (w: Workspace) => void;
}) {
  const [title, setTitle] = useState("");
  const [input, setInput] = useState<"file" | "text">("file");
  const [contract, setContract] = useState<File | null>(null);
  const [policy, setPolicy] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  async function upload() {
    setError("");
    setBusy("Reading your documents…");
    try {
      const parsed =
        input === "file"
          ? contract
            ? await parseFile(contract, "contract")
            : null
          : textDocument(text, "Pasted contract.txt", "contract");
      if (!parsed) throw new Error("Choose a contract file first.");
      const parsedPolicy = policy
        ? await parseFile(policy, "policy")
        : policyText.trim()
          ? textDocument(policyText, "Pasted policy.txt", "policy")
          : null;
      const total = [
        ...parsed.sections,
        ...(parsedPolicy?.sections ?? []),
      ].reduce((n, s) => n + s.text.length, 0);
      if (total > 80000)
        throw new Error(
          "Use up to 80,000 characters across the contract and policy.",
        );
      const form = new FormData();
      form.set("mode", "ai");
      form.set("expectedCurrentId", currentId ?? "");
      form.set("title", title.trim() || parsed.name);
      form.set("contract", JSON.stringify(parsed));
      if (input === "file" && contract) form.set("contractFile", contract);
      if (parsedPolicy) form.set("policy", JSON.stringify(parsedPolicy));
      if (policy) form.set("policyFile", policy);
      const requestSize = [...form.values()].reduce(
        (bytes, value) =>
          bytes +
          (value instanceof File
            ? value.size
            : new TextEncoder().encode(value).byteLength),
        0,
      );
      if (requestSize > MAX_REQUEST_BYTES - 16384)
        throw new Error(
          "The combined upload is too large. Use smaller files or pasted text.",
        );
      setBusy("Extracting clauses and checking sources…");
      const response = await fetch("/api/workspace", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as Workspace & { error?: string };
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      onSaved(result);
      onClose();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to read this document. Try pasted text.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <dialog
      ref={dialog}
      className="modal"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <div className="eyebrow">
            {currentId ? "PRESERVE. COMPARE. REVIEW." : "START YOUR WORKSPACE"}
          </div>
          <h2>{currentId ? "Upload a new version" : "Add your contract"}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close upload"
          disabled={!!busy}
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="modal-body">
        {currentId && (
          <div className="notice amber">
            <Info size={18} />
            Earlier versions and corrections stay saved. Existing approvals will
            be marked potentially stale.
          </div>
        )}
        {!aiConfigured && (
          <div className="notice blue">
            <Info size={18} />
            <div>
              <strong>Connect AI to analyze your own contract</strong>
              <p>
                Set OPENAI_API_KEY in the server environment. The sample
                workflow is available without a key. Your key never belongs in
                contract text.
              </p>
            </div>
          </div>
        )}
        <label className="field">
          Contract name
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Acme · Services agreement"
            maxLength={180}
          />
        </label>
        <div className="segmented">
          <button
            className={input === "file" ? "selected" : ""}
            onClick={() => setInput("file")}
          >
            Upload file
          </button>
          <button
            className={input === "text" ? "selected" : ""}
            onClick={() => setInput("text")}
          >
            Paste text
          </button>
        </div>
        {input === "file" ? (
          <label className="dropzone">
            <Upload size={26} />
            <strong>{contract?.name ?? "Choose a contract"}</strong>
            <span>
              PDF, DOCX or TXT · up to {MAX_FILE_MB} MB · 50 PDF pages
            </span>
            <input
              aria-label="Contract file"
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={(e) => setContract(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <label className="field">
            Contract text
            <textarea
              rows={7}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the complete contract text, including headings…"
            />
          </label>
        )}
        <details className="policy-details">
          <summary>
            <FileText size={17} />
            Add an organizational policy <span>Optional</span>
          </summary>
          <p className="muted small">
            Policy findings are cited separately and never treated as contract
            amendments.
          </p>
          <label className="field">
            Policy file
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              aria-label="Policy file"
              onChange={(e) => setPolicy(e.target.files?.[0] ?? null)}
            />
          </label>
          <label className="field">
            Or paste policy text
            <textarea
              rows={3}
              value={policyText}
              disabled={!!policy}
              onChange={(e) => setPolicyText(e.target.value)}
              placeholder="Internal renewal or procurement policy…"
            />
          </label>
          {policy && (
            <button className="text-button" onClick={() => setPolicy(null)}>
              Remove selected policy file
            </button>
          )}
        </details>
        <p className="small muted">
          Text is extracted in your browser; original files and extracted text
          are saved in your private workspace. Analysis sends the text to
          OpenAI. OCR is not supported.
        </p>
        {error && (
          <div className="notice red" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button className="button" disabled={!!busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!!busy || !aiConfigured}
          onClick={upload}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Upload size={17} />
          )}{" "}
          {busy || "Extract & review"}
        </button>
      </div>
    </dialog>
  );
}
