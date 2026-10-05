import { createHash } from "node:crypto";
export const MAX_RECORDS = 1000;
export const RULES = {
  copy: "Keep the original value",
  trim: "Trim whitespace from text",
  lowercase: "Lowercase text",
  uppercase: "Uppercase text",
  to_integer: "Parse a whole safe integer; no truncation",
  to_number: "Parse a finite decimal number",
  to_boolean: "Accept true/false, yes/no, 1/0",
  iso_date: "Validate an exact YYYY-MM-DD calendar date",
};
export const TYPES = [
  "string",
  "integer",
  "number",
  "boolean",
  "date",
  "email",
];
export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const requireThat = (condition, message, status = 400) => {
  if (!condition) throw new InputError(message, status);
};
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export const hash = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const scalar = (v) =>
  v === null ||
  typeof v === "boolean" ||
  (typeof v === "number" && Number.isFinite(v)) ||
  (typeof v === "string" && v.length <= 2000);
const validName = (s) =>
  typeof s === "string" &&
  /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(s) &&
  !["constructor", "prototype", "__proto__"].includes(s);
function schema(s, target = false) {
  requireThat(
    s &&
      typeof s.name === "string" &&
      s.name.length > 0 &&
      s.name.length <= 100,
    "Schema needs a name of 1–100 characters.",
  );
  requireThat(
    Array.isArray(s.fields) && s.fields.length > 0 && s.fields.length <= 40,
    "Use 1–40 fields per schema.",
  );
  const seen = new Set();
  for (const f of s.fields) {
    requireThat(
      validName(f.name) && !seen.has(f.name),
      "Field names must be unique identifiers, at most 64 characters.",
    );
    seen.add(f.name);
    requireThat(TYPES.includes(f.type), "Unsupported field type: " + f.type);
    requireThat(
      typeof f.required === "boolean",
      "Each field needs required: true or false.",
    );
    for (const k of Object.keys(f))
      requireThat(
        ["name", "type", "required", "min", "max", "enum"].includes(k),
        "Unsupported field constraint: " + k,
      );
    for (const k of ["min", "max"])
      if (f[k] !== undefined)
        requireThat(
          ["number", "integer"].includes(f.type) && Number.isFinite(f[k]),
          "min/max require numeric fields.",
        );
    if (f.min !== undefined && f.max !== undefined)
      requireThat(f.min <= f.max, "min exceeds max.");
    if (f.enum !== undefined)
      requireThat(
        Array.isArray(f.enum) &&
          f.enum.length > 0 &&
          f.enum.length <= 30 &&
          f.enum.every(scalar),
        "enum must contain 1–30 scalar values.",
      );
  }
  if (target) {
    const pk = s.fields.find((f) => f.name === s.primaryKey);
    requireThat(
      pk && pk.required && ["string", "integer"].includes(pk.type),
      "Target primaryKey must be a required string or integer field.",
    );
  }
}
export function validateDataset(d) {
  requireThat(d && typeof d === "object", "Expected a dataset object.");
  schema(d.source);
  schema(d.target, true);
  requireThat(
    Array.isArray(d.records) &&
      d.records.length > 0 &&
      d.records.length <= MAX_RECORDS,
    `Use 1–${MAX_RECORDS} source records.`,
  );
  const names = new Set(d.source.fields.map((f) => f.name));
  for (const row of d.records) {
    requireThat(
      row && typeof row === "object" && !Array.isArray(row),
      "Records must be flat JSON objects.",
    );
    for (const [k, v] of Object.entries(row)) {
      requireThat(names.has(k), "Undeclared source field: " + k);
      requireThat(
        scalar(v) && (typeof v !== "string" || v.length <= 2000),
        "Values must be scalar; text is limited to 2,000 characters.",
      );
    }
  }
  return d;
}
export function validatePlan(d, p) {
  const errors = [];
  if (!p || !Array.isArray(p.mappings)) return ["Plan needs mappings."];
  if (p.mappings.length !== d.target.fields.length)
    errors.push("Map every target field exactly once.");
  const sources = new Set(d.source.fields.map((f) => f.name)),
    targets = new Set(d.target.fields.map((f) => f.name)),
    seen = new Set();
  for (const m of p.mappings) {
    if (!m || !targets.has(m.target) || seen.has(m.target)) {
      errors.push("Unknown or duplicate target field.");
      continue;
    }
    seen.add(m.target);
    if (m.source !== null && !sources.has(m.source))
      errors.push(`${m.target}: source field does not exist.`);
    if (m.source === null && !scalar(m.constant))
      errors.push(
        `${m.target}: provide a scalar constant (null is allowed for optional fields).`,
      );
    if (
      !Array.isArray(m.transforms) ||
      !m.transforms.length ||
      m.transforms.length > 8 ||
      m.transforms.some((t) => !Object.hasOwn(RULES, t))
    )
      errors.push(`${m.target}: use only supported transformation rules.`);
  }
  if (typeof p.summary !== "string" || p.summary.length > 4000)
    errors.push("Plan summary is required (max 4,000 characters).");
  for (const k of ["risks", "questions"])
    if (
      !Array.isArray(p[k]) ||
      p[k].length > 40 ||
      p[k].some((x) => typeof x !== "string" || x.length > 1000)
    )
      errors.push(`Invalid ${k}.`);
  return errors;
}
const isDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
export function transform(v, op) {
  if (v === null || v === undefined) return null;
  if (op === "copy") return v;
  if (["trim", "lowercase", "uppercase", "iso_date"].includes(op)) {
    if (typeof v !== "string") throw new Error("Expected text.");
    if (op === "trim") return v.trim();
    if (op === "lowercase") return v.toLowerCase();
    if (op === "uppercase") return v.toUpperCase();
    if (!isDate(v))
      throw new Error(
        "Expected a valid YYYY-MM-DD date; ambiguous dates are not guessed.",
      );
    return v;
  }
  if (op === "to_integer" || op === "to_number") {
    if (
      typeof v !== "number" &&
      (typeof v !== "string" ||
        !v.trim() ||
        !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v.trim()))
    )
      throw new Error(
        "Expected a numeric value; empty strings and mixed text are rejected.",
      );
    const n = Number(v);
    if (
      !Number.isFinite(n) ||
      Math.abs(n) > 1e9 ||
      (op === "to_integer" && !Number.isSafeInteger(n))
    )
      throw new Error("Number is out of bounds or not a whole integer.");
    return n;
  }
  if (op === "to_boolean") {
    const s = String(v).trim().toLowerCase();
    if (["true", "yes", "1"].includes(s)) return true;
    if (["false", "no", "0"].includes(s)) return false;
    throw new Error("Expected true/false, yes/no or 1/0.");
  }
  throw new Error("Unsupported transformation.");
}
function fieldError(f, v) {
  if (v === null || v === undefined || v === "")
    return f.required ? "Required value is missing." : null;
  const valid = {
    string: () => typeof v === "string",
    integer: () => Number.isSafeInteger(v) && Math.abs(v) <= 1e9,
    number: () =>
      typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e9,
    boolean: () => typeof v === "boolean",
    date: () => isDate(v),
    email: () => typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  };
  if (!valid[f.type]()) return `Expected ${f.type}.`;
  if (f.min !== undefined && v < f.min) return `Below minimum ${f.min}.`;
  if (f.max !== undefined && v > f.max) return `Above maximum ${f.max}.`;
  if (f.enum && !f.enum.includes(v))
    return "Value is outside the allowed enum.";
  return null;
}
export function keyOf(d, row) {
  return canonical(row[d.target.primaryKey]);
}
export function totals(d, rows) {
  const out = {};
  for (const f of d.target.fields.filter((f) =>
    ["number", "integer"].includes(f.type),
  )) {
    out[f.name] =
      Math.round(
        rows.reduce(
          (n, r) => n + (typeof r[f.name] === "number" ? r[f.name] : 0),
          0,
        ) * 1e6,
      ) / 1e6;
  }
  return out;
}
export function dryRun(d, p, existing = []) {
  const pe = validatePlan(d, p);
  requireThat(!pe.length, pe.join(" "));
  const seen = new Set(existing.map((row) => keyOf(d, row)));
  const results = d.records.map((source, index) => {
    const errors = [],
      output = {};
    for (const f of d.source.fields) {
      const message = fieldError(f, source[f.name]);
      if (message)
        errors.push({
          stage: "source",
          field: f.name,
          sourceField: f.name,
          original: source[f.name] ?? null,
          value: source[f.name] ?? null,
          rule: "source schema",
          message,
        });
    }
    for (const f of d.target.fields) {
      const m = p.mappings.find((m) => m.target === f.name);
      const original =
        m.source === null ? m.constant : (source[m.source] ?? null);
      let value = original,
        failed = false;
      for (const op of m.transforms) {
        try {
          value = transform(value, op);
        } catch (e) {
          errors.push({
            stage: "transform",
            field: f.name,
            sourceField: m.source,
            original,
            value,
            rule: op,
            message: e.message,
          });
          failed = true;
          break;
        }
      }
      output[f.name] = value ?? null;
      if (!failed) {
        const message = fieldError(f, value);
        if (message)
          errors.push({
            stage: "target",
            field: f.name,
            sourceField: m.source,
            original,
            value,
            rule: f.type,
            message,
          });
      }
    }
    const key = keyOf(d, output);
    if (!errors.length && seen.has(key))
      errors.push({
        stage: "target",
        field: d.target.primaryKey,
        sourceField: p.mappings.find((m) => m.target === d.target.primaryKey)
          .source,
        original: output[d.target.primaryKey],
        value: output[d.target.primaryKey],
        rule: "unique",
        message: "Duplicate key in this sample or existing mock target.",
      });
    if (!errors.length) seen.add(key);
    return {
      index: index + 1,
      source,
      output,
      errors,
      status: errors.length ? "rejected" : "accepted",
    };
  });
  const accepted = results.filter((r) => !r.errors.length);
  return {
    counts: {
      source: d.records.length,
      transformed: results.filter(
        (r) => !r.errors.some((e) => e.stage === "transform"),
      ).length,
      accepted: accepted.length,
      rejected: results.length - accepted.length,
    },
    totals: totals(
      d,
      accepted.map((r) => r.output),
    ),
    results,
  };
}
export function propose(d) {
  const mappings = d.target.fields.map((f) => {
    const direct = d.source.fields.find((s) => s.name === f.name);
    const aliases = {
      customer_id: "legacy_id",
      full_name: "name",
      email: "email_address",
      age: "age_text",
      active: "is_active",
      joined_on: "joined_date",
      balance: "balance_text",
    };
    const source =
      direct || d.source.fields.find((s) => s.name === aliases[f.name]);
    let transforms = ["copy"];
    if (source?.type === "string") {
      if (f.type === "integer") transforms = ["trim", "to_integer"];
      else if (f.type === "number") transforms = ["trim", "to_number"];
      else if (f.type === "boolean") transforms = ["to_boolean"];
      else if (f.type === "date") transforms = ["trim", "iso_date"];
      else if (f.type === "email") transforms = ["trim", "lowercase"];
      else transforms = ["trim"];
    }
    return {
      target: f.name,
      source: source?.name ?? null,
      constant: null,
      transforms,
    };
  });
  const missing = mappings.filter((m) => m.source === null);
  return {
    summary:
      "Deterministic sample proposal. Review each mapping before approval; no AI request was made.",
    mappings,
    risks: [
      "Invalid values and duplicate primary keys will be quarantined, not silently repaired.",
      "Date parsing accepts ISO dates only. No ambiguous dates or currency formats are inferred.",
      ...missing.map(
        (m) =>
          `No source field found for ${m.target}; a reviewer must map it or approve an explicit constant.`,
      ),
    ],
    questions: [
      "Do the source and target numeric fields use the same units?",
      ...missing.map((m) => `What value should populate ${m.target}?`),
    ],
  };
}
