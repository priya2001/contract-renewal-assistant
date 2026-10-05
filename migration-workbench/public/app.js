let state,
  view = "mapping",
  selected = null,
  filter = "all",
  page = 0,
  busy = false,
  dirty = false;
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const pretty = (v) => esc(JSON.stringify(v, null, 2));
const date = (v) => (v ? new Date(v).toLocaleString() : "");
const names = {
  setup: "Dataset & schemas",
  mapping: "Mapping plan",
  validation: "Dry run & quarantine",
  target: "Mock target",
  history: "Activity & versions",
};
const badge = (text, color = "") =>
  `<span class="badge ${color}">${esc(text)}</span>`;
function toast(text, error = false) {
  const e = $("#toast");
  e.textContent = text;
  e.className = "visible" + (error ? " error" : "");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => (e.className = ""), 7000);
}
async function refresh() {
  const r = await fetch("/api/state");
  if (!r.ok) throw new Error("Could not open workspace.");
  state = await r.json();
  render();
}
async function act(path, data = {}) {
  if (busy) return;
  busy = true;
  $("#app").classList.add("busy");
  try {
    const r = await fetch("/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Workbench-Token": state.csrf,
      },
      body: JSON.stringify({ revision: state.revision, ...data }),
    });
    const response = await r.json();
    if (!r.ok) throw new Error(response.error);
    state = response;
    dirty = false;
    render();
    return response;
  } catch (e) {
    toast(e.message, true);
    if (e.message.includes("changed")) await refresh();
    throw e;
  } finally {
    busy = false;
    $("#app").classList.remove("busy");
  }
}
const plan = () =>
  state.plans.find((p) => p.id === selected) || state.plans.at(-1);
const preview = () =>
  state.previews.filter((r) => r.planId === plan()?.id).at(-1);
