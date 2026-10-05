export type Kind =
  | "party"
  | "effective_date"
  | "expiry"
  | "renewal"
  | "termination"
  | "notice"
  | "obligation"
  | "ambiguity"
  | "policy";
export type Source = { sectionId: string; quote: string };
export type Section = {
  id: string;
  label: string;
  text: string;
  document: "contract" | "policy";
};
export type DateRule = {
  type: "none" | "fixed" | "relative" | "monthly";
  date: string | null;
  anchorId: string | null;
  days: number | null;
  direction: "before" | "after" | null;
  basis: "calendar" | "business" | "unspecified" | null;
  dayOfMonth: number | null;
};
export type ExtractedItem = {
  key: string;
  kind: Kind;
  title: string;
  description: string;
  party: string;
  certainty: "explicit" | "uncertain";
  sources: Source[];
  question: string;
  dateRule: DateRule;
  reminderDays: number;
};
export type Item = ExtractedItem & {
  id: string;
  status: "pending" | "approved" | "rejected";
  stale: boolean;
  revision: number;
  note: string;
  original: ExtractedItem;
  citationValid: boolean;
  updatedAt: string;
};
export type DocumentData = { name: string; sections: Section[] };
export type Version = {
  id: string;
  number: number;
  title: string;
  createdAt: string;
  mode: "demo" | "ai";
  contractName: string;
  policyName: string | null;
  items: Item[];
  sections: Section[];
  warnings: string[];
};
export type HistoryEntry = {
  id: string;
  versionId: string;
  itemId: string | null;
  action: string;
  createdAt: string;
  before: string | null;
  after: string | null;
};
export type Workspace = {
  currentId: string | null;
  versions: Version[];
  history: HistoryEntry[];
  aiConfigured: boolean;
};
export const NONE: DateRule = {
  type: "none",
  date: null,
  anchorId: null,
  days: null,
  direction: null,
  basis: null,
  dayOfMonth: null,
};
export const kindLabels: Record<Kind, string> = {
  party: "Party",
  effective_date: "Effective date",
  expiry: "Expiry",
  renewal: "Renewal",
  termination: "Termination",
  notice: "Notice",
  obligation: "Obligation",
  ambiguity: "Clarification",
  policy: "Policy",
};
