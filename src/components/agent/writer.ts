import "server-only";

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AGENT_MODEL, canSpend, claudeClient, noteFailure, recordSpend, type SpendLane } from "./claude";
import { KNOWLEDGE } from "./knowledge";
import { districtName } from "@/lib/geo/rwanda-places";
import type { Relaxed } from "./relax";
import type { Requirements } from "./requirements";
import type { ShortlistItem } from "./types";

/**
 * The model writes the words; code owns the numbers.
 *
 * After the cards are ranked, Claude Haiku 5.5 turns Mkan's facts into a short
 * reply in the tenant's language and a one-line "why this home" per card — or
 * answers a question about renting from KNOWLEDGE. Every piece passes a guard
 * before anyone sees it: no number that is not in the facts (Arabic-Indic
 * digits included), no price or currency at all (the cards show those), no
 * "available" unless a broker confirmed, the right script for the language.
 * A piece that fails falls back to the template, never to a guess.
 */

const WRITE_TIMEOUT_MS = 2_500;
const MAX_REPLY = 320;
const MAX_ANSWER = 460;
const MAX_WHY = 110;

/** Languages the writer may write in. rw waits for a native speaker's review of samples (pnpm agent:eval-writer). */
export const WRITER_LOCALES = (process.env.AGENT_WRITER_LOCALES ?? "en,ar")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const WriterOut = z.object({
  reply: z.string(),
  why: z.array(z.object({ ref: z.string(), text: z.string() })),
});

export interface WriterHome {
  ref: string;
  title: string;
  area: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  period: "night" | "month";
  typicalPrice: boolean;
  inBudget: boolean | null;
  has: string[];
  askBroker: string[];
  distance: string | null;
  confirmed: boolean;
  brokerHome: boolean;
}

export interface WriterFacts {
  lang: "en" | "ar" | "rw";
  search: string[];
  widened: string[];
  count: number;
  homes: WriterHome[];
  followUp: "months or nights" | "the budget" | null;
  /** A place the tenant named that Mkan could not put on the map — ask where it is. */
  unplaced?: string | null;
}

const SYSTEM = `You write Mkan's short reply to a tenant looking for a home in Kigali, Rwanda, from facts Mkan gives you as JSON. Mkan's code found and ranked the homes; you only put it into words.

Write in the language given by "lang" (en English, ar Arabic, rw Kinyarwanda). Sound like a helpful local friend: warm, plain, brief. No marketing words, no emojis, no lists.

reply: 1–2 sentences, under 280 characters. Say what was found for their search. If "widened" is not empty, say what Mkan widened to find homes. If "unplaced" is set, ask which neighbourhood that place is in. If "followUp" is set, end by asking about it naturally.
why: one entry per home, with its ref, under 100 characters: why it fits, from its facts — area, size, the must-haves it "has", its "distance", a "typicalPrice" or "inBudget". For "askBroker" items, say to ask the broker about them. The first home leads the list: say why.

Hard rules:
- Never write a price, an amount of money or a currency. The cards show prices.
- Use only numbers that appear in the facts (bedrooms, bathrooms, km, the count of homes).
- Never say a home is available, free or booked unless its "confirmed" is true.
- Never invent a feature, a place or a fact.`;

const ANSWER_SYSTEM = `You answer one question from a tenant looking for a home in Kigali, Rwanda, for Mkan, a rental app. Answer ONLY from the knowledge lines given; never add facts, prices or promises they do not contain. Write in the language given by "lang" (en English, ar Arabic, rw Kinyarwanda): 2–3 plain sentences, under 400 characters, warm, no lists, no emojis. If the knowledge does not cover the question, say you are not sure and that Mkan can find homes, estimate move-in costs and ask brokers. Put the answer in "reply" and leave "why" empty.

Knowledge:
${KNOWLEDGE.map((k) => `- ${k}`).join("\n")}`;

// ── The guard ────────────────────────────────────────────────────────────────

const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";
export const asciiDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d))).replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d))).replace(/٫/g, ".");

const MONEY_RE = /\b(?:RWF|FRW|USD|Rwf|francs?)\b|\$|£|€|فرنك|دولار|ريال|amafaranga|\bk\b(?=\s|$)/i;
const AVAILABLE_RE = /availab|\bbooked\b|\breserved\b|vacant|متاح|متوفر|متوفّر|محجوز|شاغر|irahari|iraboneka|irakodeshwa/i;
const ARABIC_RE = /[؀-ۿ]/;
/** A number as people write it: "2", "1.2", "1,200" (read as 1200 on both sides). */
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

