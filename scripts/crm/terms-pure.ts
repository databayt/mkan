/**
 * The renting terms an ad states in its own words — deposit, commission, visit
 * fee, water, electricity, furnishing — read by rules, not a model. Pure.
 *
 * Two jobs: a backstop under the TikTok / Facebook / web reader (a caption that
 * says "nta komisiyo" is a fact even when the model missed it), and the
 * backfill of leads read before tiktok-v4 asked for terms at all
 * (scripts/crm/backfill-terms.ts). It never guesses: a term the text does not
 * state stays null, and the /find card then says "typical".
 *
 * English, Kinyarwanda and French, in the shapes Kigali brokers write them:
 * "2 months deposit", "ingwate y'amezi 2", "caution 1 mois", "commission 25%",
 * "no commission", "visit fee 10k", "frais de visite 5000", "water included",
 * "amazi arimo", "cash power".
 */
import { toAsciiDigits } from './home-intake-pure';

export type Utility = 'INCLUDED' | 'SEPARATE';

export interface AdTerms {
  /** Months of rent held as deposit; 0 = "no deposit". */
  depositMonths: number | null;
  /** `none`: the ad says no commission. `pct` is a percent of the first rent (25 = 25%). */
  commission: { pct: number | null; none: boolean } | null;
  /** RWF to visit the home; 0 = "free visit". */
  viewingFee: number | null;
  water: Utility | null;
  electricity: Utility | null;
  furnished: boolean | null;
}

export const NO_TERMS: AdTerms = { depositMonths: null, commission: null, viewingFee: null, water: null, electricity: null, furnished: null };

