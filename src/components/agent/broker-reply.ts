/**
 * What a Kigali broker means in a WhatsApp reply. Brokers answer an ask in
 * free text and photo albums, not through the link: "500k", "Kibagabaga /
 * 2 bedrooms / 2 bathrooms / Price: 300k", "taken", "How much?". Read by
 * rules, pure, so the outbox (scripts/wa/outbox.ts) and the chat importer
 * (scripts/wa/chats.ts) read the same way and the tests pin the shapes.
 */
import { zoneNamed } from "@/lib/geo/kigali-zones";

export interface BrokerReply {
  /** RWF a month; null when the reply names no rent. */
  price: number | null;
  /** USD a month when the rent is quoted in dollars ("$800"). */
  priceUsd: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /** The Kigali place the reply names, as written in the zone tree. */
  place: string | null;
  /** Zone slug of that place. */
  zoneSlug: string | null;
  furnished: boolean | null;
  /** RWF to visit, when stated ("visit fee 5k"). */
  visitFee: number | null;
  /** The home is gone: "taken", "N", "not available", "byaragiye". */
  gone: boolean;
  /** The broker asks before offering: "How much?", "Where", "Features&budget". */
  question: boolean;
  /** "Yes, still available", "Iracyahari" — to "is this home still available?". */
  yes: boolean;
}

/** Rents outside this band are fees, deposits or sale prices, not a month's rent. */
const RENT_MIN = 40_000;
const RENT_MAX = 15_000_000;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .toLowerCase();

