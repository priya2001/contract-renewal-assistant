import type { Item } from "./types";
const DAY = 86_400_000;
export function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Use a valid YYYY-MM-DD date.");
  const d = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    throw new Error("That calendar date does not exist.");
  return d;
}
export function shiftDays(date: string, amount: number): string {
  if (!Number.isInteger(amount) || Math.abs(amount) > 36500)
    throw new Error("Day offset is outside the supported range.");
  return new Date(parseDate(date).getTime() + amount * DAY)
    .toISOString()
    .slice(0, 10);
}
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function daysUntil(date: string, today = todayISO()) {
  return Math.round(
    (parseDate(date).getTime() - parseDate(today).getTime()) / DAY,
  );
}
export type Resolution = {
  date: string | null;
  reason: string;
  dependencies: string[];
};
export function resolveDate(
  item: Item,
  items: Item[],
  today = todayISO(),
  seen = new Set<string>(),
): Resolution {
  const r = item.dateRule;
  if (seen.has(item.key))
    return {
      date: null,
      reason: "Circular date dependency. Review the anchor.",
      dependencies: [],
    };
  seen.add(item.key);
  if (r.type === "none")
    return {
      date: null,
      reason: "No calculable date. Review the clause or clarify the trigger.",
      dependencies: [],
    };
  try {
    if (r.type === "fixed")
      return {
        date: parseDate(r.date ?? "")
          .toISOString()
          .slice(0, 10),
        reason: "Explicit calendar date",
        dependencies: [],
      };
    if (r.type === "monthly") {
      if (!r.dayOfMonth || r.dayOfMonth < 1 || r.dayOfMonth > 28)
        return {
          date: null,
          reason: "Monthly dates after day 28 require a month-end convention.",
          dependencies: [],
        };
      const t = parseDate(today);
      let d = new Date(
        Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), r.dayOfMonth),
      );
      if (d < t)
        d = new Date(
          Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, r.dayOfMonth),
        );
      return {
        date: d.toISOString().slice(0, 10),
        reason: "Next monthly occurrence (UTC calendar date)",
        dependencies: [],
      };
    }
    if (r.basis !== "calendar")
      return {
        date: null,
        reason:
          r.basis === "business"
            ? "Business-day rule needs an agreed holiday calendar. No date assumed."
            : "Calendar or business days must be clarified.",
        dependencies: [],
      };
    if (
      r.days === null ||
      !Number.isInteger(r.days) ||
      r.days < 0 ||
      !r.direction
    )
      return {
        date: null,
        reason: "The date offset is incomplete.",
        dependencies: [],
      };
    const anchor = items.find((i) => i.key === r.anchorId);
    if (!anchor || anchor.status === "rejected")
      return {
        date: null,
        reason: "The anchor is missing or rejected.",
        dependencies: [],
      };
    const base = resolveDate(anchor, items, today, seen);
    if (!base.date)
      return { ...base, dependencies: [anchor.id, ...base.dependencies] };
    return {
      date: shiftDays(base.date, r.direction === "before" ? -r.days : r.days),
      reason: `${r.days} calendar days ${r.direction} “${anchor.title}” (${base.date})`,
      dependencies: [anchor.id, ...base.dependencies],
    };
  } catch (e) {
    return {
      date: null,
      reason: e instanceof Error ? e.message : "Invalid date rule",
      dependencies: [],
    };
  }
}
export function schedule(items: Item[], today = todayISO()) {
  return items
    .filter((i) => i.status !== "rejected" && i.kind !== "effective_date")
    .map((item) => {
      const result = resolveDate(item, items, today);
      const reviewed =
        item.status === "approved" &&
        !item.stale &&
        result.dependencies.every((id) =>
          items.some((i) => i.id === id && i.status === "approved" && !i.stale),
        );
      return {
        item,
        ...result,
        reviewed,
        reminderDate: result.date
          ? shiftDays(result.date, -item.reminderDays)
          : null,
        days: result.date ? daysUntil(result.date, today) : null,
      };
    })
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}
export function formatDate(date: string | null) {
  return date
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parseDate(date))
    : "Needs clarification";
}
