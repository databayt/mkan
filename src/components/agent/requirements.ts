/**
 * What the tenant asked for — the one structure every agent step reads.
 *
 * Two readers fill it: `parseRequirements` (deterministic, en/ar/rw/fr/sw, always
 * runs) and the Groq reader in `llm.ts` (fills what the regexes cannot, when the
 * free tier answers). Numbers come from the deterministic reader whenever it
 * found one — a 20B model misreads "400k" more often than a regex does.
 */
import { z } from "zod";
import { districtForPlace, DISTRICTS } from "@/lib/geo/rwanda-places";
import { KIGALI_ZONE_BY_SLUG } from "@/lib/geo/kigali-zones";
import { AREA_KEYS, landmarkIn, nearestSchool, NEIGHBOURHOODS } from "./areas";
import {
  CLARIFY_FIELDS,
  CLEARABLE,
  DISTRICT_CODES,
  HOME_TYPES,
  MUST_HAVES,
  PURPOSES,
  roundPrice,
  type ClarifyField,
  type ClearableField,
  type HomeType,
  type MustHave,
  type Purpose,
} from "./fields";

export { CLEARABLE, DISTRICT_CODES, HOME_TYPES, MUST_HAVES, PURPOSES, roundPrice, type ClearableField, type HomeType, type MustHave, type Purpose };

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
  /**
   * apartment · house (a "self compound": its own gate — villa, townhouse,
   * cottage) · room (often "self-contained") · studio (bedrooms 0). Stored
   * searches from before carry `compound: true`; `coerceRequirements` reads it as house.
   */
  homeType: z.enum(HOME_TYPES).nullable(),
  /** A neighbourhood from `areas.ts` (Kimihurura, Kiyovu, …). */
  neighbourhood: z.string().max(40).nullable(),
  /** Near the city centre, the business district or a university. */
  area: z.enum(AREA_KEYS).nullable(),
  /**
   * Why they move: family (2+ bedrooms unless a count was given, houses rank
   * higher), study (near a campus, rooms welcome, cheaper first), business
   * (near the business district or the centre). Old `family: true` reads as family.
   */
  purpose: z.enum(PURPOSES).nullable(),
  /** Water in the rent (the ad says so), not a bill on top. */
  waterIncluded: z.boolean().nullable(),
  /** No broker commission: an owner's home, or an ad that says none. */
  noCommission: z.boolean().nullable(),
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
  homeType: null,
  neighbourhood: null,
  area: null,
  purpose: null,
  waterIncluded: null,
  noCommission: null,
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

const MONTH_RE = /(month|monthly|\/mo\b|per mo\b|\blease\b|long[- ]?term|year|شهر|شهري|سنة|سنوي|kwezi|umwaka|\bmois\b|mensuel|ann[ée]e|\bun an\b|long terme|mwezi|mwaka)/i;
const NIGHT_RE = /(night|nightly|per night|weekend|short[- ]?stay|holiday|vacation|إقامة قصيرة|iminsi mike|ليلة|ليال|ليالي|ijoro|amajoro|\bnuits?\b|par nuit|week-end|vacances|court s[ée]jour|usiku|likizo)/i;
const UPFRONT_RE = /(upfront|up front|move[- ]in|in hand|cash|savings|مقدم|مقدما|كاش|mbere)/i;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  "واحد": 1, "واحدة": 1, "اثنين": 2, "اثنتين": 2, "ثلاث": 3, "ثلاثة": 3, "أربع": 4, "اربع": 4, "خمس": 5,
  rimwe: 1, kimwe: 1, bibiri: 2, bitatu: 3, bine: 4, bitanu: 5,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  moja: 1, kimoja: 1, "تلاتة": 3, "تلات": 3, mbili: 2, viwili: 2, tatu: 3, vitatu: 3, nne: 4, vinne: 4, tano: 5, vitano: 5,
};

