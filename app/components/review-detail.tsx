"use client";
import { useState } from "react";
import {
  Check,
  X,
  Pencil,
  Quote,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
  Save,
  LoaderCircle,
} from "lucide-react";
import {
  NONE,
  kindLabels,
  type Item,
  type Version,
  type Workspace,
  type ExtractedItem,
} from "@/lib/contracts/types";
import { formatDate, resolveDate } from "@/lib/contracts/dates";
const extract = (i: Item): ExtractedItem => ({
  key: i.key,
  kind: i.kind,
  title: i.title,
  description: i.description,
  party: i.party,
  certainty: i.certainty,
  sources: i.sources,
  question: i.question,
  dateRule: i.dateRule,
  reminderDays: i.reminderDays,
});
export default function ReviewDetail({
  item,
  version,
  readOnly,
  onSaved,
}: {
  item: Item;
  version: Version;
  readOnly: boolean;
  onSaved: (w: Workspace) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ExtractedItem>(extract(item));
  const [note, setNote] = useState(item.note);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const date = resolveDate(item, version.items);
  async function save(status: Item["status"]) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision: item.revision,
          status,
          note: editing ? note : item.note,
          item: editing ? draft : extract(item),
        }),
      });
      const data = (await res.json()) as Workspace & { error?: string };
      if (!res.ok) throw new Error(data.error);
      onSaved(data);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  const set = (key: keyof ExtractedItem, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <article className="detail-panel">
      <div className="detail-top">
        <span className="eyebrow">
          {kindLabels[item.kind]} · {item.key}
        </span>
        <span
          className={`badge ${item.certainty === "explicit" ? "green" : "amber"}`}
        >
          {item.certainty === "explicit"
            ? "Explicit in source"
            : "Uncertain interpretation"}
        </span>
      </div>
      {item.stale && (
        <div className="notice amber">
          <AlertTriangle size={18} />
          Potentially stale. Review against the current contract or updated date
          anchor.
        </div>
      )}
      {!item.citationValid && (
        <div className="notice red">
          Source quote not verified. Edit the citation to match the original
          text before approval.
        </div>
      )}
      {editing ? (
        <div className="edit-fields">
          <label className="field">
            Title
            <input
              value={draft.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={240}
            />
          </label>
          <label className="field">
            Description
            <textarea
              rows={3}
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>
          <div className="two-col">
            <label className="field">
              Responsible party
              <input
                value={draft.party}
                onChange={(e) => set("party", e.target.value)}
              />
            </label>
            <label className="field">
              Evidence
              <select
                value={draft.certainty}
                onChange={(e) => set("certainty", e.target.value)}
              >
                <option value="explicit">Explicit in source</option>
                <option value="uncertain">Uncertain interpretation</option>
              </select>
            </label>
          </div>
          <label className="field">
            Date rule
            <select
              value={draft.dateRule.type}
              onChange={(e) =>
                set("dateRule", { ...NONE, type: e.target.value })
              }
            >
              <option value="none">No calculable date</option>
              <option value="fixed">Fixed date</option>
              <option value="relative">Relative to another item</option>
              <option value="monthly">Monthly recurring</option>
            </select>
          </label>
          {draft.dateRule.type === "fixed" && (
            <label className="field">
              Date
              <input
                type="date"
                value={draft.dateRule.date ?? ""}
                onChange={(e) =>
                  set("dateRule", { ...draft.dateRule, date: e.target.value })
                }
              />
            </label>
          )}
          {draft.dateRule.type === "relative" && (
            <>
              <label className="field">
                Anchor item
                <select
                  value={draft.dateRule.anchorId ?? ""}
                  onChange={(e) =>
                    set("dateRule", {
                      ...draft.dateRule,
                      anchorId: e.target.value,
                    })
                  }
                >
                  <option value="">Select an anchor…</option>
                  {version.items
                    .filter((i) => i.key !== item.key)
                    .map((i) => (
                      <option key={i.id} value={i.key}>
                        {i.title}
                      </option>
                    ))}
                </select>
              </label>
              <div className="three-col">
                <label className="field">
                  Days
                  <input
                    type="number"
                    min={0}
                    max={36500}
                    value={draft.dateRule.days ?? ""}
                    onChange={(e) =>
                      set("dateRule", {
                        ...draft.dateRule,
                        days:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  Direction
                  <select
                    value={draft.dateRule.direction ?? ""}
                    onChange={(e) =>
                      set("dateRule", {
                        ...draft.dateRule,
                        direction: e.target.value,
                      })
                    }
                  >
                    <option value="">Select…</option>
                    <option value="before">Before</option>
                    <option value="after">After</option>
                  </select>
                </label>
                <label className="field">
                  Day convention
                  <select
                    value={draft.dateRule.basis ?? ""}
                    onChange={(e) =>
                      set("dateRule", {
                        ...draft.dateRule,
                        basis: e.target.value,
                      })
                    }
                  >
                    <option value="">Select…</option>
                    <option value="calendar">Calendar</option>
                    <option value="business">Business</option>
                    <option value="unspecified">Unspecified</option>
                  </select>
                </label>
              </div>
            </>
          )}
          {draft.dateRule.type === "monthly" && (
            <>
              <label className="field">
                Day of month
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={draft.dateRule.dayOfMonth ?? ""}
                  onChange={(e) =>
                    set("dateRule", {
                      ...draft.dateRule,
                      dayOfMonth:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <p className="small muted">
                Days 29–31 stay unresolved until a month-end convention is
                agreed.
              </p>
            </>
          )}
          <label className="field">
            Reminder: calendar days before deadline
            <input
              type="number"
              min={0}
              max={365}
              value={draft.reminderDays}
              onChange={(e) => set("reminderDays", Number(e.target.value))}
            />
          </label>
          <label className="field">
            Clarification question
            <textarea
              rows={2}
              value={draft.question}
              onChange={(e) => set("question", e.target.value)}
            />
          </label>
          <label className="field">
            Reviewer note
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain your correction or unresolved interpretation…"
            />
          </label>
          <h3>Supporting citations</h3>
          {draft.sources.map((s, n) => (
            <div key={n} className="source-editor">
              <label className="field">
                Section
                <select
                  value={s.sectionId}
                  onChange={(e) =>
                    set(
                      "sources",
                      draft.sources.map((c, j) =>
                        j === n ? { ...c, sectionId: e.target.value } : c,
                      ),
                    )
                  }
                >
                  {version.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Exact quote
                <textarea
                  rows={3}
                  value={s.quote}
                  onChange={(e) =>
                    set(
                      "sources",
                      draft.sources.map((c, j) =>
                        j === n ? { ...c, quote: e.target.value } : c,
                      ),
                    )
                  }
                />
              </label>
            </div>
          ))}
        </div>
      ) : (
        <>
          <h2>{item.title}</h2>
          <p className="detail-description">{item.description}</p>
          <div className="detail-facts">
            <div>
              <span>RESPONSIBLE PARTY</span>
              <strong>{item.party || "Unknown"}</strong>
            </div>
            <div>
              <span>
                {item.dateRule.type === "none" ? "DATE" : "CALCULATED DATE"}
              </span>
              <strong>
                {item.dateRule.type === "none"
                  ? "Not specified"
                  : formatDate(date.date)}
              </strong>
            </div>
          </div>
          {item.dateRule.type !== "none" && (
            <p className="calculation">
              {date.reason}
              {date.date
                ? ` · Reminder ${item.reminderDays} calendar days before`
                : ""}
            </p>
          )}
          {item.question && (
            <div className="question-box">
              <span className="eyebrow">CLARIFICATION QUESTION</span>
              <p>{item.question}</p>
            </div>
          )}
          {item.note && (
            <div className="reviewer-note">
              <strong>Reviewer note</strong>
              <p>{item.note}</p>
            </div>
          )}
        </>
      )}
      <div className="source-heading">
        <Quote size={17} />
        <h3>Original source</h3>
        <span>Version {version.number}</span>
      </div>
      {item.sources.map((s, n) => {
        const section = version.sections.find((d) => d.id === s.sectionId);
        return (
          <div key={n} className="source-card">
            <div>
              <span className="source-ref">{s.sectionId}</span>
              <strong>{section?.label ?? "Unverified section"}</strong>
              <span className="badge neutral">
                {section?.document ?? "Unknown"}
              </span>
            </div>
            <blockquote>“{s.quote}”</blockquote>
            {section && (
              <details>
                <summary>Read full source section</summary>
                <p>{section.text}</p>
              </details>
            )}
            <a
              href={`/api/documents/${version.id}?kind=${section?.document ?? "contract"}`}
              className="source-link"
            >
              <ExternalLink size={13} />
              Download {section?.document ?? "original"}
            </a>
          </div>
        );
      })}
      <details className="original-details">
        <summary>View original extraction</summary>
        <p>{item.original.description}</p>
        <p className="small muted">
          Original party: {item.original.party} · Original evidence:{" "}
          {item.original.certainty}
        </p>
        <pre>{JSON.stringify(item.original.dateRule, null, 2)}</pre>
      </details>
      {error && (
        <div className="notice red" role="alert">
          {error}
        </div>
      )}
      {!readOnly ? (
        <div className="review-actions">
          {editing ? (
            <>
              <button
                className="button"
                disabled={busy}
                onClick={() => setEditing(false)}
              >
                Cancel edit
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => save("pending")}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Save size={16} />
                )}
                Save for review
              </button>
            </>
          ) : (
            <>
              <button
                className="button approve"
                disabled={busy || !item.citationValid}
                onClick={() => save("approved")}
              >
                <Check size={17} />
                {item.stale ? "Reapprove" : "Approve"}
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() => {
                  setDraft(extract(item));
                  setNote(item.note);
                  setEditing(true);
                }}
              >
                <Pencil size={15} />
                Edit
              </button>
              <button
                className="button reject"
                disabled={busy}
                onClick={() => save("rejected")}
              >
                <X size={16} />
                Reject
              </button>
              {item.status !== "pending" && (
                <button
                  className="icon-button"
                  disabled={busy}
                  onClick={() => save("pending")}
                  aria-label="Return to pending"
                >
                  <RotateCcw size={17} />
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="notice blue">
          Historical version · Corrections are preserved here. Review new
          findings in the current version.
        </div>
      )}
    </article>
  );
}
