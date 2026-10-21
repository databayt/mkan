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
import { AREA_KEYS, NEIGHBOURHOODS } from "./areas";
import { CLEARABLE, DISTRICT_CODES, MUST_HAVES, roundPrice, type ClearableField, type MustHave } from "./fields";

export { CLEARABLE, DISTRICT_CODES, MUST_HAVES, roundPrice, type ClearableField, type MustHave };

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
  /** Minimum bathrooms. */
  bathrooms: z.number().int().min(1).max(10).nullable(),
  /** "Self compound": a standalone house with its own gate — villa, townhouse or cottage. */
  compound: z.boolean().nullable(),
  /** A neighbourhood from `areas.ts` (Kimihurura, Kiyovu, …). */
  neighbourhood: z.string().max(40).nullable(),
  /** Near the city centre, the business district or a university. */
  area: z.enum(AREA_KEYS).nullable(),
  /** Room for a family: 3+ bedrooms unless a count was given; houses rank higher. */
  family: z.boolean().nullable(),
  /** Cheapest first, instead of closest to the budget. */
  cheap: z.boolean().nullable(),
  /**
   * A place the tenant wants to live near ("Kigali Heights", "the airport"),
   * with the pin homes are ranked by distance to: a LANDMARKS pin in areas.ts,
   * or the centre of the neighbourhood the reader says the place is in.
   */
  near: z
    .object({ name: z.string().min(2).max(60), lat: z.number().min(-2.2).max(-1.7), lng: z.number().min(29.8).max(30.4) })
    .nullable(),
  /** Things the home must have (parking, pets, a water tank…). */
  mustHaves: z.array(z.enum(MUST_HAVES)).max(8).nullable(),
  /** Move-in date, YYYY-MM-DD. */
  moveIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  /** Lease length in months. */
  months: z.number().int().min(1).max(60).nullable(),
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
  bathrooms: null,
  compound: null,
  neighbourhood: null,
  area: null,
  family: null,
  cheap: null,
  near: null,
  mustHaves: null,
  moveIn: null,
  months: null,
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

