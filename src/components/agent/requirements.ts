/**
 * What the tenant asked for — the one structure every agent step reads.
 *
 * Two readers fill it: `parseRequirements` (deterministic, en/ar/rw, always
 * runs) and the Groq reader in `llm.ts` (fills what the regexes cannot, when the
 * free tier answers). Numbers come from the deterministic reader whenever it
 * found one — a 20B model misreads "400k" more often than a regex does.
 */
import { z } from "zod";
import { districtForPlace, DISTRICTS } from "@/lib/geo/rwanda-places";

export const DISTRICT_CODES = ["GASABO", "KICUKIRO", "NYARUGENGE"] as const;

export const RequirementsSchema = z.object({
  /** short = nights (Airbnb-style); long = monthly rent (Kigali broker market). */
  stay: z.enum(["short", "long"]).nullable(),
  district: z.enum(DISTRICT_CODES).nullable(),
  bedrooms: z.number().int().min(0).max(10).nullable(),
  furnished: z.boolean().nullable(),
  /** Ceiling in RWF per `pricePeriod`. */
  maxPrice: z.number().positive().nullable(),
  pricePeriod: z.enum(["night", "month"]).nullable(),
  nights: z.number().int().positive().max(365).nullable(),
  guests: z.number().int().positive().max(30).nullable(),
  /** Cash the tenant has for move-in (rent in advance + deposit + fees). */
  maxUpfront: z.number().positive().nullable(),
});

export type Requirements = z.infer<typeof RequirementsSchema>;

export const EMPTY_REQUIREMENTS: Requirements = {
  stay: null,
  district: null,
  bedrooms: null,
  furnished: null,
  maxPrice: null,
  pricePeriod: null,
  nights: null,
  guests: null,
  maxUpfront: null,
};

/** The fields the agent must have before searching — asked one at a time. */
export type HardField = "stay" | "maxPrice";

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

const MONTH_RE = /(month|monthly|\/mo\b|per mo\b|lease|long[- ]?term|year|شهر|شهري|سنة|سنوي|kwezi|umwaka)/i;
const NIGHT_RE = /(night|nightly|per night|weekend|short[- ]?stay|holiday|vacation|إقامة قصيرة|iminsi mike|ليلة|ليال|ليالي|ijoro|amajoro)/i;
const UPFRONT_RE = /(upfront|up front|move[- ]in|in hand|cash|savings|مقدم|مقدما|كاش|mbere)/i;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  "واحد": 1, "واحدة": 1, "اثنين": 2, "اثنتين": 2, "ثلاث": 3, "ثلاثة": 3, "أربع": 4, "اربع": 4, "خمس": 5,
  rimwe: 1, kimwe: 1, bibiri: 2, bitatu: 3, bine: 4, bitanu: 5,
};

