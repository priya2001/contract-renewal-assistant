import { z } from "zod";
import { parseDate } from "./dates";
import type { ExtractedItem, Section } from "./types";
const bounded = z.string().max(6000);
export const dateRuleSchema = z
  .object({
    type: z.enum(["none", "fixed", "relative", "monthly"]),
    date: z.string().max(10).nullable(),
    anchorId: z.string().max(100).nullable(),
    days: z.number().int().min(0).max(36500).nullable(),
    direction: z.enum(["before", "after"]).nullable(),
    basis: z.enum(["calendar", "business", "unspecified"]).nullable(),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.type === "fixed") {
      try {
        parseDate(r.date ?? "");
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "A fixed rule needs a valid calendar date.",
        });
      }
    }
    if (
      r.type === "relative" &&
      (!r.anchorId || r.days === null || !r.direction || !r.basis)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "A relative rule needs an anchor, day count, direction and day convention.",
      });
    if (r.type === "monthly" && r.dayOfMonth === null)
      ctx.addIssue({
        code: "custom",
        message: "A monthly rule needs a day of the month.",
      });
  });
export const extractionItemSchema = z
  .object({
    key: z.string().min(1).max(100),
    kind: z.enum([
      "party",
      "effective_date",
      "expiry",
      "renewal",
      "termination",
      "notice",
      "obligation",
      "ambiguity",
      "policy",
    ]),
    title: z.string().min(1).max(240),
    description: bounded,
    party: z.string().max(300),
    certainty: z.enum(["explicit", "uncertain"]),
    sources: z
      .array(
        z
          .object({
            sectionId: z.string().max(100),
            quote: z.string().min(1).max(6000),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    question: bounded,
    dateRule: dateRuleSchema,
    reminderDays: z.number().int().min(0).max(365),
  })
  .strict();
export const extractionSchema = z
  .object({
    items: z.array(extractionItemSchema).max(100),
    warnings: z.array(bounded).max(30),
  })
  .strict()
  .superRefine(({ items }, ctx) => {
    if (new Set(items.map((i) => i.key)).size !== items.length)
      ctx.addIssue({ code: "custom", message: "Duplicate extraction keys." });
  });
export const documentSchema = z
  .object({
    name: z.string().min(1).max(240),
    sections: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            label: z.string().max(250),
            text: z.string().min(1).max(15000),
            document: z.enum(["contract", "policy"]),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();
export function verifySources(item: ExtractedItem, sections: Section[]) {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  return (
    item.sources.length > 0 &&
    item.sources.every((c) => {
      const s = sections.find((s) => s.id === c.sectionId);
      return !!s && normalize(s.text).includes(normalize(c.quote));
    })
  );
}