/** "400k" / "400,000" / "400 000" / "1.2m" → numbers ≥ 1,000, with their offset. */
function moneyMentions(text: string): { value: number; index: number; raw: string }[] {
  const out: { value: number; index: number; raw: string }[] = [];
  const re = /(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?)\s*(k(?![a-z])|m(?![a-z])|million|millions|milioni|miliyoni|thousand|mille|elfu|ألف|الف|مليون|ibihumbi)?/gi;
  // Kinyarwanda and Swahili put the unit first: "ibihumbi 300", "elfu 300", "milioni 1.2".
  const before = /\b(ibihumbi|elfu|milioni|miliyoni)\s+(\d+(?:[.,]\d+)?)/gi;
  for (const m of text.matchAll(before)) {
    const base = Number((m[2] ?? "").replace(",", "."));
    const value = base * (/^mil/i.test(m[1] ?? "") ? 1_000_000 : 1_000);
    if (Number.isFinite(value) && value >= 1_000) out.push({ value, index: m.index ?? 0, raw: m[0] });
  }
  for (const m of text.matchAll(re)) {
    const base = Number((m[1] ?? "").replace(/[,\s]/g, ""));
    if (!Number.isFinite(base)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    const mult =
      unit === "k" || unit === "thousand" || unit === "mille" || unit === "elfu" || unit === "ألف" || unit === "الف" || unit === "ibihumbi"
        ? 1_000
        : unit === "m" || unit === "million" || unit === "millions" || unit === "milioni" || unit === "miliyoni" || unit === "مليون"
          ? 1_000_000
          : 1;
    const value = base * mult;
    // The figure of a unit-first mention ("ibihumbi 300") is already counted.
    if (value >= 1_000 && (unit || (value <= 50_000_000 && !(value >= 1_900 && value <= 2_100))) && !out.some((o) => (m.index ?? 0) > o.index && (m.index ?? 0) < o.index + o.raw.length))
      out.push({ value, index: m.index ?? 0, raw: m[0] });
  }
  return out;
}

function bedroomsOf(text: string): number | null {
  if (/\bstudio\b|ستوديو|استوديو/i.test(text)) return 0;
  if (/غرفتين|غرفتان/.test(text)) return 2;
  // French counts rooms, not bedrooms: a "3 pièces" (F3) is a living room + 2 bedrooms.
  const pieces = text.match(/(\d+|un|une|deux|trois|quatre|cinq)\s*pi[eè]ces?\b/i) ?? text.match(/\bF([1-6])\b/);
  if (pieces) {
    const n = /^\d+$/.test(pieces[1] ?? "") ? Number(pieces[1]) : WORD_NUMBERS[(pieces[1] ?? "").toLowerCase()];
    if (n) return Math.max(0, n - 1);
  }
  const digit =
    text.match(/(\d+)\s*-?\s*(?:bed(?:room)?s?|br\b|bhk|chambres?)/i) ??
    text.match(/(?:vyumba|chumba)\s*(?:vya kulala)?\s*(\d+)/i) ??
    text.match(/(\d+)\s*(?:غرف|غرفة|غرفه)/) ??
    text.match(/(?:ibyumba|icyumba)\s*(?:by'?|bya|bibiri)?\s*(\d+)/i) ??
    text.match(/(?:غرف|غرفة)\s*(?:عدد)?\s*(\d+)/);
  if (digit) return Number(digit[1]);
  const word =
    text.match(/\b(one|two|three|four|five)\s*-?\s*bed(?:room)?s?/i) ??
    text.match(/(?:ibyumba|icyumba)\s+(kimwe|bibiri|bitatu|bine|bitanu)/i) ??
    text.match(/\b(une|un|deux|trois|quatre|cinq)\s+chambres?\b/i) ??
    text.match(/(?:vyumba|chumba)\s+(?:vya kulala\s+|cha kulala\s+)?(kimoja|moja|viwili|mbili|vitatu|tatu|vinne|nne|vitano|tano)\b/i) ??
    text.match(/(واحدة|ثلاث|ثلاثة|تلاتة|تلات|أربع|اربع|خمس)\s*غرف/);
  return word ? WORD_NUMBERS[(word[1] ?? "").toLowerCase()] ?? null : null;
}

function nightsOf(text: string): number | null {
  const m =
    text.match(/(\d+)\s*(?:nights?|days?|nuits?|jours?|ليال|ليالي|ليلة|أيام|ايام|يوم|iminsi|amajoro)/i) ??
    text.match(/(?:usiku|siku|iminsi|amajoro)\s*(\d+)/i);
  if (m) return Number(m[1]);
  if (/\b(a|one|1)\s*week\b|\bune semaine\b|wiki moja|أسبوع|اسبوع|icyumweru/i.test(text)) return 7;
  if (/\bweekend\b|نهاية الأسبوع|wikendi/i.test(text)) return 2;
  return null;
}

function bathroomsOf(text: string): number | null {
  const m =
    text.match(/(\d+)\s*-?\s*(?:bath(?:room)?s?|ba\b|toilets?|حمام|حمامات|ubwiherero|ubwogero)/i) ??
    text.match(/(?:ubwiherero|ubwogero)\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

const HOUSE_RE = /self[- ]?compound|own compound|own gate|standalone|stand[- ]alone|detached|whole house|full house|villa|maison individuelle|kwa kujitegemea|كمباوند|بيت مستقل|منزل مستقل|فيلا|فله|inzu yigenga|ifite igipangu|mu gipangu|igipangu cyayo/i;
const APARTMENT_RE = /apartments?\b|appartements?\b|apartment|\bflat\b|\bcondo\b|شقة|شقه|شقق|apartema|inzu y'?amagorofa/i;
/** One room to live in — "self-contained", an annex, a single room — not a bedroom count ("2 rooms"). */
const ROOM_RE = /self[- ]?contain(?:ed)?|\bannex\b|\b(?:a|one|single|private) room\b|^\s*room\b|(?<!(?:living|dining|sitting|guest|spare|store|laundry|play|class|show|bed|bath) )\broom (?:near|in|for|at|close|around|by)\b|chambre (?:seule|individuelle|autonome)|studette|غرفة (?:واحدة|مستقلة|منفصلة|قرب|قريبة|جنب|بالقرب)|\bicyumba\b(?!\s*(?:\d|by'?|bya|bibiri|bitatu|bine|bitanu))|chumba (?:kimoja|cha kupanga)/i;
const STUDIO_RE = /\bstudio\b|ستوديو|استوديو/i;
const AREA_RE: Record<(typeof AREA_KEYS)[number], RegExp> = {
  center: /city cent(?:er|re)|town cent(?:er|re)|downtown|\bcbd\b|\bin town\b|وسط المدينة|وسط البلد|mu mujyi rwagati/i,
  business: /business|\bkcc\b|convention cent|kigali heights|منطقة الأعمال|المكاتب|ubucuruzi|ibiro/i,
  university: /universit|campus|college|جامعة|الجامعة|kaminuza|universit[ée]/i,
};
const FAMILY_RE = /family|kids|children|famille|enfants|familia|watoto|عائلة|عائلتي|أسرة|اسرة|أسرتي|أطفال|اطفال|muryango|\babana\b/i;
const STUDY_RE = /\bstud(?:y|ying|ies|ent|ents)\b|for (?:my )?(?:school|studies)|[ée]tudiant|[ée]tudes\b|mwanafunzi|wanafunzi|طالب|طالبة|طلاب|دراسة|للدراسة|الدراسة|umunyeshuri|abanyeshuri|\bkwiga\b/i;
/** Work: "office in Kacyiru", "for work" — not a desk at home ("home office" is the workspace must-have). */
const BUSINESS_RE = /(?<!home )\boffice\b(?! (?:space|room|corner))|\bfor work\b|\bwork(?:ing)? (?:at|in|near|from)\b(?! home)|\bmy (?:job|work)\b|business (?:trip|travel)|\bbureau\b|travail|\bkazini\b|مكتبي|مكتب الشركة|للعمل|عملي|شغلي|الشغل|ku kazi|\bakazi\b|\bibiro\b/i;
const WATER_INCLUDED_RE = /water (?:is |bills? )?(?:included|inclusive|paid|free)|incl(?:\.|uding|udes)? water|with water (?:bills? )?included|free water|eau (?:comprise|incluse)|maji (?:yamejumuishwa|bure)|amazi (?:arimo|yishyuwe|ari mu bukode|ari muri|araboneka mu)|(?:شامل|شاملة|مع) (?:ال)?(?:ماء|مياه|موية)|(?:ال)?(?:ماء|مياه|موية) (?:مشمول|مشمولة|ضمن|مدفوع|مدفوعة|مجان)/i;
const NO_COMMISSION_RE = /no (?:broker(?:'?s)? |agent(?:'?s)? )?(?:commission|fees?)\b|without (?:a )?(?:commission|broker)|commission[- ]free|zero commission|no (?:broker|agent|middle ?man)\b|direct(?:ly)? from (?:the )?owner|owner direct|sans (?:commission|frais d'agence)|pas de commission|nta (?:komisiyo|commission)|nta (?:broker|komisiyoneri)|bila (?:commission|kamisheni|dalali)|بدون (?:عمولة|سمسرة|سمسار|وسيط)|بلا (?:عمولة|سمسرة)|من المالك مباشرة|من المالك/i;
const CHEAP_RE = /cheap|cheapest|affordable|low[- ]?cost|budget[- ]friendly|pas cher|bon march[ée]|abordable|bei nafuu|bei rahisi|رخيص|ارخص|أرخص|بسعر مناسب|ihendutse|bihendutse/i;

/**
 * Must-haves the rules can read (en, fr, rw, ar, a little sw) — on prod the
 * Claude reader is often dark, and Groq does not return them, so these are
 * the only must-haves a Groq or rules turn gets. Furnished is a field of its
 * own, not a must-have. Words are kept specific: "office" alone is a
 * workplace ("near my office"), not a desk at home.
 */
const MUST_HAVE_RE: Record<MustHave, RegExp> = {
  parking: /parking|car ?park|garage|place to park|parikingi|aho guparika|parikinga|maegesho|موقف|مواقف|جراج|كراج/i,
  pets: /\bpets?\b|pet[- ]friendly|\bdogs?\b|\bcats?\b|animaux|\bchiens?\b|\bchats\b|imbwa|injangwe|amatungo|\bmbwa\b|wanyama|حيوان|حيوانات|كلب|قطة|قطط/i,
  wifi: /wi-?fi|internet|fib(?:re|er)|connexion|interineti|murandasi|إنترنت|انترنت|واي ?فاي/i,
  workspace: /\bdesk\b|workspace|work ?space|home office|office (?:space|room|corner)|study room|espace de travail|coin bureau|aho gukorera|ameza y'?akazi|مساحة عمل|ركن عمل|مكتب للعمل|مكتب في البيت/i,
  ac: /\ba\/?c\b|air ?con|air[- ]condition|climatis|\bclim\b|تكييف|مكيف|مكيّف/i,
  security: /security|secure|\bguard|watchman|cctv|camera|gated|gardien|s[ée]curit[ée]|umuzamu|abazamu|umutekano|mlinzi|ulinzi|حراسة|حارس|كاميرات|أمان|آمن/i,
  quiet: /quiet|\bcalm|peaceful|no noise|tranquille|paisible|hatuje urusaku|nta rusaku|ituje|utulivu|kimya|هادئ|هادئة|هادي|هدوء/i,
  transit: /public transport|bus stop|near (?:the )?(?:main )?(?:road|tarmac|bus)|transports? en commun|arr[eê]t de bus|imodoka rusange|usafiri|مواصلات|محطة باص|محطة حافلات/i,
  kitchen: /kitchen|cuisine|igikoni|jikoni|مطبخ/i,
  washer: /washing machine|washer|laundry|machine [àa] laver|lave-linge|buanderie|imashini imesa|غسالة|غسيل/i,
  balcony: /balcon|terrace|terrasse|veranda|balikoni|roshani|بلكونة|بلكون|شرفة|تراس/i,
  garden: /garden|\byard\b|lawn|jardin|ubusitani|bustani|حديقة|جنينة|حوش/i,
  elevator: /elevator|\blift\b|ascenseur|asanseri|lifti|مصعد|اسانسير|أسانسير/i,
  waterTank: /water ?tank|\btank\b|reservoir|r[ée]servoir|citerne|ikigega|tanki ya maji|خزان|تانك/i,
  generator: /generator|back-?up power|power back-?up|groupe [ée]lectrog[eè]ne|\bmoteur\b|moteri|jenereta|inverter|مولد|مولّد/i,
};
/** "no need for parking", "sans parking", "بدون موقف" — the word is not a must-have. */
const NOT_NEEDED_RE = /(?:\bno\b|don'?t need|do not need|don'?t have|do not have|no longer|without|not necessary|\bsans\b|pas besoin|pas de|ntabwo|nta\b|bidakenewe|bila|hakuna|بدون|لا أحتاج|لا احتاج|ما محتاج|مش محتاج|ما داير)(?:(?!\b(?:but|mais|with|avec|lakini|ariko)\b|لكن|مع)[^,.;،؛\n]){0,25}$/i;

function mustHavesOf(text: string): MustHave[] {
  const out: MustHave[] = [];
  for (const key of MUST_HAVES) {
    const m = MUST_HAVE_RE[key].exec(text);
    if (!m) continue;
    if (NOT_NEEDED_RE.test(text.slice(0, m.index))) continue;
    out.push(key);
  }
  return out.slice(0, 8);
}

/** "near", "close to", "hafi", "près de", "karibu", "قرب" — the message asks to live near a place. */
const NEAR_RE = /\bnear\b|nearby|close to|next to|walking distance|\bby the\b|\bwork(?:ing)? (?:at|in)\b|\bhafi\b|iruhande|pr[eè]s d|proche d|[àa] c[oô]t[ée] d|\bkaribu\b|قرب|قريب|جنب|بجانب|بالقرب/i;
const SCHOOL_RE = /\bschools?\b|ishuri|amashuri|[ée]coles?\b|\blyc[ée]es?\b|\bshule\b|مدرس[ةه]|مدارس/i;

/**
 * A place to live near: a named landmark (schools included), or for a bare
 * "near a school" the school pin for the neighbourhood or district the
 * message names. A bare school with no place stays unset — see `nearestSchool`.
 */
function nearOf(text: string, at: { neighbourhood: string | null; district: string | null }): Requirements["near"] {
  if (!NEAR_RE.test(text)) return null;
  const pin = landmarkIn(text) ?? (SCHOOL_RE.test(text) ? nearestSchool(at) : undefined);
  return pin ? { name: pin.name, lat: pin.lat, lng: pin.lng } : null;
}

function neighbourhoodOf(text: string): string | null {
  const s = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hit =
    NEIGHBOURHOODS.find((n) => n.name !== "Kicukiro" && new RegExp(`(^|[^a-z])${n.name.toLowerCase()}([^a-z]|$)`).test(s)) ??
    // Arabic names from the zone tree ("كاتشيرو"); a sector named like its district reads as the district.
    NEIGHBOURHOODS.find((n) => {
      const ar = KIGALI_ZONE_BY_SLUG.get(n.slug)?.nameAr;
      return n.name !== "Kicukiro" && !!ar && ar.length > 2 && !DISTRICTS.some((d) => d.nameAr === ar) && text.includes(ar);
    });
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
  const after = text.slice(index).search(/[,;،؛\n]|\.(?!\d)/); // "1.5M" is one figure, not a sentence end
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
  r.homeType = STUDIO_RE.test(text) ? "studio" : ROOM_RE.test(text) ? "room" : HOUSE_RE.test(text) ? "house" : APARTMENT_RE.test(text) ? "apartment" : null;
  if (r.homeType === "studio") r.bedrooms = 0;
  if (/unfurnished|not furnished|non[- ]meubl[ée]|pas meubl[ée]|bila samani|غير مفروش|بدون عفش|bidafite ibikoresho|nta bikoresho/i.test(text)) r.furnished = false;
  else if (/furnished|meubl[ée]|samani|مفروش|مفروشة|ifite ibikoresho|ibikoresho/i.test(text)) r.furnished = true;

  r.district = districtOf(text);
  r.neighbourhood = neighbourhoodOf(text);
  r.bathrooms = bathroomsOf(text);
  for (const key of AREA_KEYS) if (AREA_RE[key].test(text)) r.area = key;
  r.purpose = FAMILY_RE.test(text) ? "family" : STUDY_RE.test(text) ? "study" : BUSINESS_RE.test(text) ? "business" : null;
  if (WATER_INCLUDED_RE.test(text)) r.waterIncluded = true;
  if (NO_COMMISSION_RE.test(text)) r.noCommission = true;
  if (CHEAP_RE.test(text)) r.cheap = true;
  const mustHaves = mustHavesOf(text);
  if (mustHaves.length) r.mustHaves = mustHaves;
  r.near = nearOf(text, r);

  const guests = text.match(/(\d+)\s*(?:guests?|people|persons|adults|personnes|adultes|watu|أشخاص|اشخاص|ضيوف|abantu)/i) ?? text.match(/(?:watu|abantu)\s+(\d+)/i);
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

/**
 * Later turns override earlier ones field by field; null never erases.
 * Must-haves add up ("with parking", then "and a garden"); dropping them is a
 * clear (`clearFields`), never a merge.
 */
export function mergeRequirements(base: Requirements, next: Partial<Requirements>): Requirements {
  const out: Requirements = { ...base };
  for (const key of Object.keys(EMPTY_REQUIREMENTS) as (keyof Requirements)[]) {
    const v = next[key];
    if (v !== null && v !== undefined) (out as Record<string, unknown>)[key] = v;
  }
  if (base.mustHaves?.length && next.mustHaves?.length) out.mustHaves = [...new Set([...base.mustHaves, ...next.mustHaves])].slice(0, 8);
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

/**
 * What makes a first message a search on its own: a place, a size or a
 * budget. With none of them ("I need a house", "a room please") the message
 * is vague, and the clarify card asks what is missing before searching.
 */
const SPECIFIC_FIELDS: readonly (keyof Requirements)[] = ["district", "neighbourhood", "area", "near", "bedrooms", "maxPrice"];

/**
 * What the clarify card should ask, in CLARIFY_FIELDS order (what changes the
 * results most first) — or null to search now. Only a typed, vague first
 * message with two or more of them missing; otherwise the search runs and a
 * single missing field stays the one question under the cards.
 */
export function clarifyFields(r: Requirements, { first, tapped }: { first: boolean; tapped: boolean }): ClarifyField[] | null {
  if (!first || tapped) return null;
  if (SPECIFIC_FIELDS.some((k) => r[k] != null)) return null;
  const missing = CLARIFY_FIELDS.filter((k) => r[k] == null);
  return missing.length >= 2 ? missing : null;
}

/** Below this a bare figure is a nightly price, at or above it a monthly rent. */
const NIGHTLY_MAX = 100_000;
const MONTHLY_MIN = 200_000;

/**
 * Settle the stay type from what the tenant already said, so they are not asked
 * a question their message answers: a figure of 450k is a month's rent, 40k is
 * a night; guests or a night count mean a short stay; an unfurnished home, a
 * self compound, a room, a family home or broker terms (commission, water in
 * the rent) mean a long-term rental.
 */
export function inferStay(r: Requirements): Requirements {
  if (r.stay) return r;
  let stay: Requirements["stay"] = null;
  if (r.nights || r.guests) stay = "short";
  else if (r.maxPrice && r.maxPrice <= NIGHTLY_MAX) stay = "short";
  else if (r.maxPrice && r.maxPrice >= MONTHLY_MIN) stay = "long";
  else if (
    r.furnished === false ||
    r.homeType === "house" ||
    r.homeType === "room" ||
    r.purpose === "family" ||
    r.purpose === "study" ||
    r.noCommission ||
    r.waterIncluded ||
    r.maxUpfront ||
    r.months
  )
    stay = "long";
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
  if (BIGGER_RE.test(text)) {
    set.bedrooms = Math.min(10, (current.bedrooms ?? 1) + 1);
    // A bigger studio is a one-bedroom.
    if (current.homeType === "studio") clear.push("homeType");
  }
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
  // A studio has no bedroom: the newer of the two wins.
  if (out.homeType === "studio" && out.bedrooms != null && out.bedrooms > 0) {
    if (stated.bedrooms != null && stated.homeType == null) out.homeType = null;
    else out.bedrooms = 0;
  } else if (out.homeType === "studio" && out.bedrooms == null) out.bedrooms = 0;
  return out;
}

/** Validate untrusted JSON (an LLM answer, a stored task) into Requirements. */
export function coerceRequirements(value: unknown): Partial<Requirements> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const out: Partial<Requirements> = {};
  const shape = RequirementsSchema.shape;
  for (const key of Object.keys(shape) as (keyof Requirements)[]) {
    // A model may name one must-have mkan does not know: keep the rest, not nothing.
    const v = key === "mustHaves" && Array.isArray(raw[key]) ? (raw[key] as unknown[]).filter((m) => (MUST_HAVES as readonly unknown[]).includes(m)) : raw[key];
    const parsed = shape[key].safeParse(key === "mustHaves" && Array.isArray(v) && v.length === 0 ? null : v);
    if (parsed.success && parsed.data !== null) (out as Record<string, unknown>)[key] = parsed.data;
  }
  // Searches stored before home types and purposes: `compound` was a house, `family` a family.
  if (raw.compound === true && !out.homeType) out.homeType = "house";
  if (raw.family === true && !out.purpose) out.purpose = "family";
  return out;
}