function bathroomsOf(text: string): number | null {
  const m =
    text.match(/(\d+)\s*-?\s*(?:bath(?:room)?s?|ba\b|toilets?|حمام|حمامات|ubwiherero|ubwogero)/i) ??
    text.match(/(?:ubwiherero|ubwogero)\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

const COMPOUND_RE = /self[- ]?compound|own compound|standalone|stand[- ]alone|detached|whole house|full house|villa|كمباوند|مستقل|فيلا|inzu yigenga|ifite igipangu/i;
const AREA_RE: Record<(typeof AREA_KEYS)[number], RegExp> = {
  center: /city cent(?:er|re)|town cent(?:er|re)|downtown|\bcbd\b|\bin town\b|وسط المدينة|وسط البلد|mu mujyi rwagati/i,
  business: /business|\bkcc\b|convention cent|kigali heights|منطقة الأعمال|المكاتب|ubucuruzi|ibiro/i,
  university: /universit|campus|college|student|جامعة|الجامعة|طلاب|طالب|kaminuza|abanyeshuri/i,
};
const FAMILY_RE = /family|kids|children|عائلة|أسرة|اسرة|أطفال|اطفال|umuryango|abana/i;
const CHEAP_RE = /cheap|cheapest|affordable|low[- ]?cost|budget[- ]friendly|رخيص|ارخص|أرخص|بسعر مناسب|ihendutse|bihendutse/i;

function neighbourhoodOf(text: string): string | null {
  const s = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hit = NEIGHBOURHOODS.find((n) => n.name !== "Kicukiro" && new RegExp(`(^|[^a-z])${n.name.toLowerCase()}([^a-z]|$)`).test(s));
  return hit?.name ?? null;
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
  r.neighbourhood = neighbourhoodOf(text);
  r.bathrooms = bathroomsOf(text);
  if (COMPOUND_RE.test(text)) r.compound = true;
  for (const key of AREA_KEYS) if (AREA_RE[key].test(text)) r.area = key;
  if (FAMILY_RE.test(text)) r.family = true;
  if (CHEAP_RE.test(text)) r.cheap = true;

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
 * The one field the agent must ask for before searching: nights and months are
 * different markets (Airbnb ~15k–150k a night, brokers ~150k–1.5M a month), so
 * without the stay type nothing can be priced. The budget is not blocking — the
 * agent shows the best homes first and offers a budget as a refinement.
 */
export function missingHardField(r: Requirements): HardField | null {
  return r.stay ? null : "stay";
}

/** Below this a bare figure is a nightly price, at or above it a monthly rent. */
const NIGHTLY_MAX = 100_000;
const MONTHLY_MIN = 200_000;

/**
 * Settle the stay type from what the tenant already said, so they are not asked
 * a question their message answers: a figure of 450k is a month's rent, 40k is
 * a night; guests or a night count mean a short stay; an unfurnished home, a
 * self compound or a family home is a long-term rental.
 */
export function inferStay(r: Requirements): Requirements {
  if (r.stay) return r;
  let stay: Requirements["stay"] = null;
  if (r.nights || r.guests) stay = "short";
  else if (r.maxPrice && r.maxPrice <= NIGHTLY_MAX) stay = "short";
  else if (r.maxPrice && r.maxPrice >= MONTHLY_MIN) stay = "long";
  else if (r.furnished === false || r.compound || r.family || r.maxUpfront || r.months) stay = "long";
  if (!stay) return r;
  return { ...r, stay, pricePeriod: r.maxPrice ? r.pricePeriod ?? (stay === "long" ? "month" : "night") : r.pricePeriod };
}

const ANY_PLACE_RE = /anywhere|any (?:area|place|district|neighbou?rhood|zone|location)|all (?:of )?kigali|whole (?:of )?kigali|أي مكان|اي مكان|أي منطقة|اي منطقة|كل كيغالي|ahantu hose|aho ari ho hose/i;
const ANY_BUDGET_RE = /any (?:budget|price)|no (?:budget|price limit|limit)|price doesn'?t matter|أي سعر|اي سعر|بدون ميزانية|igiciro icyo ari cyo cyose/i;
const ANY_FURNISH_RE = /furnished or (?:not|un)|(?:any|either) furnish|مفروش أو غير|مفروشة أو غير/i;
const CHEAPER_RE = /cheaper|less expensive|lower (?:price|budget)|أرخص|ارخص|أقل سعر|ihendutse kurushaho/i;
const BIGGER_RE = /bigger|larger|more (?:space|room|bedrooms?)|أكبر|اكبر|nini kurushaho/i;

/**
 * Follow-ups that move an existing search instead of stating a field:
 * "cheaper" lowers the ceiling by a fifth, "bigger" adds a bedroom, "anywhere"
 * or "any budget" empty those fields. Read against the current requirements.
 */
export function parseAdjustments(input: string, current: Requirements): { set: Partial<Requirements>; clear: ClearableField[] } {
  const text = toLatinDigits(input);
  const set: Partial<Requirements> = {};
  const clear: ClearableField[] = [];
  if (ANY_PLACE_RE.test(text)) clear.push("district", "neighbourhood", "area");
  if (ANY_BUDGET_RE.test(text)) clear.push("maxPrice", "pricePeriod", "cheap");
  if (ANY_FURNISH_RE.test(text)) clear.push("furnished");
  if (CHEAPER_RE.test(text)) {
    if (current.maxPrice) set.maxPrice = roundPrice(current.maxPrice * 0.8, current.pricePeriod);
    set.cheap = true;
  }
  if (BIGGER_RE.test(text)) set.bedrooms = Math.min(10, (current.bedrooms ?? 1) + 1);
  return { set, clear };
}

export function clearFields(r: Requirements, keys: readonly string[]): Requirements {
  const out = { ...r };
  for (const k of keys) if ((CLEARABLE as readonly string[]).includes(k)) (out as Record<string, unknown>)[k] = null;
  return out;
}

/**
 * Keep one turn's requirements consistent with themselves after a merge:
 * a neighbourhood and a district that disagree keep whichever the tenant said
 * last; switching nights ↔ months drops a budget priced in the other period.
 */
export function reconcile(prev: Requirements, next: Requirements, stated: Partial<Requirements>): Requirements {
  const out = { ...next };
  const hood = NEIGHBOURHOODS.find((n) => n.name === out.neighbourhood);
  if (hood && out.district && hood.district !== out.district) {
    if (stated.district && !stated.neighbourhood) out.neighbourhood = null;
    else out.district = hood.district as Requirements["district"];
  }
  if (prev.stay && out.stay && prev.stay !== out.stay) {
    if (stated.maxPrice == null) {
      out.maxPrice = null;
      out.pricePeriod = null;
    } else out.pricePeriod = out.stay === "long" ? "month" : "night";
    if (out.stay === "long") out.nights = null;
  }
  return out;
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