function render() {
  if (!state) return;
  const p = plan(),
    r = preview();
  if (!state.dataset) view = "setup";
  const counts = r?.counts;
  $("#app").innerHTML =
    `<div class="shell"><aside class="sidebar"><div class="brand"><span class="logo">⇄</span> transit<span style="display:none"></span></div><div class="subbrand">Migration workbench</div><div class="navlabel">Your workspace</div><nav class="nav">${Object.entries(
      names,
    )
      .map(
        ([k, n], i) =>
          `<button data-view="${k}" class="${view === k ? "active" : ""}"><span class="navnum">0${i + 1}</span>${n}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidefoot"><strong><span class="dot"></span>Local staging environment</strong>One source. One target.<br>Up to ${state.maxRecords.toLocaleString()} records.<br>No production connections.</div></aside><div><header class="topbar"><div class="breadcrumb">Workspace &nbsp; / &nbsp; <strong>${names[view]}</strong></div><div class="topright"><span>● &nbsp; Changes saved locally</span><a href="/api/export" download>Export evidence ↗</a><div class="avatar" title="Local workspace">LW</div></div></header><main class="main"><div class="pagehead"><div><div class="eyebrow">Move data with confidence</div><h1>${view === "mapping" ? "A clear path from source to target." : view === "setup" ? "Every good migration starts here." : view === "validation" ? "Inspect every row. Trust the result." : view === "target" ? "Your migration, accounted for." : "Nothing lost along the way."}</h1><p class="subtitle">${state.dataset ? `${esc(state.dataset.source.name)} &nbsp; → &nbsp; ${esc(state.dataset.target.name)}` : "Define a bounded dataset, review the plan, and validate before you move."}</p></div><div class="actions">${state.dataset && view === "mapping" ? `<button data-action="propose">↗ Sample planner</button><button class="primary" data-action="ai" ${state.aiConfigured ? "" : "disabled"} title="${state.aiConfigured ? "Sends provided schemas and up to 20 sample records to OpenAI" : "Set OPENAI_API_KEY in .env to enable"}">✦ Propose with AI</button>` : ""}</div></div>${state.dataset ? `<div class="stats"><div class="stat"><div class="label">SOURCE RECORDS</div><div class="value">${state.dataset.records.length}</div><div class="hint">Immutable input snapshot</div></div><div class="stat"><div class="label">TRANSFORMED</div><div class="value">${counts?.transformed ?? "—"}</div><div class="hint">No transformation errors</div></div><div class="stat green"><div class="label">ACCEPTED</div><div class="value">${counts?.accepted ?? "—"}</div><div class="hint">Passed every validation</div></div><div class="stat amber"><div class="label">QUARANTINED</div><div class="value">${counts?.rejected ?? "—"}</div><div class="hint">Preserved with error evidence</div></div></div><div class="steps"><b><span class="step-circle">✓</span>Inspect source</b><span>→</span><b><span class="step-circle">2</span>Review mapping</b><span>→</span><span><span class="step-circle">3</span>Dry run & approve</span><span>→</span><span><span class="step-circle">4</span>Execute & reconcile</span></div>` : ""}${view === "setup" ? setup() : view === "mapping" ? mapping() : view === "validation" ? validation() : view === "target" ? target() : history()}</main></div></div>`;
  bind();
}
function setup() {
  if (!state.dataset)
    return `<div class="hero"><div class="eyebrow">A safe place to start</div><h2>Plan the move. Keep the evidence.</h2><p class="subtitle">Try a fictional customer migration with clean records, duplicates and invalid values. See how mapping, quarantine and reconciliation work before importing your own dataset.</p><div class="actions"><button class="primary" data-action="load-demo">Load sample dataset →</button><a href="/api/example" download="customers.json">Download input example</a></div></div><div class="twocol" style="margin-top:22px"><section class="card"><div class="cardhead"><h2>Bring your dataset</h2>${badge("JSON · maximum 2 MB")}</div><div class="cardbody"><p class="subtitle">One JSON bundle containing <code>source</code>, <code>target</code> and <code>records</code>. Up to 1,000 records and 40 fields per schema. Once imported, this snapshot stays immutable.</p><label class="filepick">Choose a JSON dataset<input id="dataset-file" type="file" accept=".json,application/json"></label><textarea id="dataset-json" rows="7" aria-label="Dataset JSON" placeholder='{"source": {...}, "target": {...}, "records": [...]}'></textarea><div class="actions" style="margin-top:14px"><button data-action="import">Import dataset</button></div></div></section><section class="card"><div class="cardhead"><h2>Human decisions. Deterministic execution.</h2></div><div class="cardbody"><div class="insight">01 &nbsp; AI can inspect and propose. It cannot approve or execute.</div><div class="insight">02 &nbsp; Every rejected row keeps field-level evidence.</div><div class="insight">03 &nbsp; Retries never duplicate inserted records.</div><div class="insight">04 &nbsp; Rollback removes only records owned by its run.</div></div></section></div>`;
  return `<div class="note">Dataset locked · ${state.dataset.records.length} records · Fingerprint <code>${esc(state.dataset.fingerprint.slice(0, 18))}…</code>. Plan edits create versions; source records do not change.</div><div class="twocol">${["source", "target"].map((kind) => `<section class="card"><div class="cardhead"><h2>${kind === "source" ? "Source schema" : "Target schema"}</h2>${badge(state.dataset[kind].name)}</div><div class="cardbody">${state.dataset[kind].fields.map((f) => `<div class="schema-field"><span class="field">${esc(f.name)} ${f.name === state.dataset.target.primaryKey && kind === "target" ? badge("KEY", "green") : ""}</span><span>${esc(f.type)} ${f.required ? "· required" : "· optional"}${f.min !== undefined ? " · min " + esc(f.min) : ""}${f.max !== undefined ? " · max " + esc(f.max) : ""}</span></div>`).join("")}</div></section>`).join("")}</div><section class="card"><div class="cardhead"><h2>Source records</h2>${badge("First 25 rows")}</div><div class="tablewrap">${dataTable(state.dataset.records.slice(0, 25))}</div></section><section class="card"><div class="cardhead"><h2>Supported transformations</h2></div><div class="cardbody">${Object.entries(
    state.rules,
  )
    .map(
      ([k, v]) =>
        `<div class="schema-field"><code>${esc(k)}</code><span>${esc(v)}</span></div>`,
    )
    .join("")}</div></section>`;
}
function mapping() {
  const p = plan();
  if (!p)
    return `<section class="card empty"><div class="icon">⇄</div><h2>Your data is ready. Let’s map it.</h2><p class="subtitle">Start with a deterministic sample proposal or let the AI inspect schemas and suggest supported transformations. Every proposal requires your review.</p><button class="primary" data-action="propose">Create sample proposal →</button></section>`;
  return `<div class="grid"><div><section class="card"><div class="cardhead"><div><h2>Field mappings <span class="mini">&nbsp; / &nbsp; Version ${p.version}</span></h2><p class="mini">${p.origin === "ai" ? "AI-generated proposal" : p.origin === "sample" ? "Deterministic sample proposal · no AI call" : "Reviewer-edited version"} · ${esc(p.hash.slice(0, 10))}</p></div>${badge(p.status, p.status === "approved" ? "green" : p.status === "rejected" ? "red" : "amber")}</div><div class="tablewrap"><table><thead><tr><th>Source field</th><th>Transformation chain</th><th>Target field</th></tr></thead><tbody>${p.content.mappings.map((m, i) => `<tr><td><select aria-label="Source for ${esc(m.target)}" data-source="${i}"><option value="" ${m.source === null ? "selected" : ""}>Constant value</option>${state.dataset.source.fields.map((f) => `<option value="${esc(f.name)}" ${m.source === f.name ? "selected" : ""}>${esc(f.name)}</option>`).join("")}</select><input data-constant="${i}" aria-label="Constant for ${esc(m.target)}" placeholder="JSON constant, e.g. null" value="${esc(JSON.stringify(m.constant ?? null))}" ${m.source === null ? "" : "hidden"}></td><td><input aria-label="Transforms for ${esc(m.target)}" data-transforms="${i}" value="${esc(m.transforms.join(", "))}" list="rules"><div class="small">Comma-separated, applied in order →</div></td><td><div class="field">${esc(m.target)}</div><div class="small">${esc(state.dataset.target.fields.find((f) => f.name === m.target)?.type)} ${state.dataset.target.fields.find((f) => f.name === m.target)?.required ? "· required" : ""}</div></td></tr>`).join("")}</tbody></table></div><datalist id="rules">${Object.keys(
    state.rules,
  )
    .map((k) => `<option value="${esc(k)}"></option>`)
    .join(
      "",
    )}</datalist><div class="cardbody"><div class="formgroup"><label for="summary">Plan rationale</label><textarea id="summary" rows="2">${esc(p.content.summary)}</textarea></div><div class="twocol"><div><label for="risks">Mapping risks · one per line</label><textarea id="risks" rows="5">${esc(p.content.risks.join("\n"))}</textarea></div><div><label for="questions">Clarification questions · one per line</label><textarea id="questions" rows="5">${esc(p.content.questions.join("\n"))}</textarea></div></div></div><div class="footerbar"><span class="mini" id="save-hint">Editing creates a new draft. Existing approvals stay with their exact version.</span><div class="actions"><button data-action="save">Save as new version</button><button class="primary" data-action="dry">Run dry run →</button></div></div></section><div class="note">Allowed rules: ${Object.keys(
    state.rules,
  )
    .map((k) => `<code>${esc(k)}</code>`)
    .join(
      " · ",
    )}. Constants must be valid JSON scalars; arbitrary code is never executed.</div></div><aside class="aside"><section class="card"><div class="cardhead"><h2>Review checkpoints</h2></div><div class="cardbody">${p.content.risks.map((x) => `<div class="insight">${badge("RISK", "amber")}<br>${esc(x)}</div>`).join("")}${p.content.questions.map((x) => `<div class="insight">${badge("CLARIFY", "blue")}<br>${esc(x)}</div>`).join("")}</div></section>${versions()}</aside></div>`;
}
function versions() {
  return `<section class="card"><div class="cardhead"><h2>Plan versions</h2>${badge(state.plans.length)}</div><div class="cardbody">${
    [...state.plans]
      .reverse()
      .map(
        (p) =>
          `<button class="version ${p.id === plan()?.id ? "selected" : ""}" data-plan="${p.id}">Version ${p.version}<span>${badge(p.status)}</span><div class="mini">${esc(date(p.createdAt))}</div></button>`,
      )
      .join("") || '<p class="mini">No plans yet.</p>'
  }</div></section>`;
}
function validation() {
  const p = plan(),
    r = preview();
  if (!p || !r)
    return `<section class="card empty"><div class="icon">✓</div><h2>Validate before you move.</h2><p class="subtitle">Save your mapping, then run a deterministic dry run. No records are inserted into the target.</p><button data-view="mapping">Go to mapping plan →</button></section>`;
  const rows = r.results.filter((x) => filter === "all" || x.status === filter);
  const shown = rows.slice(page * 25, (page + 1) * 25);
  const current = p.id === state.plans.at(-1)?.id;
  const fresh = r.targetRevision === state.targetRevision;
  const run = state.runs.find((x) => x.planId === p.id);
  return `<div class="note ${fresh ? "" : "warn"}">Version ${p.version} · Dry run ${esc(date(r.at))}. ${fresh ? "Target snapshot is current." : "Target changed after this preview. Evidence is historical; rerun validation for a new approval."} Transformed includes rows whose conversions succeeded, even if validation later rejected them.</div><section class="card"><div class="cardhead"><h2>Validation evidence</h2><div class="actions"><button data-action="dry">Run again</button><button class="primary" data-action="approve" ${current && p.status === "draft" && fresh && r.counts.accepted > 0 ? "" : "disabled"}>Review & approve</button><button class="danger" data-action="reject" ${current && p.status === "draft" ? "" : "disabled"}>Reject plan</button></div></div><div class="cardbody"><div class="tabs">${[
    ["all", "All rows"],
    ["accepted", "Accepted"],
    ["rejected", "Quarantined"],
  ]
    .map(
      ([k, n]) =>
        `<button data-filter="${k}" class="${filter === k ? "active" : ""}">${n} ${k === "all" ? r.counts.source : r.counts[k]}</button>`,
    )
    .join(
      "",
    )}</div><div class="tablewrap"><table><thead><tr><th>Source row</th><th>Result</th><th>Field-level evidence</th><th>Record inspection</th></tr></thead><tbody>${shown.map((row) => `<tr><td class="field">#${row.index}</td><td>${badge(row.status, row.status === "accepted" ? "green" : "amber")}</td><td>${row.errors.map((e) => `<div class="rowerror"><strong>${esc(e.field)}</strong> · ${esc(e.rule)}<br>${esc(e.message)}<br>Original: <code>${esc(JSON.stringify(e.original))}</code> → Value: <code>${esc(JSON.stringify(e.value))}</code></div>`).join("") || '<span class="mini">All source and target checks passed</span>'}</td><td><details><summary>Source → transformed</summary><pre>${pretty({ source: row.source, transformed: row.output })}</pre></details></td></tr>`).join("") || '<tr><td colspan="4">No rows in this filter.</td></tr>'}</tbody></table></div><div class="pager"><button data-page="-1" ${page === 0 ? "disabled" : ""}>←</button>${rows.length ? `${page * 25 + 1}–${Math.min(rows.length, (page + 1) * 25)}` : "0"} of ${rows.length}<button data-page="1" ${(page + 1) * 25 >= rows.length ? "disabled" : ""}>→</button></div></div><div class="footerbar"><span class="mini">${p.approval ? `Approved by ${esc(p.approval.reviewer)} · ${esc(date(p.approval.at))}` : "Execution is locked until a reviewer approves this exact plan and dry run."}</span><button class="primary" data-action="execute" ${p.status === "approved" && current && fresh && !run ? "" : "disabled"}>Execute approved migration →</button></div></section>${p.approval ? `<div class="note">Review decision: ${esc(p.approval.note)}</div>` : ""}<section class="card"><div class="cardhead"><h2>Accepted-source totals after transformation</h2>${badge("Numeric fields")}</div><div class="cardbody"><p class="mini">Only accepted rows contribute to these expected target totals. Raw text values are never summed.</p><div class="rulelist">${Object.entries(
    r.totals,
  )
    .map(([k, v]) => badge(k + ": " + v, "green"))
    .join("")}</div></div></section>`;
}
function dataTable(rows) {
  if (!rows.length)
    return '<div class="empty"><p class="subtitle">No rows yet.</p></div>';
  const fields = Object.keys(rows[0]);
  return `<table><thead><tr>${fields.map((f) => `<th>${esc(f)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${fields.map((f) => `<td>${esc(typeof r[f] === "object" ? JSON.stringify(r[f]) : r[f])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function target() {
  return `<div class="grid"><div><section class="card"><div class="cardhead"><h2>Reconciliation</h2>${badge("Source = accepted + quarantined", "green")}</div>${state.reconciliation.map((r) => `<div class="runrow"><div class="actions"><h3>Plan v${r.planVersion}</h3>${badge(r.balanced ? "Balanced" : "Mismatch", r.balanced ? "green" : "red")}${badge(r.status)}</div><p class="mini">${r.source} source = ${r.accepted} accepted + ${r.quarantined} quarantined · Expected target ${r.expectedTarget} / actual ${r.actualTarget}</p><details><summary>Numeric totals and execution evidence</summary><pre>${pretty(r)}</pre></details></div>`).join("") || '<div class="empty"><h2>No migration executed</h2><p class="subtitle">Approve a dry run first. Execution will insert only accepted records.</p><button data-view="validation">Open dry run →</button></div>'}</section><section class="card"><div class="cardhead"><h2>Target records</h2>${badge(state.target.length + " persisted rows")}</div><div class="tablewrap">${dataTable(state.target.slice(page * 25, (page + 1) * 25).map((t) => t.data))}</div><div class="pager"><button data-page="-1" ${page === 0 ? "disabled" : ""}>←</button>Page ${page + 1}<button data-page="1" ${(page + 1) * 25 >= state.target.length ? "disabled" : ""}>→</button></div></section></div><aside><section class="card"><div class="cardhead"><h2>Execution runs</h2></div>${
    [...state.runs]
      .reverse()
      .map(
        (r) =>
          `<div class="runrow"><h3>Plan v${r.planVersion} ${badge(r.status, r.status === "completed" ? "green" : "amber")}</h3><p class="mini">${esc(date(r.at))}<br>${r.rowCount} inserted · ${r.counts.rejected} quarantined<br>Run ${esc(r.id.slice(0, 8))}</p><div class="actions"><button data-retry="${r.id}" ${r.status === "completed" ? "" : "disabled"}>Retry safely</button><button class="danger" data-rollback="${r.id}" ${r.status === "completed" ? "" : "disabled"}>Rollback</button></div></div>`,
      )
      .join("") || '<div class="cardbody mini">No execution history yet.</div>'
  }</section><div class="note">Retries reuse the existing run: zero duplicate inserts. Rollback preserves plans, approvals and quarantine evidence.</div></aside></div>`;
}
function history() {
  return `<div class="grid"><section class="card"><div class="cardhead"><h2>Audit trail</h2>${badge(state.events.length + " events")}</div><div class="cardbody">${
    [...state.events]
      .reverse()
      .map(
        (e) =>
          `<div class="timeline"><time>${esc(date(e.at))}</time><div><strong>${esc(e.type.replaceAll("_", " "))}</strong><pre>${pretty(e.details)}</pre></div></div>`,
      )
      .join("") || '<p class="mini">Activity will appear here.</p>'
  }</div></section><aside>${versions()}<section class="card"><div class="cardhead"><h2>Planner tool trace</h2></div><div class="cardbody">${
    plan()
      ?.trace.map(
        (t) =>
          `<div class="insight"><code>${esc(t.tool)}</code><br>${esc(t.outcome)}</div>`,
      )
      .join("") || '<p class="mini">No tool trace for a manual plan.</p>'
  }</div></section></aside></div>`;
}
function readPlan() {
  const p = plan();
  return {
    summary: $("#summary").value,
    risks: $("#risks").value.split("\n").filter(Boolean),
    questions: $("#questions").value.split("\n").filter(Boolean),
    mappings: p.content.mappings.map((m, i) => ({
      target: m.target,
      source: $(`[data-source="${i}"]`).value || null,
      constant: $(`[data-source="${i}"]`).value
        ? null
        : JSON.parse($(`[data-constant="${i}"]`).value),
      transforms: $(`[data-transforms="${i}"]`)
        .value.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    })),
  };
}
function decision(type, runId) {
  const d = $("#decision"),
    r = preview();
  d.innerHTML = `<form id="decision-form"><h2>${type === "approve" ? "Approve this migration plan" : type === "reject" ? "Reject this plan" : "Rollback this migration?"}</h2><p>${type === "approve" ? `You are approving plan v${plan().version}: ${r.counts.accepted} accepted rows may be inserted and ${r.counts.rejected} rejected rows stay quarantined. Approval does not execute the migration.` : type === "reject" ? "Keep this version in history and save a revised draft to continue." : "Only rows inserted by this run will be removed. All audit and quarantine evidence remains. A rolled-back run cannot be retried; a new approved version is required."}</p>${type === "approve" ? '<label for="reviewer">Reviewer name</label><input id="reviewer" type="text" required minlength="2" maxlength="100" autocomplete="name">' : ""}${type !== "rollback" ? '<label for="decision-note" style="margin-top:16px">Decision and clarification responses</label><textarea id="decision-note" required minlength="5" maxlength="2000" rows="4" placeholder="Record resolved questions or explicitly accepted risks…"></textarea>' : ""}<label class="check" style="margin-top:15px"><input id="ack" type="checkbox" required> ${type === "approve" ? "I reviewed the mapping, risks, clarification questions and rejected-row evidence." : "I understand the effect of this decision."}</label><div class="actions"><button type="button" id="cancel">Cancel</button><button class="${type === "approve" ? "primary" : "danger"}" type="submit">${type === "approve" ? "Approve plan" : type === "reject" ? "Reject plan" : "Confirm rollback"}</button></div></form>`;
  $("#cancel").onclick = () => d.close();
  $("#decision-form").onsubmit = async (e) => {
    e.preventDefault();
    const submit = e.submitter;
    submit.disabled = true;
    try {
      if (type === "approve")
        await act("approve", {
          planId: plan().id,
          previewId: preview().id,
          reviewer: $("#reviewer").value,
          note: $("#decision-note").value,
        });
      else if (type === "reject")
        await act("reject", {
          planId: plan().id,
          note: $("#decision-note").value,
        });
      else await act("rollback", { runId });
      d.close();
      toast(
        type === "approve"
          ? "Plan approved. Execution is a separate action."
          : type === "reject"
            ? "Plan rejected. Its evidence remains in history."
            : "Rollback complete. Reconciliation updated.",
      );
    } catch {
    } finally {
      submit.disabled = false;
    }
  };
  d.showModal();
}
function bind() {
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        if (dirty && !confirm("Discard unsaved mapping edits?")) return;
        view = b.dataset.view;
        page = 0;
        dirty = false;
        render();
      }),
  );
  document.querySelectorAll("[data-plan]").forEach(
    (b) =>
      (b.onclick = () => {
        if (dirty && !confirm("Discard unsaved mapping edits?")) return;
        selected = b.dataset.plan;
        view = "mapping";
        dirty = false;
        render();
      }),
  );
  document.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        page = 0;
        render();
      }),
  );
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        page += Number(b.dataset.page);
        render();
      }),
  );
  document.querySelectorAll("[data-retry]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await act("retry", { runId: b.dataset.retry });
          toast("Retry complete: 0 duplicate inserts.");
        } catch {}
      }),
  );
  document
    .querySelectorAll("[data-rollback]")
    .forEach(
      (b) => (b.onclick = () => decision("rollback", b.dataset.rollback)),
    );
  if ($("#dataset-file"))
    $("#dataset-file").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 2 * 1024 * 1024) {
        toast("Maximum input size is 2 MB.", true);
        return;
      }
      $("#dataset-json").value = await f.text();
    };
  if (view === "mapping")
    document.querySelectorAll("input,textarea,select").forEach(
      (el) =>
        (el.oninput = () => {
          dirty = true;
          const hint = $("#save-hint");
          if (hint)
            hint.textContent =
              "Unsaved edits — save a new version before validation.";
          const button = $('[data-action="dry"]');
          if (button) button.disabled = true;
          document
            .querySelectorAll("[data-source]")
            .forEach(
              (s) =>
                ($(`[data-constant="${s.dataset.source}"]`).hidden = Boolean(
                  s.value,
                )),
            );
        }),
    );
}
async function action(name) {
  try {
    if (["propose", "ai"].includes(name)) {
      if (
        dirty &&
        !confirm("Discard unsaved edits and create another proposal?")
      )
        return;
      toast(
        name === "ai"
          ? "AI is inspecting schemas and validating a proposal…"
          : "Preparing sample mapping…",
      );
      const result = await act("propose", {
        mode: name === "ai" ? "ai" : "sample",
      });
      selected = result.result;
      view = "mapping";
      render();
      toast("New draft saved. Review before approving.");
    } else if (name === "load-demo") {
      const d = await (await fetch("/api/example")).json();
      await act("dataset", { dataset: d });
      await action("propose");
    } else if (name === "import") {
      await act("dataset", { dataset: JSON.parse($("#dataset-json").value) });
      view = "mapping";
      render();
      toast("Dataset imported. Create a mapping proposal.");
    } else if (name === "save") {
      const p = readPlan();
      const result = await act("plans", { plan: p });
      selected = result.result;
      render();
      toast("New draft version saved. Approval is required again.");
    } else if (name === "dry") {
      await act("dry-run", { planId: plan().id });
      view = "validation";
      page = 0;
      render();
      toast("Dry run complete. No target records were changed.");
    } else if (name === "approve" || name === "reject") decision(name);
    else if (name === "execute") {
      await act("execute", { planId: plan().id });
      view = "target";
      page = 0;
      render();
      toast("Migration complete. Reconciliation is ready.");
    }
  } catch (e) {
    toast(
      e instanceof SyntaxError
        ? "Invalid JSON. Check the dataset or constant value."
        : e.message,
      true,
    );
  }
}
document.addEventListener("click", (e) => {
  const button = e.target.closest("[data-action]");
  if (button && !button.disabled) void action(button.dataset.action);
});
refresh().catch((e) => {
  $("#app").innerHTML =
    `<div class="loading">${esc(e.message)} Refresh to retry.</div>`;
});
