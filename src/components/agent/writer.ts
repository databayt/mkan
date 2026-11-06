import "server-only";

import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AGENT_MODEL, canSpend, claudeClient, noteFailure, recordSpend, type SpendLane } from "./claude";
import { KNOWLEDGE } from "./knowledge";
import { districtName } from "@/lib/geo/rwanda-places";
import { zoneLabel } from "@/lib/geo/kigali-zones";
import type { CostLine } from "./cost";
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

/**
 * Languages the writer may write in. rw is on since 2026-11-07 (Abdout: Haiku writes Kinyarwanda),
 * behind looksKinyarwanda — a reply that fails it falls back to the template — and every rw piece is
 * kept for a native speaker's read (`pnpm agent:rw-samples`). Kill switch: AGENT_WRITER_LOCALES=en,ar.
 */
export const WRITER_LOCALES = (process.env.AGENT_WRITER_LOCALES ?? "en,ar,rw")
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
  /** The neighbourhood (or sector) the home is in, when known. */
  neighbourhood: string | null;
  /** apartment · house with its own gate · room · studio; null when the ad does not say. */
  type: string | null;
  /** "furnished" / "unfurnished"; null when the ad does not say. */
  furnishing: string | null;
  /** The move-in terms the ad states ("deposit of 1 month", "no commission", "water included"). No money. */
  terms: string[];
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
why: one entry per home, with its ref, under 100 characters: why it fits, from its facts — neighbourhood or area, type, size, furnishing, its "terms", the must-haves it "has", its "distance", a "typicalPrice" or "inBudget". For "askBroker" items, say to ask the broker about them. The first home leads the list: say why.

Hard rules:
- Never write a price, an amount of money or a currency. The cards show prices.
- Use only numbers that appear in the facts (bedrooms, bathrooms, km, the count of homes).
- Never say a home is available, free or booked unless its "confirmed" is true.
- Never invent a feature, a place or a fact.`;

/**
 * WhatsApp lists the homes itself and never shows the per-home lines: asking for them cost ~2 s a
 * shortlist (≈ 340 tokens written for nothing, 2026-11-07). There the writer writes the reply only.
 */
const REPLY_ONLY_SYSTEM = `${SYSTEM}

