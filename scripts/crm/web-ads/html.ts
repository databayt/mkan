/**
 * The web-ads lane's shared, pure pieces: the raw ad every site adapter returns,
 * the adapter contract, and the small HTML-to-facts helpers the adapters share.
 * No network, no disk — the adapters' parsers are tested on saved pages.
 */
import { toAsciiDigits } from '../home-intake-pure';

/** One ad as a site shows it, before any reading. Null = the site does not say. */
export interface RawAd {
  site: string;
  adId: string;
  url: string;
  title: string;
  /** The ad's own description, plain text. */
  text: string;
  price: number | null;
  currency: 'RWF' | 'USD' | 'EUR' | null;
  period: 'MONTH' | 'NIGHT' | 'UNKNOWN';
  /** The price exactly as the site printed it. */
  priceAsWritten: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /** The site's own type word: "apartment", "house", "room"… */
  propertyType: string | null;
  furnished: boolean | null;
  /** The most specific place the site names (neighbourhood, else sector). */
  place: string | null;
  district: string | null;
  province: string | null;
  /** The whole location line, for the gazetteer and the reader. */
  location: string;
  phones: string[];
  agencyName: string | null;
  photos: string[];
  /** ISO date (or YYYY-MM when the site only implies the month). */
  postedAt: string | null;
}

export interface AdLink {
  adId: string;
  url: string;
}

/** One site. `listUrl(n)` returns null past the last list page this adapter walks. */
export interface SiteAdapter {
  site: string;
  label: string;
  origin: string;
  listUrl(page: number): string | null;
  parseList(html: string): AdLink[];
  parseAd(html: string, link: AdLink): RawAd;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Page HTML → plain text, one block per line, tags and scripts gone. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Source newlines are layout, not text: only block tags break lines.
      .replace(/\s+/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|li|ul|ol|h[1-6]|tr|td|th|dt|dd|section|article|aside|header|footer|table|tbody|main|nav|form|label)\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The value after a label, on the same line ("Price: 500,000") or, when the
 * label stands alone ("Province" / "Kigali"), on the next line.
 */
export function labelValue(text: string, label: string): string | null {
  // A label opens a line, or follows a sentence on it ("…the property. Contact name: X").
  const same = new RegExp(`(?:^|\\n|[.!?]\\s+)\\s*${esc(label)}\\s*:\\s*([^\\n]*)`, 'i').exec(text);
  if (same) {
    const v = same[1]!.trim();
    return v && v !== '—' && v !== '-' ? v : null;
  }
  const next = new RegExp(`(?:^|\\n)\\s*${esc(label)}\\s*\\n([^\\n]+)`, 'i').exec(text);
  const v = next?.[1]?.trim();
  return v && v !== '—' && v !== '-' ? v : null;
}

/** The text between two markers (first `from`, then the first `to` after it). */
export function between(text: string, from: string, to: string | RegExp): string | null {
  const i = text.indexOf(from);
  if (i < 0) return null;
  const rest = text.slice(i + from.length);
  const j = typeof to === 'string' ? rest.indexOf(to) : rest.search(to);
  return (j < 0 ? rest : rest.slice(0, j)).trim() || null;
}

/** A count from "2", "2 bedroom(s)", "Bedrooms: 3". */
export function intIn(s: string | null | undefined): number | null {
  const m = /\d+/.exec(toAsciiDigits(s ?? ''));
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n < 100 ? n : null;
}

/**
 * A printed price → amount, currency, period. Reads "500,000 Rwf /month",
 * "Rwf 1 000 000 ≈ $ 675.68 USD / month", "600,000 FRW", "$1,200 per month",
 * "RWF 500,000", "600K". The first currency printed wins (sites append a
 * converted USD figure after the RWF one).
 */
export function parsePrice(raw: string | null | undefined): { amount: number | null; currency: RawAd['currency']; period: RawAd['period'] } {
  const s = toAsciiDigits(raw ?? '');
  const period: RawAd['period'] = /\b(month|monthly|mois|per\s*m|\/\s*m\b|ku\s*kwezi)/i.test(s)
    ? 'MONTH'
    : /\b(night|nightly|daily|per\s*day|\/\s*day|\/\s*night)/i.test(s)
      ? 'NIGHT'
      : 'UNKNOWN';
  const cur = /(rwf|frw|frs?\b|\$|usd|€|eur)/i.exec(s);
  const currency: RawAd['currency'] = !cur ? null : /\$|usd/i.test(cur[1]!) ? 'USD' : /€|eur/i.test(cur[1]!) ? 'EUR' : 'RWF';
  // The number nearest the first currency mark, else the first number.
  const nums = [...s.matchAll(/(\d[\d,. ]*\d|\d)\s*(k|m)?\b/gi)];
  if (!nums.length) return { amount: null, currency, period };
  const at = cur?.index ?? 0;
  const pick = nums.reduce((best, n) => (Math.abs((n.index ?? 0) - at) < Math.abs((best.index ?? 0) - at) ? n : best));
  let digits = pick[1]!.replace(/[ ,]/g, '');
  // "675.68" keeps its decimals; "1.000.000" is thousands dots.
  if (/^\d{1,3}(\.\d{3})+$/.test(digits)) digits = digits.replace(/\./g, '');
  let amount = Number(digits);
  const mult = pick[2]?.toLowerCase();
  if (mult === 'k') amount *= 1_000;
  if (mult === 'm') amount *= 1_000_000;
  return { amount: Number.isFinite(amount) && amount > 0 ? amount : null, currency, period };
}

/** Absolute, deduped URLs matching `re` (group 1 = the URL or path). */
export function urlsIn(html: string, re: RegExp, origin: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(re)) {
    const u = new URL(decodeEntities(m[1]!), origin).toString();
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

/** `<meta property="og:title" content="…">` and friends. */
export function metaContent(html: string, prop: string): string | null {
  const m =
    new RegExp(`<meta[^>]+(?:property|name)="${esc(prop)}"[^>]+content="([^"]*)"`, 'i').exec(html) ??
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${esc(prop)}"`, 'i').exec(html);
  return m ? decodeEntities(m[1]!).trim() || null : null;
}

/** "Yes"/"No"/"Furnished"/"Unfurnished" → boolean. */
export function yesNo(s: string | null | undefined): boolean | null {
  if (!s) return null;
  if (/\b(no|unfurnished|not furnished)\b/i.test(s)) return false;
  if (/\b(yes|furnished|fully)\b/i.test(s)) return true;
  return null;
}