/** Lower case, no accents, ASCII digits, one space — so "Électricité" reads as "electricite". */
const fold = (s: string) =>
  toAsciiDigits(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .replace(/[ \t]+/g, ' ');

/** Number words brokers write instead of digits (en / rw / fr). */
const WORDS: Record<string, number> = {
  half: 0.5, 'a half': 0.5, '1/2': 0.5, one: 1, a: 1, two: 2, three: 3, four: 4, six: 6,
  rimwe: 1, abiri: 2, atatu: 3, ane: 4, atandatu: 6,
  un: 1, deux: 2, trois: 3, quatre: 4,
};
const NUM = String.raw`(\d+(?:[.,]\d+)?|1\/2|a half|half|one|two|three|four|six|rimwe|abiri|atatu|ane|atandatu|un|deux|trois|quatre|a)`;
const num = (s: string): number | null => {
  const w = WORDS[s.trim()];
  if (w != null) return w;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/** "10k" → 10000, "1.5m" → 1500000, "10,000" → 10000. */
function amount(digits: string, unit?: string): number | null {
  const clean = digits.replace(/[\s,](?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  if (unit === 'k') return Math.round(n * 1_000);
  if (unit === 'm') return Math.round(n * 1_000_000);
  return n;
}

// ── deposit ──────────────────────────────────────────────────────────────────
const DEPOSIT = String.raw`(?:security deposit|deposit|caution|guarantee|garantie|depot de garantie|ingwate)`;
const MONTHS = String.raw`(?:months?|mois|amezi|ukwezi)`;
const DEPOSIT_MONTHS: RegExp[] = [
  // "2 months deposit", "two months of rent as deposit", "1 mois de caution"
  new RegExp(String.raw`\b${NUM}\s*-?\s*${MONTHS}\s*(?:of\s*rent\s*)?(?:as\s*|de\s*|y'\s*|ya\s*)?${DEPOSIT}`),
  // "deposit: 2 months", "caution de 1 mois", "deposit of one month"
  new RegExp(String.raw`${DEPOSIT}\s*(?:is|of|:|=|-|de|ni)?\s*(?:is\s*)?${NUM}\s*${MONTHS}\b`),
  // "ingwate y'amezi 2", "ingwate ni amezi abiri"
  new RegExp(String.raw`ingwate\s*(?:y'|ya|ni|:)?\s*(?:amezi|ukwezi)\s*${NUM}`),
];
const NO_DEPOSIT = /\b(?:no|without|zero) (?:security )?deposit\b|nta ngwate|sans caution|pas de caution/;
const DEPOSIT_AMOUNT = new RegExp(String.raw`${DEPOSIT}\s*(?:is|of|:|=|-|ni)?\s*(?:rwf|frw)?\s*(\d+(?:[.,]\d+)?)\s*(k|m)?\b`);

function depositMonths(t: string, priceRwf: number | null): number | null {
  if (NO_DEPOSIT.test(t)) return 0;
  for (const re of DEPOSIT_MONTHS) {
    const m = re.exec(t);
    const n = m ? num(m[1]!) : null;
    if (n != null && n > 0 && n <= 12) return n;
  }
  // "deposit 300k" on a 300k home is one month; only with a price to divide by.
  const a = DEPOSIT_AMOUNT.exec(t);
  const rwf = a ? amount(a[1]!, a[2]) : null;
  if (rwf && rwf >= 10_000 && priceRwf && priceRwf > 0) {
    const months = Math.round((rwf / priceRwf) * 2) / 2;
    if (months >= 0.5 && months <= 6) return months;
  }
  return null;
}

// ── commission ───────────────────────────────────────────────────────────────
const COMMISSION = String.raw`(?:commission|komisiyo(?:ni)?|frais d'agence|agency fees?|broker(?:age)? fees?)`;
const NO_COMMISSION = new RegExp(
  [
    String.raw`\b(?:no|without|zero|free of|0%?)\s*${COMMISSION}`,
    String.raw`${COMMISSION}\s*(?:is\s*)?(?:free|none|0\s*%?)\b`,
    String.raw`\bnta\s*(?:komisiyo|commission)`,
    String.raw`\b(?:sans|pas de)\s*(?:commission|frais d'agence)`,
    String.raw`\bdirect(?:ly)?\s*(?:from|with|to)\s*(?:the\s*)?(?:owner|landlord|proprietaire)`,
    String.raw`\bowner\s*direct\b`,
    String.raw`\bnyir(?:'|i)?\s*inzu\s*ubwe`,
  ].join('|'),
);
const COMMISSION_PCT: RegExp[] = [
  new RegExp(String.raw`${COMMISSION}\s*(?:is|of|:|=|-|ni|de)?\s*(\d{1,3}(?:[.,]\d+)?)\s*%`),
  new RegExp(String.raw`(\d{1,3}(?:[.,]\d+)?)\s*%\s*(?:of\s*)?(?:the\s*)?(?:first\s*(?:month|rent)\s*)?(?:as\s*)?${COMMISSION}`),
];
const COMMISSION_MONTHS: RegExp[] = [
  new RegExp(String.raw`${COMMISSION}\s*(?:is|of|:|=|-|ni|de)?\s*${NUM}\s*${MONTHS}\b`),
  new RegExp(String.raw`\b${NUM}\s*${MONTHS}\s*(?:of\s*rent\s*)?(?:as\s*)?${COMMISSION}`),
];

function commission(t: string): AdTerms['commission'] {
  if (NO_COMMISSION.test(t)) return { pct: null, none: true };
  for (const re of COMMISSION_PCT) {
    const n = Number((re.exec(t)?.[1] ?? '').replace(',', '.'));
    if (n > 0 && n <= 100) return { pct: n, none: false };
  }
  for (const re of COMMISSION_MONTHS) {
    const m = re.exec(t);
    const n = m ? num(m[1]!) : null;
    if (n != null && n > 0 && n <= 2) return { pct: Math.round(n * 100), none: false };
  }
  // "450k + commission": there is one, of an unstated size.
  if (new RegExp(COMMISSION).test(t)) return { pct: null, none: false };
  return null;
}

// ── visit fee ────────────────────────────────────────────────────────────────
const VISIT = String.raw`(?:frais de visite|visiting|viewing|visite|visit|gusura|kureba(?: inzu)?)`;
const FREE_VISIT = new RegExp(String.raw`\bfree\s*(?:visit|viewing)|${VISIT}\s*(?:fee\s*)?(?:is\s*)?(?:free|gratuite?|ni ubuntu)\b|\bno\s*(?:visit(?:ing)?|viewing)\s*fees?`);
const FEE_AMOUNT = String.raw`(\d{1,3}(?:[,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k)?`;
const VISIT_FEE: RegExp[] = [
  // "visit fee 10k", "visiting fee: 10,000 rwf", "frais de visite 5000", "gusura ni 5000"
  new RegExp(String.raw`${VISIT}\s*(?:fees?|charges?|cost|price)?\s*(?:is|of|:|=|-|ni|de)?\s*(?:rwf|frw)?\s*${FEE_AMOUNT}\b`),
  // "10k visit fee", "5000 frw for the visit", "5000 yo gusura"
  new RegExp(String.raw`${FEE_AMOUNT}\s*(?:rwf|frw)?\s*(?:(?:for\s*(?:the\s*)?|yo\s*)${VISIT}|${VISIT}\s*(?:fees?|charges?))`),
];

function viewingFee(t: string): number | null {
  if (FREE_VISIT.test(t)) return 0;
  for (const re of VISIT_FEE) {
    const m = re.exec(t);
    const n = m ? amount(m[1]!, m[2]) : null;
    // A phone number after "visit" is not a fee; neither is "visit 2".
    if (n != null && n >= 1_000 && n <= 50_000) return n;
  }
  return null;
}

// ── water and electricity ────────────────────────────────────────────────────
const INCLUDED = String.raw`(?:included|inclusive|inclus(?:e|es)?|compris(?:e|es)?|birimo|arimo|urimo|yishyuwe|paid by (?:the )?(?:owner|landlord))`;
// "separate entrance" is a feature, not a bill.
const SEPARATE = String.raw`(?:not included|excluded|not inclusive|separate(?:ly)?\b(?!\s*(?:entrance|kitchen|rooms?|bathrooms?|toilets?|house|units?|gate|compound))|extra|non compris(?:e|es)?|non inclus(?:e|es)?|ntibirimo|ntarimo|nturimo|(?:paid|pay) by (?:the )?tenant|on (?:the )?tenant|tenant pays)`;
// "not included" must be tried before "included": the earliest match wins, and it starts first.
const STATE = new RegExp(String.raw`\b(?:${SEPARATE}|${INCLUDED})`);
const OTHER = String.raw`(?:(?:water|eau|amazi|electricity|electricite|umuriro|power)\s*(?:and|&|,|na|et|n')\s*)?`;
const BEFORE_INCLUDED = new RegExp(String.raw`(?:including|incl\.?|inclusive(?: of)?\s*\(?|with|free|avec)\s*(?:the\s*)?${OTHER}$`);
const BEFORE_SEPARATE = new RegExp(String.raw`(?:plus|\+|excluding|exclusive(?: of)?\s*\(?|without|except|apart from|but not|sans|hors|sauf)\s*(?:the\s*)?${OTHER}$`);
const STOP = /[.;!\n|]/;

/**
 * What the text says about one utility: for each mention, a cue right before
 * it ("excluding water") or the nearest "included" / "separate" after it in
 * the same clause. An ad that says both (an inclusive and an exclusive price)
 * states neither.
 */
function utility(t: string, word: RegExp): Utility | null {
  const said = new Set<Utility>();
  for (const m of t.matchAll(word)) {
    const at = m.index ?? 0;
    const before = t.slice(Math.max(0, at - 32), at);
    if (BEFORE_SEPARATE.test(before)) {
      said.add('SEPARATE');
      continue;
    }
    if (BEFORE_INCLUDED.test(before)) {
      said.add('INCLUDED');
      continue;
    }
    let after = t.slice(at + m[0].length, at + m[0].length + 48);
    const stop = after.search(STOP);
    if (stop >= 0) after = after.slice(0, stop);
    const s = STATE.exec(after);
    if (s) said.add(new RegExp(`^${SEPARATE}`).test(s[0]) ? 'SEPARATE' : 'INCLUDED');
  }
  return said.size === 1 ? [...said][0]! : null;
}

// "water tank included" and "hot water" are features, not the bill.
const WATER = /\b(?:water|eau|amazi)\b(?!\s*(?:tank|heater|reservoir|pump|meter|compteur))/g;
const ELECTRICITY = /\b(?:electricity|electric bills?|electricite|courant|umuriro|power)\b(?!\s*(?:backup|generator))/g;
// "water bills included" is about water only.
const BILLS = /(?<!(?:water|electricity|electric|power|eau|amazi)\s)\b(?:bills|utilities|charges)\b/g;
const OWN_METER = /\bcash ?power\b|\bprepaid (?:meter|electricity)\b|\bown (?:electricity )?meter\b|\bcompteur (?:electrique|prepaye)\b/;
const OWN_WATER_METER = /\bown water meter\b|\bwater meter\b|\bcompteur d'eau\b|\bkonteri y'amazi\b/;
const ALL_INCLUSIVE = /\ball[- ]inclusive\b|\beverything included\b|\btout compris\b/;

// ── furnishing ───────────────────────────────────────────────────────────────
const UNFURNISHED = /\bun-?furnished\b|\bnot furnished\b|\bwithout furniture\b|\bno furniture\b|\bnon[- ]?meublee?s?\b|\bnta bikoresho\b|\bidafite ibikoresho\b/;
// Tested after the unfurnished phrases are blanked out, so "unfurnished" never counts twice.
const FURNISHED = /\b(?:fully |semi[- ]?)?furnished\b|\bmeublee?s?\b|\bifite ibikoresho\b|\birimo ibikoresho\b/;

function furnished(t: string): boolean | null {
  // "furnished or unfurnished" states neither.
  const no = UNFURNISHED.test(t);
  const yes = FURNISHED.test(t.replace(new RegExp(UNFURNISHED.source, 'g'), ' '));
  if (no && yes) return null;
  return no ? false : yes ? true : null;
}

/** Every term the text states. `priceRwf` lets "deposit 300k" become months. */
export function termsFromText(text: string | null | undefined, opts: { priceRwf?: number | null } = {}): AdTerms {
  if (!text?.trim()) return { ...NO_TERMS };
  const t = fold(text);
  const bills = ALL_INCLUSIVE.test(t) ? 'INCLUDED' : utility(t, BILLS);
  return {
    depositMonths: depositMonths(t, opts.priceRwf ?? null),
    commission: commission(t),
    viewingFee: viewingFee(t),
    water: utility(t, WATER) ?? bills ?? (OWN_WATER_METER.test(t) ? 'SEPARATE' : null),
    electricity: utility(t, ELECTRICITY) ?? bills ?? (OWN_METER.test(t) ? 'SEPARATE' : null),
    furnished: furnished(t),
  };
}

/** The first statement wins: a reader's answer over the rules', the rules' over nothing. */
export function mergeTerms(first: Partial<AdTerms> | null | undefined, then: AdTerms): AdTerms {
  return {
    depositMonths: first?.depositMonths ?? then.depositMonths,
    commission: first?.commission ?? then.commission,
    viewingFee: first?.viewingFee ?? then.viewingFee,
    water: first?.water ?? then.water,
    electricity: first?.electricity ?? then.electricity,
    furnished: first?.furnished ?? then.furnished,
  };
}

/** Does the ad state any money or utility term (furnishing aside)? */
export const statesTerms = (t: Partial<AdTerms>): boolean =>
  t.depositMonths != null || t.commission != null || t.viewingFee != null || t.water != null || t.electricity != null;