/** "300k" → 300000, "1.2m" → 1200000, "400,000" → 400000, "350" (with k implied when < 5000 next to "price") handled by caller. */
function amount(digits: string, unit: string | undefined): number | null {
  const n = Number(digits.replace(/[\s,](?=\d{3}(?!\d))/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const u = (unit ?? "").toLowerCase();
  if (u === "k" || u === "k rwf" || u.startsWith("thousand")) return Math.round(n * 1_000);
  if (u === "m" || u.startsWith("million")) return Math.round(n * 1_000_000);
  return Math.round(n);
}

const MONEY = /(?:(rwf|frw|rf|\$|usd)\s*)?(\d{1,3}(?:[ ,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k\b|m\b|million|thousand|rwf|frw|rf|\$|usd|dollars?)?/gi;
/** Words that make a nearby amount something other than the rent. */
const NOT_RENT = /visit|visiting|moto|fee|commission|komisiyo|deposit|caution|ingwate|transport|sale|sell|kugurisha|plot|land/;
const SALE = /\bfor sale\b|\bsale price\b|kugurisha|\b\d+(?:[.,]\d+)?\s*m(?:illion)?\b(?=[^\n]*\b(?:sale|sell)\b)/;

function money(text: string): { rwf: number[]; usd: number[]; fee: number | null } {
  const rwf: number[] = [];
  const usd: number[] = [];
  let fee: number | null = null;
  for (const m of text.matchAll(MONEY)) {
    const [whole, pre, digits, post] = m;
    if (!digits) continue;
    const at = m.index ?? 0;
    const before = text.slice(Math.max(0, at - 28), at);
    const after = text.slice(at + whole.length, at + whole.length + 12);
    // "2 bedrooms", "3 bathrooms", times and phone numbers are not money.
    if (/^\s*(?:bed|bath|br\b|ba\b|room|toilet|sitting|kitchen|month|mezi|am\b|pm\b|h\b|min|:)/.test(after)) continue;
    if (/\d{7,}/.test(digits.replace(/[ ,]/g, ""))) continue;
    const currency = `${pre ?? ""}${post ?? ""}`.toLowerCase();
    const isUsd = /\$|usd|dollar/.test(currency);
    const unit = post && /^(k|m|million|thousand)/i.test(post) ? post : undefined;
    let value = amount(digits, unit);
    if (value == null) continue;
    // "Price 350" in a rent conversation means 350k.
    if (!unit && !isUsd && value >= 50 && value < 5_000 && /price|rent|last|for\s*$|at\s*$|@\s*$/.test(before)) value *= 1_000;
    if (/visit|visiting|moto/.test(before) || /^\s*(?:as |for )?(?:the )?(?:visit|visiting)/.test(after)) {
      if (!isUsd && value >= 1_000 && value <= 50_000) fee ??= value;
      continue;
    }
    if (NOT_RENT.test(before)) continue;
    if (isUsd) {
      if (value >= 100 && value <= 20_000) usd.push(value);
    } else if (value >= RENT_MIN && value <= RENT_MAX && (unit || currency || value >= 10_000)) {
      rwf.push(value);
    }
  }
  return { rwf, usd, fee };
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, single: 1, q: 1 };
const count = (s: string | undefined) => (s == null ? null : (WORD_NUM[s] ?? (Number.isFinite(Number(s)) ? Number(s) : null)));

const BEDROOMS = /\b(\d|one|two|three|four|five|six)\s*(?:-|\s)?(?:bed(?:room)?s?|br|bdr?m?s?|chambres?)\b|\bibyumba\s*(?:bi)?(\d)/;
const BATHROOMS = /\b(\d|one|two|three|four|q)\s*(?:-|\s)?(?:bath(?:room)?s?|ba\b|douches?)\b/;
const STUDIO = /\bstudio\b/;

const GONE = /^(?:n|no+|nope|taken|gone|rented|sold|not available|no longer available|already (?:taken|rented)|it(?:'?s| is| has been) taken|byaragiye|yagiye|ntayihari|ntiyihari|oldest post)\b/;
const GONE_ANYWHERE = /\b(?:already taken|has been taken|was taken|already rented|no longer available|not available anymore|byaragiye|oldest post)\b/;
const YES = /^(?:yes|yeah|yep|yah|sure|available|still available|it(?:'?s| is) (?:still )?available|iracyahari|irahari|yego|ndiyo|oui|disponible)\b/;
const QUESTION = /how much|what(?:'s| is) (?:the |your )?budget|budget\??$|features|details\??$|^where\??$|which (?:area|place|location)|single or (?:a )?family|for how many|when (?:do|will) you|ni angahe|amafaranga angahe/;

/** Read one broker message. */
export function parseBrokerReply(text: string | null | undefined): BrokerReply {
  const raw = (text ?? "").trim();
  // Ids and links carry digit runs that are not money ("…F120E69305").
  const t = fold(raw)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{10,}\b/g, " ")
    .replace(/[ \t]+/g, " ");
  const sale = SALE.test(t);
  const { rwf, usd, fee } = money(t);
  const bed = t.match(BEDROOMS);
  const bath = t.match(BATHROOMS);
  const zone = zoneNamed(raw);
  const unfurnished = /\bun-?furnished\b|\bempty\b|nta bikoresho/.test(t);
  const furnished = /\b(?:semi-? ?)?furnished\b|\bmeubl[ée]e?\b|ifite ibikoresho/.test(t.replace(/\bun-?furnished\b/g, " "));
  const bare = t.replace(/[^a-z ]/g, "").trim();
  const gone = GONE.test(bare) || GONE_ANYWHERE.test(t);
  const hasOffer = rwf.length > 0 || usd.length > 0 || bed != null;
  return {
    price: sale ? null : (rwf[0] ?? null),
    priceUsd: sale ? null : (usd[0] ?? null),
    bedrooms: STUDIO.test(t) ? 0 : count(bed?.[1] ?? bed?.[2]),
    bathrooms: count(bath?.[1]),
    place: zone?.nameEn ?? null,
    zoneSlug: zone?.slug ?? null,
    furnished: unfurnished ? false : furnished ? true : null,
    visitFee: fee,
    gone: gone && !hasOffer,
    question: !hasOffer && QUESTION.test(t.trim()),
    yes: !gone && YES.test(bare),
  };
}

/** Enough to show a tenant: a rent plus where or how big. */
export function isOffer(r: BrokerReply): boolean {
  return (r.price != null || r.priceUsd != null) && (r.place != null || r.bedrooms != null);
}