This reply goes to WhatsApp, which lists the homes itself: write only "reply" and leave "why" empty.`;
const REPLY_ONLY_MAX_TOKENS = 400;

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

// Kinyarwanda words a real rw sentence nearly always carries (two are required), and the English and
// French words that give away a reply written in the wrong language.
const RW_MARKERS = new Set(
  "ni na mu ku muri kuri kandi cyangwa ariko kuko kugira ngo nta ntabwo hari iyi iyo uyu izi ibi ubu iri ari ya za wa ba bya cya rya ka y n inzu amazu ibyumba icyumba ubwiherero amazi umuriro hafi neza cyane murakoze muraho mwiriwe mwaramutse nabonye twabonye ufite ifite zifite dufite ushaka urashaka mushaka ibyo byose zose yose iki iki ese mbese kubona gukodesha ukwezi amezi umujyi akarere umurenge"
    .split(" "),
);
const EN_STOP = new Set("the and you your is are for with this that we have found homes home near of to".split(" "));
const FR_STOP = new Set("le la les des une un et pour avec vous nous est sont dans du".split(" "));

/**
 * Whether rw text reads as Kinyarwanda: Latin script, two or more Kinyarwanda words, at most one
 * English and one French giveaway, and no word three times running (a model stuck in a loop).
 */
export function looksKinyarwanda(text: string): boolean {
  if (ARABIC_RE.test(text)) return false;
  const words = text
    .toLowerCase()
    .split(/[^a-zà-ÿ]+/i)
    .filter(Boolean);
  if (words.length === 0) return false;
  const markers = words.filter((w) => RW_MARKERS.has(w)).length;
  const en = words.filter((w) => EN_STOP.has(w)).length;
  const fr = words.filter((w) => FR_STOP.has(w)).length;
  for (let i = 2; i < words.length; i++) if (words[i] === words[i - 1] && words[i] === words[i - 2]) return false;
  return markers >= 2 && en <= 1 && fr <= 1;
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
  if (lang === "rw" && !looksKinyarwanda(t)) return null;
  return t;
}

// ── Calls ────────────────────────────────────────────────────────────────────

/** Whether a reply in this language may be written now (language allowed, credits left). */
export async function canWrite(lang: string): Promise<boolean> {
  return WRITER_LOCALES.includes(lang) && !!claudeClient() && (await canSpend());
}

async function call(system: string, content: string, timeoutMs: number, lane: SpendLane, maxTokens = 1_200) {
  const client = claudeClient();
  if (!client || !(await canSpend())) return null;
  try {
    const res = await client.messages.parse(
      {
        model: AGENT_MODEL,
        max_tokens: maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
        // No thinking: Haiku 5.5's default adaptive thinking runs past the 2.5 s budget (2026-11-03).
        thinking: { type: "disabled" },
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
  /** Kinyarwanda only: every piece as written, passed or not, for the native read (noteRwSamples). */
  samples?: RwSample[];
}

/** A Kinyarwanda piece the writer produced, and whether the guard let it through. */
export interface RwSample {
  kind: "reply" | "why" | "answer";
  text: string;
  passed: boolean;
}

/**
 * Keep rw pieces for a native speaker (WaState `rw-samples`; `pnpm agent:rw-samples` writes them to
 * docs/i18n/rw-review-2026-11.csv and empties the list). Best effort: a failure costs a sample only.
 */
export async function noteRwSamples(taskId: string, samples: RwSample[] | undefined): Promise<void> {
  if (!samples?.length) return;
  const at = new Date().toISOString();
  const rows = JSON.stringify(samples.map((s) => ({ ...s, taskId, at })));
  const { db } = await import("@/lib/db");
  await db
    .$executeRaw`INSERT INTO "WaState" ("key", "value", "updatedAt") VALUES ('rw-samples', ${rows}::jsonb, now())
      ON CONFLICT ("key") DO UPDATE SET "value" = COALESCE("WaState"."value", '[]'::jsonb) || ${rows}::jsonb, "updatedAt" = now()`
    .catch(() => {});
}

/** The reply and per-home lines for a shortlist; each piece guarded on its own. */
export async function writeReply(
  facts: WriterFacts,
  timeoutMs = WRITE_TIMEOUT_MS,
  lane: SpendLane = "agent-write",
  { replyOnly = false }: { replyOnly?: boolean } = {},
): Promise<Written | null> {
  const out = replyOnly
    ? await call(REPLY_ONLY_SYSTEM, JSON.stringify(facts), timeoutMs, lane, REPLY_ONLY_MAX_TOKENS)
    : await call(SYSTEM, JSON.stringify(facts), timeoutMs, lane);
  if (out && replyOnly) out.why = [];
  if (!out) return null;
  const allowed = allowedNumbers(facts.count, facts.homes.map((h) => [h.bedrooms, h.bathrooms, h.distance, h.title, h.terms]), facts.search, facts.widened);
  const anyConfirmed = facts.homes.some((h) => h.confirmed);
  const guard = (text: string, maxLen: number, confirmed: boolean) => guardText(text, { allowed, maxLen, lang: facts.lang, anyConfirmed: confirmed });
  const refs = new Map(facts.homes.map((h) => [h.ref, h]));
  const why = new Map<string, string>();
  const samples: RwSample[] = [];
  for (const w of out.why) {
    const home = refs.get(w.ref);
    const line = home ? guard(w.text, MAX_WHY, home.confirmed) : null;
    if (home && line) why.set(w.ref, line);
    if (facts.lang === "rw" && w.text.trim()) samples.push({ kind: "why", text: w.text.trim(), passed: !!line });
  }
  const reply = guard(out.reply, MAX_REPLY, anyConfirmed);
  if (facts.lang === "rw" && out.reply.trim()) samples.unshift({ kind: "reply", text: out.reply.trim(), passed: !!reply });
  return { reply, why, ...(samples.length ? { samples } : {}) };
}

/** An answer to a question about renting, from KNOWLEDGE only. */
export async function writeAnswer(
  question: string,
  lang: WriterFacts["lang"],
  timeoutMs = WRITE_TIMEOUT_MS,
  lane: SpendLane = "agent-write",
  onSample?: (s: RwSample) => void,
): Promise<string | null> {
  const out = await call(ANSWER_SYSTEM, JSON.stringify({ lang, question }), timeoutMs, lane);
  if (!out) return null;
  // The knowledge's own figures (3 months, 25–30%, 5,000, 12%) may be quoted; nothing else.
  const text = guardText(out.reply, { allowed: allowedNumbers(KNOWLEDGE), maxLen: MAX_ANSWER, lang, anyConfirmed: false, allowMoney: true });
  if (lang === "rw" && out.reply.trim()) onSample?.({ kind: "answer", text: out.reply.trim(), passed: !!text });
  return text;
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
const ASK_EN = { furnishing: "furnishing", homeType: "the type of home", water: "whether water is included", commission: "the commission" } as const;
const HOME_TYPE_EN = { apartment: "an apartment", house: "a house with its own gate", room: "a room", studio: "a studio" } as const;
const PURPOSE_EN = { family: "for a family", study: "for studies", business: "for work" } as const;
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
    r.homeType ? HOME_TYPE_EN[r.homeType] : null,
    r.purpose ? PURPOSE_EN[r.purpose] : null,
    r.waterIncluded ? "water included in the rent" : null,
    r.noCommission ? "no broker commission" : null,
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
    case "water":
      return "homes where water is paid separately";
    case "commission":
      return "homes with a broker commission";
    case "budget":
      return "a slightly higher budget";
    case "district":
      return "all of Kigali";
  }
}

const plainNumber = (n: number) => String(Math.round(n * 10) / 10);

/**
 * A home's terms as the writer may say them: only what the ad states (a
 * "typical" line is Mkan's estimate, not a fact about the home), never money —
 * the guard allows these numbers because they are in the facts.
 */
export function termsFacts(lines: CostLine[]): string[] {
  const out: string[] = [];
  const line = (k: CostLine["key"]) => (lines ?? []).find((l) => l.key === k);
  const deposit = line("deposit");
  if (deposit?.source === "ad" && deposit.qty != null) out.push(deposit.qty === 0 ? "no deposit" : `a deposit of ${plainNumber(deposit.qty)} month${deposit.qty === 1 ? "" : "s"}`);
  const commission = line("commission");
  // No commission line on a broker-market home: the owner posted it, or the ad says none.
  if (!commission && (lines ?? []).some((l) => l.key === "rentInAdvance")) out.push("no commission");
  else if (commission?.source === "ad" && commission.qty != null) out.push(`a ${plainNumber(commission.qty)}% commission`);
  for (const k of ["water", "electricity"] as const) {
    const l = line(k);
    if (l?.status === "included") out.push(`${k} included in the rent`);
    else if (l?.status === "separate") out.push(`${k} paid separately`);
  }
  return out;
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
      neighbourhood: zoneLabel(s.zone, "en"),
      type: s.bedrooms === 0 ? "studio" : s.homeType ? HOME_TYPE_EN[s.homeType] : null,
      furnishing: s.furnished === true ? "furnished" : s.furnished === false ? "unfurnished" : null,
      terms: s.cost.period === "month" ? termsFacts(s.cost.lines) : [],
      bedrooms: s.bedrooms,
      bathrooms: s.bathrooms,
      period: s.cost.period,
      typicalPrice: s.reasons.includes("typicalPrice"),
      inBudget: s.reasons.includes("inBudget") ? true : s.reasons.includes("slightlyOverBudget") ? false : null,
      has: (s.mustHaves?.matched ?? []).map((k) => MUST_HAVE_EN[k] ?? k),
      askBroker: [...(s.mustHaves?.unknown ?? []).map((k) => MUST_HAVE_EN[k] ?? k), ...(s.ask ?? []).map((k) => ASK_EN[k])],
      distance: s.place ? `${s.place.km} km from ${s.place.name}` : null,
      confirmed: s.availability === "confirmed",
      brokerHome: !!s.lead,
    })),
    followUp: input.refine === "stay" ? "months or nights" : input.refine === "maxPrice" ? "the budget" : null,
    unplaced: input.unplaced ?? null,
  };
}
