/**
 * A tenant, from what the database already knows — without I/O (2026-11-15). The chat code has no CRM
 * call sites: tenant-sync.ts finds profiles that changed and this builds their Twenty fields.
 *
 * Truth rule: mkan reports what it observes (source, language, need, times, a STOP). It never writes a
 * value a person edits in Twenty back over their edit: `stage` only on a tenant Twenty has not seen, and
 * `optOut` only to true.
 */
import { coerceMemory } from "@/components/agent/memory";
import { TENANT_STAGES, type TenantStage } from "./deal-sync-pure";

export const TENANT_SOURCES = ["TIKTOK_CODE", "TIKTOK_LINK", "TIKTOK_BIO", "TODAY", "K_PAGE", "WEB", "WHATSAPP", "REFERRAL", "ORGANIC"] as const;
const SOURCE_OF: Record<string, (typeof TENANT_SOURCES)[number]> = {
  tiktok: "TIKTOK_CODE",
  tiktok_code: "TIKTOK_CODE",
  tiktok_link: "TIKTOK_LINK",
  tiktok_bio: "TIKTOK_BIO",
  today: "TODAY",
  k_page: "K_PAGE",
  web: "WEB",
  whatsapp: "WHATSAPP",
  referral: "REFERRAL",
  organic: "ORGANIC",
};
const LANGS = ["EN", "AR", "RW", "FR", "SW"];
const DISTRICTS = ["GASABO", "KICUKIRO", "NYARUGENGE"];

export interface TenantRow {
  id: string;
  waPhone: string | null;
  /** A number left on the web (TenantRequest.phone) when there is no WhatsApp number. */
  webPhone: string | null;
  firstSource: string | null;
  memory: unknown;
  name: string | null;
  createdAt: Date;
  /** The latest task: its locale, last activity, whether it showed homes, and its id (the chat link). */
  task: { id: string; locale: string; updatedAt: Date; shown: boolean } | null;
}

export function sourceOf(firstSource: string | null | undefined, hasWhatsApp: boolean): (typeof TENANT_SOURCES)[number] {
  return SOURCE_OF[String(firstSource ?? "").toLowerCase()] ?? (hasWhatsApp ? "WHATSAPP" : "WEB");
}

export function languageOf(locale: string | null | undefined): string | undefined {
  const l = String(locale ?? "").slice(0, 2).toUpperCase();
  return LANGS.includes(l) ? l : undefined;
}

/** "2 bed · Kimironko · up to 450,000/mo" from the sticky search fields. */
export function needSummaryOf(memory: unknown): { text: string | undefined; district?: string; budget?: number; bedrooms?: number } {
  const prefs = coerceMemory(memory).prefs;
  const val = <T>(k: keyof typeof prefs): T | undefined => prefs[k]?.value as T | undefined;
  const bedrooms = Number(val<number>("bedrooms"));
  const budget = Number(val<number>("maxPrice"));
  const districtRaw = String(val<string>("district") ?? "").toUpperCase();
  const place = [val<string>("neighbourhood"), val<string>("area")].find((x) => typeof x === "string" && x.trim());
  const parts = [
    Number.isFinite(bedrooms) && bedrooms > 0 ? `${bedrooms} bed` : null,
    place ? String(place) : districtRaw || null,
    Number.isFinite(budget) && budget > 0 ? `up to ${budget.toLocaleString("en-US")}/${val<string>("pricePeriod") === "night" ? "night" : "mo"}` : null,
  ].filter(Boolean);
  return {
    text: parts.length ? parts.join(" · ") : undefined,
    district: DISTRICTS.includes(districtRaw) ? districtRaw : undefined,
    budget: Number.isFinite(budget) && budget > 0 ? Math.round(budget) : undefined,
    bedrooms: Number.isFinite(bedrooms) && bedrooms > 0 ? bedrooms : undefined,
  };
}

export interface SweepContext {
  /** Twenty already has this tenant, or a queued op will create it with a stage: do not send one. */
  stageKnown: boolean;
  stopped: boolean;
  chatLink: string | null;
}

export function buildSweepFields(row: TenantRow, ctx: SweepContext): Record<string, unknown> {
  const phone = row.waPhone ?? row.webPhone;
  const need = needSummaryOf(row.memory);
  const out: Record<string, unknown> = {
    mkanProfileId: row.id,
    name: row.name?.trim() || undefined,
    $phone: phone ?? undefined,
    language: languageOf(row.task?.locale),
    needSummary: need.text,
    source: sourceOf(row.firstSource, !!row.waPhone),
    district: need.district,
    budgetRwf: need.budget,
    bedrooms: need.bedrooms,
    firstContactAt: row.createdAt.toISOString(),
    lastMessageAt: row.task?.updatedAt.toISOString(),
    chatLink: ctx.chatLink ? { primaryLinkUrl: ctx.chatLink, primaryLinkLabel: "Chat" } : undefined,
    // Only ever to true: a person may have set it in Twenty, and START in WhatsApp must not undo that.
    optOut: ctx.stopped ? true : undefined,
  };
  if (!ctx.stageKnown) out.stage = (row.task?.shown ? "SHOWN_HOMES" : "NEW") satisfies TenantStage;
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== null && v !== ""));
}

export const isTenantStage = (s: unknown): s is TenantStage => TENANT_STAGES.includes(s as TenantStage);