/** Every number the facts contain, as text ("2", "1.2"), for the guard to allow. */
export function allowedNumbers(...sources: unknown[]): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === "number") out.add(String(v));
    else if (typeof v === "string") for (const n of asciiDigits(v).match(NUMBER_RE) ?? []) out.add(n.replace(/,/g, ""));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  sources.forEach(walk);
  return out;
}

/**
 * The writing, or null when it breaks a rule. Numbers are read across
 * thousands separators ("1,200" is 1200, a number the facts must hold).
 */
export function guardText(
  text: string,
  { allowed, maxLen, lang, anyConfirmed, allowMoney = false }: { allowed: Set<string>; maxLen: number; lang: WriterFacts["lang"]; anyConfirmed: boolean; allowMoney?: boolean },
): string | null {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t || t.length > maxLen) return null;
  const plain = asciiDigits(t);
  for (const n of plain.match(NUMBER_RE) ?? []) if (!allowed.has(n.replace(/,/g, ""))) return null;
  if (!allowMoney && MONEY_RE.test(plain)) return null;
  if (!anyConfirmed && AVAILABLE_RE.test(plain)) return null;
  if (lang === "ar" ? !ARABIC_RE.test(t) : ARABIC_RE.test(t)) return null;
  return t;
}

// ── Calls ────────────────────────────────────────────────────────────────────

/** Whether a reply in this language may be written now (language allowed, credits left). */
export async function canWrite(lang: string): Promise<boolean> {
  return WRITER_LOCALES.includes(lang) && !!claudeClient() && (await canSpend());
}

async function call(system: string, content: string, timeoutMs: number, lane: SpendLane) {
  const client = claudeClient();
  if (!client || !(await canSpend())) return null;
  try {
    const res = await client.messages.parse(
      {
        model: AGENT_MODEL,
        max_tokens: 1_200,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        output_config: { effort: "low", format: zodOutputFormat(WriterOut) },
      },
      { timeout: timeoutMs },
    );
    void recordSpend(lane, res.usage);
    return res.stop_reason === "refusal" ? null : res.parsed_output;
  } catch (err) {
    await noteFailure(err);
    console.warn(`[agent] claude write failed — templates: ${(err as Error).message}`);
    return null;
  }
}

export interface Written {
  reply: string | null;
  /** ref → line, only the lines that passed the guard. */
  why: Map<string, string>;
}

/** The reply and per-home lines for a shortlist; each piece guarded on its own. */
export async function writeReply(facts: WriterFacts, timeoutMs = WRITE_TIMEOUT_MS, lane: SpendLane = "agent-write"): Promise<Written | null> {
  const out = await call(SYSTEM, JSON.stringify(facts), timeoutMs, lane);
  if (!out) return null;
  const allowed = allowedNumbers(facts.count, facts.homes.map((h) => [h.bedrooms, h.bathrooms, h.distance, h.title]), facts.search, facts.widened);
  const anyConfirmed = facts.homes.some((h) => h.confirmed);
  const guard = (text: string, maxLen: number, confirmed: boolean) => guardText(text, { allowed, maxLen, lang: facts.lang, anyConfirmed: confirmed });
  const refs = new Map(facts.homes.map((h) => [h.ref, h]));
  const why = new Map<string, string>();
  for (const w of out.why) {
    const home = refs.get(w.ref);
    const line = home ? guard(w.text, MAX_WHY, home.confirmed) : null;
    if (home && line) why.set(w.ref, line);
  }
  return { reply: guard(out.reply, MAX_REPLY, anyConfirmed), why };
}

/** An answer to a question about renting, from KNOWLEDGE only. */
export async function writeAnswer(question: string, lang: WriterFacts["lang"], timeoutMs = WRITE_TIMEOUT_MS, lane: SpendLane = "agent-write"): Promise<string | null> {
  const out = await call(ANSWER_SYSTEM, JSON.stringify({ lang, question }), timeoutMs, lane);
  if (!out) return null;
  // The knowledge's own figures (3 months, 25–30%, 5,000, 12%) may be quoted; nothing else.
  return guardText(out.reply, { allowed: allowedNumbers(KNOWLEDGE), maxLen: MAX_ANSWER, lang, anyConfirmed: false, allowMoney: true });
}