/** "400k" / "400,000" / "400 000" / "1.2m" → numbers ≥ 1,000, with their offset. */
function moneyMentions(text: string): { value: number; index: number; raw: string }[] {
  const out: { value: number; index: number; raw: string }[] = [];
  const re = /(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(k(?![a-z])|m(?![a-z])|million|thousand|ألف|الف|مليون|ibihumbi)?/gi;
  for (const m of text.matchAll(re)) {
    const base = Number((m[1] ?? "").replace(/[,\s]/g, ""));
    if (!Number.isFinite(base)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const mult =
      unit === "k" || unit === "thousand" || unit === "ألف" || unit === "الف" || unit === "ibihumbi"
        ? 1_000
        : unit === "m" || unit === "million" || unit === "مليون"
          ? 1_000_000
          : 1;
    const value = base * mult;
    if (value >= 1_000) out.push({ value, index: m.index ?? 0, raw: m[0] });
  }
  return out;
}

function bedroomsOf(text: string): number | null {
  if (/\bstudio\b|ستوديو|استوديو/i.test(text)) return 0;
  if (/غرفتين|غرفتان/.test(text)) return 2;
  const digit =
    text.match(/(\d+)\s*-?\s*(?:bed(?:room)?s?|br\b|bhk|chambres?)/i) ??
    text.match(/(\d+)\s*(?:غرف|غرفة|غرفه)/) ??
    text.match(/(?:ibyumba|icyumba)\s*(?:by'?|bya|bibiri)?\s*(\d+)/i) ??
    text.match(/(?:غرف|غرفة)\s*(?:عدد)?\s*(\d+)/);
  if (digit) return Number(digit[1]);
  const word =
    text.match(/\b(one|two|three|four|five)\s*-?\s*bed(?:room)?s?/i) ??
    text.match(/(?:ibyumba|icyumba)\s+(kimwe|bibiri|bitatu|bine|bitanu)/i) ??
    text.match(/(واحدة|ثلاث|ثلاثة|أربع|اربع|خمس)\s*غرف/);
  return word ? WORD_NUMBERS[(word[1] ?? "").toLowerCase()] ?? null : null;
}

function nightsOf(text: string): number | null {
  const m = text.match(/(\d+)\s*(?:nights?|days?|ليال|ليالي|ليلة|أيام|ايام|يوم|iminsi|amajoro)/i);
  if (m) return Number(m[1]);
  if (/\b(a|one|1)\s*week\b|أسبوع|اسبوع|icyumweru/i.test(text)) return 7;
  if (/\bweekend\b|نهاية الأسبوع|wikendi/i.test(text)) return 2;
  return null;
}

function districtOf(text: string): Requirements["district"] {
  for (const d of DISTRICTS) {
    if (text.includes(d.nameAr)) return d.code;
  }
  const code = districtForPlace(text);
  return code === "UNKNOWN" ? null : code;
}

/** The comma/sentence-delimited clause containing `index`. */
function clauseAround(text: string, index: number): string {
  const before = text.slice(0, index).search(/[,.;،؛\n][^,.;،؛\n]*$/);
  const start = before === -1 ? 0 : before + 1;
  const after = text.slice(index).search(/[,.;،؛\n]/);
  return text.slice(start, after === -1 ? text.length : index + after);
}

/**
 * Read requirements out of one tenant message. Only fields the message
 * actually states are set; everything else stays null so `mergeRequirements`
 * keeps what an earlier turn said.
 */
export function parseRequirements(input: string): Requirements {
  const text = toLatinDigits(input).trim();
  const r: Requirements = { ...EMPTY_REQUIREMENTS };

  const monthly = MONTH_RE.test(text);
  const nightly = NIGHT_RE.test(text);
  const nights = nightsOf(text);
  if (monthly && !nightly) r.stay = "long";
  else if (nightly || nights) r.stay = "short";
  r.nights = nights;

  r.bedrooms = bedroomsOf(text);
  if (/unfurnished|not furnished|غير مفروش|بدون عفش|bidafite ibikoresho|nta bikoresho/i.test(text)) r.furnished = false;
  else if (/furnished|مفروش|مفروشة|ifite ibikoresho|ibikoresho/i.test(text)) r.furnished = true;

  r.district = districtOf(text);

  const guests = text.match(/(\d+)\s*(?:guests?|people|persons|adults|أشخاص|اشخاص|ضيوف|abantu)/i);
  if (guests) r.guests = Number(guests[1]);

  // Money: a figure next to an upfront word is the upfront budget; the
  // largest remaining figure is the rent ceiling.
  const mentions = moneyMentions(text);
  const upfront = mentions.find((m) => UPFRONT_RE.test(clauseAround(text, m.index)));
  if (upfront) r.maxUpfront = upfront.value;
  const rent = mentions.filter((m) => m !== upfront).sort((a, b) => b.value - a.value)[0];
  if (rent) {
    r.maxPrice = rent.value;
    r.pricePeriod = monthly ? "month" : nightly ? "night" : null;
  }
  if (r.stay && !r.pricePeriod && r.maxPrice) r.pricePeriod = r.stay === "long" ? "month" : "night";
  if (!r.stay && r.pricePeriod) r.stay = r.pricePeriod === "month" ? "long" : "short";

  return r;
}

/** Later turns override earlier ones field by field; null never erases. */
export function mergeRequirements(base: Requirements, next: Partial<Requirements>): Requirements {
  const out: Requirements = { ...base };
  for (const key of Object.keys(EMPTY_REQUIREMENTS) as (keyof Requirements)[]) {
    const v = next[key];
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  // A price ceiling without its period inherits the stay's.
  if (out.maxPrice && !out.pricePeriod && out.stay) out.pricePeriod = out.stay === "long" ? "month" : "night";
  if (!out.stay && out.pricePeriod) out.stay = out.pricePeriod === "month" ? "long" : "short";
  return out;
}

/**
 * The first hard field still missing. Kigali rents run ~150k–1.5M RWF a month
 * and Airbnb nights ~15k–150k, so without the stay type the budget is
 * unreadable, and without a budget the ranking is noise.
 */
export function missingHardField(r: Requirements): HardField | null {
  if (!r.stay) return "stay";
  if (!r.maxPrice) return "maxPrice";
  return null;
}

/** Validate untrusted JSON (an LLM answer, a stored task) into Requirements. */
export function coerceRequirements(value: unknown): Partial<Requirements> {
  if (!value || typeof value !== "object") return {};
  const out: Partial<Requirements> = {};
  const shape = RequirementsSchema.shape;
  for (const key of Object.keys(shape) as (keyof Requirements)[]) {
    const parsed = shape[key].safeParse((value as Record<string, unknown>)[key]);
    if (parsed.success && parsed.data !== null) (out as Record<string, unknown>)[key] = parsed.data;
  }
  return out;
}
