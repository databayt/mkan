/**
 * Twenty → mkan, without I/O (2026-11-15): what a person's edit in Twenty means for mkan.
 *
 * Truth rule: Twenty wins on the fields a person edits — a deal's stage, terms, viewing time and share, a
 * tenant's opt-out, a broker's relationship and share. mkan keeps reporting what it observes (messages,
 * timestamps, counts) and never writes those fields back over an edit (see deal-sync-pure.ts, tenant-sync-pure.ts).
 */
import { normStage } from "./crm-ops-pure";

export type DealStatusWord = "VIEWED" | "SIGNED" | "PAID" | "LOST";
const FORWARD: Record<string, number> = { VIEWING_BOOKED: 0, VIEWED: 1, SIGNED: 2, PAID: 3 };

/**
 * The close word a stage moved in Twenty asks for, given the Deal's status in Neon. Only a step forward
 * (or LOST from an open deal) acts; the same stage again, a step back, or anything after LOST does nothing —
 * a dragged card that lands where it already was must not re-send a share request.
 */
export function dealStatusAction(twentyStage: unknown, current: string): DealStatusWord | null {
  const stage = normStage(twentyStage);
  if (current === "LOST") return null;
  if (stage === "LOST") return "LOST";
  if (stage !== "VIEWED" && stage !== "SIGNED" && stage !== "PAID") return null;
  return (FORWARD[stage] ?? 0) > (FORWARD[current] ?? 0) ? stage : null;
}

export interface DealEdits {
  viewingAt?: Date;
  mkanShare?: number | null;
  tripCost?: number | null;
  terms?: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** The Deal fields a person edited (only those listed in `updatedFields`). */
export function dealEdits(record: Record<string, any>, updatedFields: string[]): DealEdits {
  const has = (f: string) => updatedFields.includes(f);
  const out: DealEdits = {};
  if (has("viewingAt") && record.viewingAt) {
    const d = new Date(String(record.viewingAt));
    if (!Number.isNaN(d.getTime())) out.viewingAt = d;
  }
  if (has("mkanShareRwf")) out.mkanShare = num(record.mkanShareRwf);
  if (has("tripCostRwf")) out.tripCost = num(record.tripCostRwf);
  if (has("terms")) out.terms = typeof record.terms === "string" && record.terms.trim() ? record.terms.trim() : null;
  return out;
}

const TERMS = /^terms: .*$/m;
/** Deal.notes has no terms column: the terms live on one "terms: …" line, other notes untouched. */
export function withTermsNote(notes: string | null | undefined, terms: string | null): string | null {
  const rest = (notes ?? "").replace(TERMS, "").replace(/\n{2,}/g, "\n").trim();
  const line = terms ? `terms: ${terms.replace(/\s*\n\s*/g, " ")}` : "";
  const out = [line, rest].filter(Boolean).join("\n");
  return out || null;
}

/** A tenant record's numbers as digits (the form `tenant-stop` stores). */
export function digitsOf(numbers: (string | null | undefined)[]): string[] {
  return [...new Set(numbers.map((n) => String(n ?? "").replace(/[^\d]/g, "")).filter((n) => n.length >= 8))];
}

/** Only `optOut` turned ON acts, and only when the event says that field changed. */
export function isOptOutOn(record: Record<string, any>, updatedFields: string[]): boolean {
  return updatedFields.includes("optOut") && record.optOut === true;
}

/** The mkan key a Twenty deal record stands for: our link's key, else its own mkanKey field. */
export function dealKeyOf(linkKey: string | null | undefined, record: Record<string, any>): string | null {
  if (linkKey?.startsWith("deal:")) return linkKey.slice(5);
  return typeof record.mkanKey === "string" && record.mkanKey ? record.mkanKey : null;
}

/** Whether an event came from a script (API / SYSTEM) rather than a person's click. */
export function bySystem(record: Record<string, any>): boolean {
  const s = String(record?.updatedBy?.source ?? "").toUpperCase();
  return s === "API" || s === "SYSTEM";
}

export interface DealRowState {
  status: string;
  mkanShare: number | null;
  tripCost: number | null;
  notes: string | null;
  scheduledFor: Date | null;
}

/** The terms line out of Deal.notes (see withTermsNote). */
export const termsOf = (notes: string | null | undefined): string | null => /^terms: (.*)$/m.exec(notes ?? "")?.[1]?.trim() || null;

/**
 * Which person-edited fields of a Twenty deal differ from the Neon Deal — what the nightly reconcile
 * applies. A field EMPTY in Twenty is never copied (a blank is as likely "not filled in yet" as "cleared").
 */
export function dealDiff(record: Record<string, any>, row: DealRowState): string[] {
  const out: string[] = [];
  if (dealStatusAction(record.stage, row.status)) out.push("stage");
  const share = num(record.mkanShareRwf);
  if (share != null && share !== row.mkanShare) out.push("mkanShareRwf");
  const trip = num(record.tripCostRwf);
  if (trip != null && trip !== row.tripCost) out.push("tripCostRwf");
  const terms = typeof record.terms === "string" ? record.terms.trim().replace(/\s*\n\s*/g, " ") : "";
  if (terms && terms !== termsOf(row.notes)) out.push("terms");
  const at = record.viewingAt ? new Date(String(record.viewingAt)) : null;
  if (at && !Number.isNaN(at.getTime()) && row.scheduledFor && Math.abs(at.getTime() - row.scheduledFor.getTime()) > 60_000) out.push("viewingAt");
  return out;
}