// ── Facts for the writer ─────────────────────────────────────────────────────
// Plain English the model translates; no money and no dates, so the guard's
// list of allowed numbers stays small (rooms, km, counts).


const MUST_HAVE_EN: Record<string, string> = {
  parking: "parking",
  pets: "pets allowed",
  wifi: "wifi",
  workspace: "a workspace",
  ac: "air conditioning",
  security: "security",
  quiet: "a quiet area",
  transit: "near transport",
  kitchen: "a kitchen",
  washer: "a washing machine",
  balcony: "a balcony",
  garden: "a garden",
  elevator: "a lift",
  waterTank: "a water tank",
  generator: "backup power",
};
const AREA_EN = { center: "near the city centre", business: "near the business district", university: "near a university" } as const;
const district = (code: string) => districtName(code.toUpperCase(), "en") || code;

export function describeSearch(r: Partial<Requirements>): string[] {
  return [
    r.stay === "long" ? "monthly rent" : r.stay === "short" ? "a short stay" : null,
    r.neighbourhood ?? (r.district ? `${district(r.district)} district` : null),
    r.near ? `near ${r.near.name}` : null,
    r.area ? AREA_EN[r.area] : null,
    r.bedrooms === 0 ? "a studio" : r.bedrooms != null ? `${r.bedrooms} bedrooms` : null,
    r.bathrooms ? `${r.bathrooms}+ bathrooms` : null,
    r.furnished === true ? "furnished" : r.furnished === false ? "unfurnished" : null,
    r.family ? "for a family" : null,
    r.compound ? "a standalone house with its own gate" : null,
    r.cheap ? "cheapest first" : r.maxPrice ? "within their budget" : null,
    r.nights ? `${r.nights} nights` : null,
    r.guests ? `${r.guests} guests` : null,
    r.mustHaves?.length ? `must have ${r.mustHaves.map((k) => MUST_HAVE_EN[k] ?? k).join(", ")}` : null,
    r.months ? `a ${r.months}-month lease` : null,
  ].filter((x): x is string => !!x);
}

function widenedEn(step: Relaxed): string {
  switch (step.key) {
    case "neighbourhood":
      return typeof step.to === "string" ? `all of ${district(step.to)} district` : "the wider district";
    case "area":
      return "any part of the city";
    case "near":
      return `further from ${String(step.to ?? "the place")}`;
    case "type":
      return "any type of home";
    case "bathrooms":
      return "any number of bathrooms";
    case "furnished":
      return "furnished or not";
    case "budget":
      return "a slightly higher budget";
    case "district":
      return "all of Kigali";
  }
}

export function writerFacts(input: {
  lang: WriterFacts["lang"];
  requirements: Requirements;
  relaxed: Relaxed[];
  shortlist: ShortlistItem[];
  refine?: "stay" | "maxPrice";
  unplaced?: string | null;
}): WriterFacts {
  return {
    lang: input.lang,
    search: describeSearch(input.requirements),
    widened: input.relaxed.map(widenedEn),
    count: input.shortlist.length,
    homes: input.shortlist.map((s, i) => ({
      ref: `h${i + 1}`,
      title: s.title,
      area: s.district ? district(s.district) : null,
      bedrooms: s.bedrooms,
      bathrooms: s.bathrooms,
      period: s.cost.period,
      typicalPrice: s.reasons.includes("typicalPrice"),
      inBudget: s.reasons.includes("inBudget") ? true : s.reasons.includes("slightlyOverBudget") ? false : null,
      has: (s.mustHaves?.matched ?? []).map((k) => MUST_HAVE_EN[k] ?? k),
      askBroker: (s.mustHaves?.unknown ?? []).map((k) => MUST_HAVE_EN[k] ?? k),
      distance: s.place ? `${s.place.km} km from ${s.place.name}` : null,
      confirmed: s.availability === "confirmed",
      brokerHome: !!s.lead,
    })),
    followUp: input.refine === "stay" ? "months or nights" : input.refine === "maxPrice" ? "the budget" : null,
    unplaced: input.unplaced ?? null,
  };
}
