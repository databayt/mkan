/**
 * The TikTok lane's pure core — no network, no disk. Everything the CLI
 * (`tiktok.ts`) decides about a video is decided here so it can be tested.
 *
 * Fixtures in tests/crm/tiktok.test.ts are anonymised: the repo is public.
 */
import { z } from 'zod';
import { extractJsonObject, toAsciiDigits } from './home-intake-pure';
import { normalizePhone } from '../../src/lib/phone';
import { placeToken } from '../../src/lib/geo/place-token';
import { districtForPlace } from '../../src/lib/geo/rwanda-places';
import { factsFromFeatures } from '../../src/components/agent/amenities';
import { mergeTerms, termsFromText, type AdTerms } from './terms-pure';

// ── the ledger ───────────────────────────────────────────────────────────────
/** `failed`: three fetches in a row went wrong (blocked, removed, no formats) — not retried. */
export type VideoState = 'discovered' | 'fetched' | 'read' | 'upserted' | 'skipped' | 'failed';

export interface VideoMeta {
  caption: string;
  uploader: string;
  channel: string | null;
  timestamp: number | null;
  duration: number | null;
  views: number | null;
  /** TikTok's secUid — `tiktokuser:<id>` lists the account when `@handle` pages break. */
  channelId?: string | null;
}

export interface VideoRow {
  videoId: string;
  url: string;
  handle: string;
  via: 'seed' | 'search';
  query?: string;
  discoveredAt: string;
  state: VideoState;
  skipReason?: string;
  meta?: VideoMeta;
  frames?: string[];
  transcript?: string;
  /** Apple Vision OCR per frame, in frame order (index = frame number − 1). */
  ocr?: string[];
  read?: TikTokRead;
  readVersion?: string;
  frameUrls?: string[];
  /** Fetch attempts that failed; three moves the row to `failed`. */
  attempts?: number;
  homeId?: string;
  hostId?: string;
  error?: string;
  /** The caption-only text read already came back short of facts for this prompt version — go straight to vision. */
  textMissVersion?: string;
  /** Photo-mode post: the frames are its cover images, not video stills. */
  photoMode?: boolean;
  /** Upserted as another poster's copy of a home already on the board. */
  mergedInto?: string;
  /** The Twenty `tiktokPost` record, and a hash of what was last written to it. */
  postId?: string;
  postHash?: string;
}

export interface SeedRow {
  /** `paused`: three listings in a row failed (private, renamed, gone) — re-tried weekly. */
  status: 'active' | 'proposed' | 'ignored' | 'paused';
  from: 'manual' | 'search';
  addedAt: string;
  hits?: number;
  /** TikTok's secUid, learnt from one of the account's videos. */
  channelId?: string;
  /** One video of theirs (the search hit that found them) — its page gives the secUid when the ledger has none. */
  sampleUrl?: string;
  /** Runs in a row that could not list this account. */
  failStreak?: number;
  lastListedAt?: string;
  pausedAt?: string;
  pausedReason?: string;
  /** When its own recent captions were last read to promote or ignore it, and what they showed. */
  vettedAt?: string;
  vet?: string;
}

/** A seed that has failed three runs in a row stops being listed daily. */
export const SEED_PAUSE_STREAK = 3;
const WEEK_MS = 7 * 86_400_000;

/** Is this seed listed on this run? Active ones daily, paused ones once a week. */
export function seedIsDue(seed: SeedRow, nowMs = Date.now()): boolean {
  if (seed.status === 'active') return true;
  if (seed.status !== 'paused') return false;
  return !seed.pausedAt || nowMs - Date.parse(seed.pausedAt) >= WEEK_MS;
}

/**
 * A proposed account earns a seed once search keeps finding it AND one of its
 * posts already became a real home — 44 proposals sat unreviewed for a week.
 */
export function shouldPromote(seed: SeedRow, upsertedHomes: number): boolean {
  return seed.status === 'proposed' && (seed.hits ?? 0) >= 3 && upsertedHomes >= 1;
}

// ── discovery ────────────────────────────────────────────────────────────────
const VIDEO_URL = /tiktok\.com\/@([A-Za-z0-9._]{2,40})\/video\/(\d{15,21})/g;

/** Every TikTok video URL in a page of search results (raw, %-encoded or redirect-wrapped). */
export function tiktokVideosIn(html: string): { handle: string; videoId: string; url: string }[] {
  let text = html;
  try {
    text = `${html}\n${decodeURIComponent(html.replace(/%(?![0-9a-f]{2})/gi, '%25'))}`;
  } catch {
    /* keep the raw page */
  }
  const out = new Map<string, { handle: string; videoId: string; url: string }>();
  for (const m of text.matchAll(VIDEO_URL)) {
    const handle = m[1].toLowerCase();
    const videoId = m[2];
    if (!out.has(videoId)) out.set(videoId, { handle, videoId, url: `https://www.tiktok.com/@${handle}/video/${videoId}` });
  }
  return [...out.values()];
}

/** The search phrases — English, Kinyarwanda, French, by district. */
export const SEARCH_QUERIES: string[] = [
  'house for rent kigali',
  'apartment for rent kigali',
  'furnished apartment kigali',
  'inzu ikodeshwa kigali',
  'inzu zikodeshwa',
  'inzu yo gukodesha kigali',
  'appartement à louer kigali',
  'house for rent kicukiro',
  'house for rent gasabo',
  'house for rent nyarugenge',
  'house for rent kimironko',
  'house for rent kibagabaga',
  'house for rent nyamirambo',
  'house for rent remera',
  'house for rent kacyiru',
  'house for rent gisozi',
  'studio for rent kigali',
  'house for rent kanombe',
  'house for rent kagarama',
  'house for rent niboye',
  'house for rent gikondo',
  'house for rent rebero',
  'house for rent kinyinya',
  'house for rent gacuriro',
  'house for rent kagugu',
  'house for rent nyarutarama',
  'house for rent kimihurura',
  'house for rent kiyovu',
  'house for rent kabeza',
  'house for rent busanza',
  'house for rent masaka kigali',
  'house for rent rusororo',
  'apartment for rent kimironko',
  'apartment for rent kicukiro',
  'apartment for rent kacyiru',
  'apartment for rent nyarutarama',
  'furnished house for rent kigali',
  'cheap house for rent kigali',
  'room for rent kigali',
  'self contained room kigali',
  'annex for rent kigali',
  'kigali real estate agent',
  'kigali houses for rent tiktok',
  'inzu ikodeshwa kicukiro',
  'inzu ikodeshwa gasabo',
  'inzu ikodeshwa kimironko',
  'inzu ikodeshwa kanombe',
  'inzu ikodeshwa nyamirambo',
  'icyumba gikodeshwa kigali',
  'maison à louer kigali',
];

const RENT_WORDS = /(rent|renting|for\s*rent|ikodesh|gukodesh|kodesha|louer|location|bed\s*rooms?|bedroom|chambre|studio|apartment|appartement|furnished|self[-\s]?contain|compound|annex|ibyumba|icyumba|inzu)/i;
const EXPLICIT_RENT = /(for\s*rent|to\s*let|ikodeshwa|irakodeshwa|gukodesha|à\s*louer|a\s*louer|per\s*month|\/\s*month|monthly)/i;
const SALE_WORDS = /(for\s*sale|on\s*sale|selling|iragurishwa|igurishwa|kugurisha|ikibanza|plots?\b|land\s+for|à\s*vendre|a\s*vendre)/i;

/** What is left of a caption once hashtags, handles, links, phones and emoji are gone. */
export function captionWords(caption: string): string {
  return toAsciiDigits(caption)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@][\p{L}\p{N}_.]+/gu, ' ')
    .replace(/\+?\d[\d\s.-]{6,}\d/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A cheap gate before the reader: is this worth a read at all?
 *
 * Sale and land posts say "bedroom" too — they were 26 wasted reads. And a
 * caption that is only hashtags, a phone number or nothing (29 dropped unread)
 * leaves the facts in the frames' on-screen text, so the reader gets those.
 */
export function looksLikeRental(caption: string, fromSeed = false): boolean {
  if (RENT_WORDS.test(caption)) return !SALE_WORDS.test(caption) || EXPLICIT_RENT.test(caption);
  if (SALE_WORDS.test(caption)) return false;
  // A seed is an account we already know posts rentals: its wordy, off-topic
  // captions ("beauty update", a story) still carry a house in the frames.
  return fromSeed || captionWords(caption).length < 12;
}

export const NOT_A_RENTAL_CAPTION = 'caption does not read as a rental';

// ── vetting a proposed account ───────────────────────────────────────────────
const RWANDA_WORDS =
  /(kigali|rwanda|\brwf\b|\bfrw\b|\+?250\s?7|kicukiro|gasabo|nyarugenge|kimironko|remera|kacyiru|kibagabaga|nyamirambo|gisozi|kanombe|kagarama|niboye|gikondo|rebero|kinyinya|gacuriro|kagugu|nyarutarama|kimihurura|kiyovu|rusororo|masaka|kabeza|busanza|kanserege|ikodesh|gukodesh|inzu)/i;

/** A caption that names a rental outright (unlike looksLikeRental, a short vague caption doesn't count). */
export const rentalCaption = (c: string): boolean => RENT_WORDS.test(c) && (!SALE_WORDS.test(c) || EXPLICIT_RENT.test(c));

/**
 * What an account's own recent captions say about it. Search proposes any
 * account that once matched a phrase; this reads its last posts instead:
 * mostly Kigali rentals → a seed; plenty of posts and none a rental, or none
 * in Rwanda → ignored; too little to tell → stays proposed.
 */
export function vetVerdict(captions: string[]): { verdict: 'promote' | 'ignore' | 'keep'; rental: number; total: number; rwanda: boolean } {
  const total = captions.length;
  const rental = captions.filter(rentalCaption).length;
  // One stray word isn't enough: a fifth of the captions must place it in Rwanda.
  const rwanda = total > 0 && captions.filter((c) => RWANDA_WORDS.test(c)).length >= Math.max(1, Math.ceil(total * 0.2));
  let verdict: 'promote' | 'ignore' | 'keep' = 'keep';
  if (rental >= 3 && rental / total >= 0.3 && rwanda) verdict = 'promote';
  else if (total >= 5 && (rental === 0 || !rwanda)) verdict = 'ignore';
  return { verdict, rental, total, rwanda };
}

/**
 * Rows the caption gate skipped that today's gate would let through — the
 * gate has been loosened twice and skipped rows were never looked at again
 * (98 of 135 on 2026-10-20). Young enough to still be on the market only.
 */
export function requeueable(row: VideoRow, fromSeed: boolean, maxAgeDays: number, nowMs = Date.now()): boolean {
  if (row.state !== 'skipped') return false;
  const posted = row.meta?.timestamp ?? tiktokIdTime(row.videoId);
  const young = posted == null || nowMs / 1000 - posted <= maxAgeDays * 86400;
  // The age gate moved (7 → 30 days on 2026-10-25): a row it skipped is back
  // once today's window holds it.
  if (/^older than \d+ days$/.test(row.skipReason ?? '')) return young;
  if (row.skipReason !== NOT_A_RENTAL_CAPTION || !row.meta || !young) return false;
  return looksLikeRental(row.meta.caption, fromSeed);
}

/** The frames' OCR as one text — each distinct line once, in frame order. */
export function ocrText(row: Pick<VideoRow, 'ocr'>, max = 1200): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const frame of row.ocr ?? []) {
    for (const piece of frame.split(' | ')) {
      const k = piece.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (k.length < 2 || seen.has(k)) continue;
      seen.add(k);
      out.push(piece.trim());
    }
  }
  return out.join(' | ').slice(0, max);
}

/**
 * The frames that show the house: brokers burn a text card over the intro and
 * the outro, so the frames with the least OCR text are the tour. Ties keep the
 * middle of the video first. Frame numbers are 1-based, like the reader's.
 */
export function propertyFramesByOcr(ocr: string[] | undefined, n: number, max = 4): number[] {
  if (!n) return [];
  const mid = (n + 1) / 2;
  const len = (i: number) => (ocr?.[i] ?? '').replace(/[^A-Za-z0-9]/g, '').length;
  const frames = Array.from({ length: n }, (_, i) => i);
  const ranked = frames.sort((a, b) => len(a) - len(b) || Math.abs(a + 1 - mid) - Math.abs(b + 1 - mid));
  // A frame that is mostly a text card (≥ 60 letters) is never the house.
  const clean = ranked.filter((i) => len(i) < 60);
  return (clean.length ? clean : ranked).slice(0, max).map((i) => i + 1);
}

/**
 * Read order when the vision quota covers ~a third of the queue: a post that
 * names a phone and a price is a lead the agent can call today; then seeds
 * (known rental posters); then newest. Lower sorts first.
 */
export function readPriority(row: VideoRow, fromSeed: boolean): number[] {
  const text = `${adText(row)} ${row.handle} ${row.transcript ?? ''}`;
  const c = toAsciiDigits(adText(row)).toLowerCase();
  const price = /(\d+(?:[.,]\d+)?\s*(?:k|m|million)\b|\d{1,3}(?:[,.\s]\d{3})+|\b(?:rwf|frw|usd)\b|\$\s*\d)/.test(c);
  return [rwandaPhonesInText(text).length ? 0 : 1, price ? 0 : 1, fromSeed ? 0 : 1, -(row.meta?.timestamp ?? 0)];
}

export const byPriority = (a: number[], b: number[]): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
};

/** What the ad says in writing: its caption, then the text burned into its frames. */
export function adText(row: Pick<VideoRow, 'meta' | 'ocr'>): string {
  const ocr = ocrText(row);
  return [row.meta?.caption ?? '', ocr].filter(Boolean).join('\n');
}

/**
 * Does the written ad (caption + OCR of the frames) carry the facts — a price
 * and a room count? Those posts are read as text: the vision model's daily
 * quota (~30 reads) is kept for ads whose facts are only in the pictures.
 */
export function captionCarriesFacts(caption: string): boolean {
  const c = toAsciiDigits(caption).toLowerCase();
  const price = /(\d+(?:[.,]\d+)?\s*(?:k|m|million)\b|\d{1,3}(?:[,.\s]\d{3})+|\b(?:rwf|frw|usd)\b|\$\s*\d)/.test(c);
  // Kinyarwanda and French put the count after the word: "ibyumba 2", "chambres: 3".
  const rooms = /(\d+\s*(?:-|\s)?\s*(?:bed|bd|br|bedroom|chambre|ibyumba)|(?:ibyumba|chambres?|bedrooms?)\s*[:=-]?\s*\d|studio|single room|self[-\s]?contain)/.test(c);
  return price && rooms;
}

/**
 * When a video was posted, from its id alone: a TikTok id's top 32 bits are the
 * unix seconds. Search hits carry no timestamp, so before this each one paid a
 * `yt-dlp -J` just to learn it was months old.
 */
export function tiktokIdTime(videoId: string): number | null {
  if (!/^\d{15,20}$/.test(videoId)) return null;
  const s = Number(BigInt(videoId) >> 32n);
  // 2016-09 (TikTok's launch) .. a day ahead — anything else is not a TikTok id.
  return s > 1_472_000_000 && s < Date.now() / 1000 + 86_400 ? s : null;
}

/**
 * How many videos to fetch this run: enough to keep the read queue a little
 * ahead of what the reader can take, never more. Fetching 40 a day for a reader
 * that took 2–8 left 128 downloaded videos to go stale unread (10-20).
 */
export function fetchBudget(limit: number, readCapacity: number, queued: number): number {
  const want = Math.ceil(readCapacity * 1.2) - queued;
  return Math.max(0, Math.min(limit, want));
}

/**
 * Is the speech worth transcribing? An ad whose caption or on-screen text
 * already gives the price and a phone leaves Whisper nothing the reader needs —
 * and over music it invents. (The broker's spoken language is read from the
 * caption then, see `detectLanguages`.)
 */
export function needsTranscript(text: string): boolean {
  return !(captionCarriesFacts(text) && rwandaPhonesInText(text).length > 0);
}

/** Six (or n) evenly spaced timestamps, skipping the first and last 5% (intro cards, end screens). */
export function frameTimes(duration: number, n = 8): number[] {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const start = duration * 0.05;
  const span = duration * 0.9;
  return Array.from({ length: n }, (_, i) => +(start + (span * (i + 0.5)) / n).toFixed(2));
}

// ── phones ───────────────────────────────────────────────────────────────────
/**
 * A Rwandan mobile in any of the ways people write it → `+2507XXXXXXXX`.
 * 07xx xxx xxx · 7xxxxxxxx · +250 7… · 00250 7… · 250 7… · with spaces, dots, dashes.
 * MTN 078/079, Airtel 072/073. Returns null for anything else.
 */
export function normalizeRwandaPhone(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw, 'RW');
  return n?.startsWith('+250') ? n : null;
}

/** Every Rwandan mobile written inside free text, in order, deduped. */
export function rwandaPhonesInText(text: string): string[] {
  const found = toAsciiDigits(text).match(/(?:\+|00)?\d[\d\s.-]{7,15}\d/g) ?? [];
  const out: string[] = [];
  for (const f of found) {
    const n = normalizeRwandaPhone(f);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Twenty PHONES composite for a normalised `+250…` number. */
export function rwPhonesComposite(e164: string | null | undefined) {
  if (!e164) return undefined;
  return {
    primaryPhoneNumber: e164.replace(/^\+?250/, ''),
    primaryPhoneCountryCode: 'RW',
    primaryPhoneCallingCode: '+250',
    additionalPhones: [],
  };
}

// ── language ─────────────────────────────────────────────────────────────────
/** The languages a Kigali broker writes in — Twenty `preferredLanguage` options. */
export const LANGS = ['RW', 'EN', 'FR', 'SW', 'AR'] as const;
export type Lang = (typeof LANGS)[number];

/** A reader's or Whisper's language label → ours. Unknown → null. */
export function langCode(v: string | null | undefined): Lang | null {
  const k = (v ?? '').trim().toLowerCase();
  if (!k) return null;
  if (/^(rw|kin|kinyarwanda|ikinyarwanda|rn|kirundi)$/.test(k)) return 'RW';
  if (/^(en|eng|english)$/.test(k)) return 'EN';
  if (/^(fr|fra|fre|french|français|francais)$/.test(k)) return 'FR';
  if (/^(sw|swa|swahili|kiswahili)$/.test(k)) return 'SW';
  if (/^(ar|ara|arabic|العربية)$/.test(k)) return 'AR';
  return null;
}

// Words only one of the languages uses in a rental ad. "appartement" is left
// out: Kigali's English ads spell it that way too.
const LANG_WORDS: Record<Exclude<Lang, 'AR'>, RegExp> = {
  RW: /\b(inzu|ikodeshwa|irakodeshwa|gukodesha|gukodeshwa|icyumba|ibyumba|amafaranga|amazi|umuriro|iherereye|ifite|yigenga|ubwiherero|igikoni|ukwezi|nta|hamagara|twandikire|ibikoresho|kandi|cyangwa|iri|iyi|uyu|aho|muri|hafi|y'?umukozi|yumukozi|isoko|ahantu|igiciro|nziza|ni|ku|mu)\b/g,
  // Function words on both sides (the/and/is/in vs et/une/est/les), or a
  // bilingual EN+FR caption tips to whichever list has more of them.
  EN: /\b(for|rent|bedrooms?|bathrooms?|kitchen|living|room|price|available|furnished|unfurnished|house|located|near|with|and|the|is|in|of|to|a|an|it|has|this|call|contact|month|monthly|parking|compound|new|big|nice|very|clean)\b/g,
  FR: /\b(louer|chambres?|salon|cuisine|meubl[ée]e?|maison|par|mois|avec|douche|prix|quartier|disponible|pour|les|des|est|une?|et|à|tr[eè]s|neuf|propre)\b/g,
  // Not "kwa": Kinyarwanda uses it too ("kwa Kanombe").
  SW: /\b(nyumba|inapangishwa|kupangisha|kodi|vyumba|chumba|mwezi|choo|jiko|bei|karibu|mpangaji|sebule|inauzwa|piga)\b/g,
};

/**
 * Which languages a text is in, most used first, by counting words only that
 * language uses in a rental ad. Kigali captions mix (English facts, Kinyarwanda
 * call-to-action), so all of them are returned with their counts.
 */
export function detectLanguages(text: string): { lang: Lang; hits: number }[] {
  const t = (text ?? '').toLowerCase();
  const out: { lang: Lang; hits: number }[] = [];
  for (const [lang, re] of Object.entries(LANG_WORDS) as [Lang, RegExp][]) {
    const hits = t.match(re)?.length ?? 0;
    if (hits) out.push({ lang, hits });
  }
  const ar = t.match(/[\u0600-\u06FF]+/g)?.length ?? 0;
  if (ar) out.push({ lang: 'AR', hits: ar });
  // Ties → RW: it is the language every Kigali broker reads.
  return out.sort((a, b) => b.hits - a.hits || (a.lang === 'RW' ? -1 : b.lang === 'RW' ? 1 : 0));
}

const mostCommon = (votes: Map<string, { n: number; label: string }>): string | null => {
  let best: { n: number; label: string } | null = null;
  for (const v of votes.values()) if (!best || v.n > best.n) best = v;
  return best?.label ?? null;
};
const vote = (votes: Map<string, { n: number; label: string }>, label: string | null | undefined, w = 1) => {
  const l = (label ?? '').trim();
  const k = l.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (k.length < 2) return;
  const cur = votes.get(k);
  votes.set(k, { n: (cur?.n ?? 0) + w, label: cur?.label ?? l });
};

export interface BrokerProfile {
  /** The agency or broker name their ads show most. */
  brokerName: string | null;
  /** The person to ask for ("call Eric") their ads name most. */
  contactName: string | null;
  /** The language to write to them in. */
  preferredLanguage: Lang;
  /** Every language their ads use, most used first. */
  languages: Lang[];
}

/**
 * One broker from all of an account's posts: the name and contact their ads
 * repeat, and the language they write to tenants in. The caption is how the
 * broker writes, so it counts double; the on-screen text once; the reader's
 * own call (it also hears the speech) three times. Whisper's language guess is
 * not used: it has no Kinyarwanda and labels it Swahili or worse.
 */
export function brokerProfile(rows: Pick<VideoRow, 'meta' | 'ocr' | 'read'>[]): BrokerProfile {
  const names = new Map<string, { n: number; label: string }>();
  const contacts = new Map<string, { n: number; label: string }>();
  const score = new Map<Lang, number>();
  const add = (l: Lang | null, w: number) => l && score.set(l, (score.get(l) ?? 0) + w);
  for (const r of rows) {
    vote(names, r.read?.brokerName);
    vote(contacts, r.read?.contactName);
    const written = [
      ...detectLanguages(r.meta?.caption ?? '').map((x) => [x.lang, x.hits * 2] as const),
      ...detectLanguages(ocrText(r)).map((x) => [x.lang, x.hits] as const),
    ];
    for (const [l, w] of written) add(l, w);
    if (r.read?.primaryLanguage) add(r.read.primaryLanguage, 3);
    for (const l of r.read?.languages ?? []) add(l, 1);
  }
  const languages = [...score.entries()].sort((a, b) => b[1] - a[1] || (a[0] === 'RW' ? -1 : b[0] === 'RW' ? 1 : 0)).map(([l]) => l);
  return { brokerName: mostCommon(names), contactName: mostCommon(contacts), preferredLanguage: languages[0] ?? 'RW', languages };
}

// ── the reader's result ──────────────────────────────────────────────────────
const nullableStr = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));
const nullableNum = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(toAsciiDigits(String(v)).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  });

export const PROPERTY_TYPES = ['Apartment', 'Villa', 'Townhouse', 'Cottage', 'Tinyhouse', 'Rooms'] as const;

const utility = z.enum(['INCLUDED', 'SEPARATE']).nullable().optional().catch(null).transform((v) => v ?? null);
/**
 * tiktok-v4's commission: `{pct, none}`. Readers also answer "none", a bare
 * number, or 0.25 for 25% — all folded into the one shape; anything else → null.
 */
const commissionField = z
  .unknown()
  .optional()
  .transform((v): { pct: number | null; none: boolean } | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'string' && /^(none|no|no commission)$/i.test(v.trim())) return { pct: null, none: true };
    const raw = typeof v === 'object' ? (v as { pct?: unknown; none?: unknown }) : { pct: v, none: false };
    const none = raw.none === true || raw.none === 'true';
    const n = raw.pct == null || raw.pct === '' ? null : Number(toAsciiDigits(String(raw.pct)).replace(/[^\d.]/g, ''));
    const pct = n != null && Number.isFinite(n) && n > 0 ? (n < 1 ? Math.round(n * 100) : n <= 200 ? n : null) : null;
    if (none) return { pct: null, none: true };
    return typeof v === 'object' || pct != null ? { pct, none: false } : null;
  })
  .catch(null);

export const TikTokReadSchema = z.object({
  isRental: z.boolean(),
  rejectReason: nullableStr,
  inKigali: z.boolean(),
  period: z.enum(['MONTH', 'NIGHT', 'UNKNOWN']).catch('UNKNOWN'),
  priceRwf: nullableNum,
  priceAsWritten: nullableStr,
  propertyType: z.enum(PROPERTY_TYPES).nullable().optional().catch(null).transform((v) => v ?? null),
  roomType: z.enum(['ENTIRE_HOME', 'PRIVATE_ROOM', 'SHARED_ROOM']).nullable().optional().catch(null).transform((v) => v ?? null),
  bedrooms: nullableNum,
  bathrooms: nullableNum,
  furnished: z.boolean().nullable().optional().catch(null).transform((v) => v ?? null),
  // tiktok-v4: the renting terms the ad states. Reads stored before v4 have none → null.
  depositMonths: nullableNum.catch(null).transform((v) => (v != null && v >= 0 && v <= 12 ? v : null)),
  commission: commissionField,
  viewingFee: nullableNum.catch(null).transform((v) => (v != null && v >= 0 && v <= 100_000 ? Math.round(v) : null)),
  water: utility,
  electricity: utility,
  district: z.enum(['GASABO', 'KICUKIRO', 'NYARUGENGE']).nullable().optional().catch(null).transform((v) => v ?? null),
  neighbourhood: nullableStr,
  // Readers answer null for an empty list now and then; that is [] (10-25: a text read died on it).
  phones: z.array(z.string()).nullable().optional().catch([]).transform((v) => v ?? []),
  posterKind: z.enum(['BROKER', 'OWNER', 'UNKNOWN']).catch('UNKNOWN'),
  features: z.array(z.string()).nullable().optional().catch([]).transform((v) => v ?? []),
  units: z
    .array(z.object({ bedrooms: nullableNum, priceRwf: nullableNum, propertyType: z.enum(PROPERTY_TYPES).nullable().optional().catch(null).transform((v) => v ?? null) }))
    .nullable()
    .optional()
    .catch([])
    .transform((v) => v ?? []),
  propertyFrames: z.array(z.number().int()).nullable().optional().catch([]).transform((v) => v ?? []),
  titleEn: nullableStr,
  titleRw: nullableStr,
  descriptionEn: nullableStr,
  // tiktok-v3: the ad's own words, for the TikTok post record.
  onScreenText: nullableStr,
  brokerName: nullableStr,
  // tiktok-v5: who answers the phone, and the languages the ad is written/spoken in.
  contactName: nullableStr,
  languages: z.array(z.string()).nullable().optional().catch([]).transform((v) => v ?? []).transform((v) => [...new Set(v.map(langCode).filter((l): l is Lang => !!l))]),
  primaryLanguage: z.string().nullable().optional().catch(null).transform((v) => langCode(v)),
  confidence: z.number().min(0).max(1).catch(0.5),
});
export type TikTokRead = z.infer<typeof TikTokReadSchema>;

/** The reader's text → a validated read. Throws with the zod message on a bad shape. */
export function parseTikTokRead(text: string): TikTokRead {
  const read = TikTokReadSchema.parse(extractJsonObject(text));
  // No price, no period: readers default to MONTH, which reads as a fact it isn't.
  return read.priceRwf == null ? { ...read, period: 'UNKNOWN' } : read;
}

// ── what a read becomes ──────────────────────────────────────────────────────
export type District = 'GASABO' | 'KICUKIRO' | 'NYARUGENGE';

/**
 * The district, trusting a named sector/neighbourhood over the reader's own
 * guess — the gazetteer knows Kimironko is Gasabo; the reader only thinks so.
 */
export function resolveDistrict(read: Pick<TikTokRead, 'district' | 'neighbourhood'>, caption = ''): District | null {
  for (const text of [read.neighbourhood, caption]) {
    const d = districtForPlace(text);
    if (d !== 'UNKNOWN') return d;
  }
  return read.district ?? null;
}

/** The phones to file: the reader's, validated, plus any the caption spells out. */
export function phonesFor(read: Pick<TikTokRead, 'phones'>, caption: string): string[] {
  const out: string[] = [];
  for (const p of [...read.phones.map(normalizeRwandaPhone), ...rwandaPhonesInText(caption)]) if (p && !out.includes(p)) out.push(p);
  return out;
}

/** "hafi ya Kigali", "near Kigali", "près de Kigali" — said of homes that are NOT in it. */
const NEAR_KIGALI = /(hafi\s+(?:ya|y'|y’)\s*kigali|near\s+kigali|close\s+to\s+kigali|pr[eè]s\s+de\s+kigali|outside\s+kigali)/i;

/**
 * Is the home in Kigali? The gazetteer outranks the reader: it filed a
 * Norvege flat (Nyarugenge) as "outside Kigali" and a Kamonyi house captioned
 * "hafi ya kigali" as inside. The named neighbourhood decides first, then
 * the caption, then the reader.
 */
export function inKigaliFor(read: Pick<TikTokRead, 'inKigali' | 'neighbourhood'>, caption = ''): boolean {
  const hood = districtForPlace(read.neighbourhood);
  if (hood !== 'UNKNOWN') return true;
  if (NEAR_KIGALI.test(caption) || NEAR_KIGALI.test(read.neighbourhood ?? '')) return false;
  if (districtForPlace(caption) !== 'UNKNOWN') return true;
  return read.inKigali;
}

/** Should this read become a CRM home? `null` = yes, otherwise the reason it is skipped. */
export function skipReasonFor(read: TikTokRead, opts: { caption?: string; minConfidence?: number } = {}): string | null {
  if (!read.isRental) return `not a rental${read.rejectReason ? `: ${read.rejectReason}` : ''}`;
  if (!inKigaliFor(read, opts.caption)) return 'outside Kigali';
  // "?bd ? RWF" at 0.6 reached VETTING four times from one account (10-20).
  if (read.priceRwf == null && read.bedrooms == null && !read.units?.length) return 'no price and no rooms';
  const min = opts.minConfidence ?? 0.6;
  if (read.confidence < min) return `low confidence ${read.confidence}`;
  return null;
}

/**
 * Kigali rents people actually ask (2026-10: 1bd ~150k, villas ~3M a month).
 * Outside the band is usually a misread ("20000" was a deposit, "300" was
 * USD) — kept, but flagged so nobody quotes it.
 */
export const PRICE_BAND = { MONTH: [60_000, 15_000_000], NIGHT: [10_000, 1_000_000] } as const;
export function priceLooksWrong(read: Pick<TikTokRead, 'priceRwf' | 'period'>): boolean {
  if (read.priceRwf == null || read.period === 'UNKNOWN') return false;
  const [lo, hi] = PRICE_BAND[read.period];
  return read.priceRwf < lo || read.priceRwf > hi;
}

/** The currency the post wrote the price in, when it was not RWF. */
export function currencyAsWritten(priceAsWritten: string | null | undefined): 'USD' | 'EUR' | null {
  const s = priceAsWritten ?? '';
  if (/\$|\busd\b|dollars?/i.test(s)) return 'USD';
  if (/€|\beur(?:o|os)?\b/i.test(s)) return 'EUR';
  return null;
}

/** Frame paths the reader said show the property (1-based), falling back to none rather than faces. */
export function propertyFramePaths(frames: string[], picks: number[], max = 6): string[] {
  const seen = new Set<number>();
  const out: string[] = [];
  for (const p of picks) {
    if (p >= 1 && p <= frames.length && !seen.has(p)) {
      seen.add(p);
      out.push(frames[p - 1]);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** A one-line title when the reader gave none: "2-bedroom apartment in Nyamirambo". */
export function fallbackTitle(read: TikTokRead): string {
  const beds = read.bedrooms ? `${read.bedrooms}-bedroom ` : '';
  const type = (read.propertyType ?? 'home').toLowerCase().replace('rooms', 'room');
  const where = read.neighbourhood ?? 'Kigali';
  return `${beds}${type} in ${where}`.replace(/^\w/, (c) => c.toUpperCase());
}

export { placeToken };

/**
 * Same facts = probably the same house — posted twice by one broker, or by two
 * brokers sharing a listing (Kigali brokers re-post each other's homes, so the
 * handle is not part of the key). Prices are bucketed to 5% to absorb "450k"
 * against "450,000 + commission".
 */
const BROAD_PLACES = new Set(['kigali', 'kigali city', 'rwanda', 'kigali rwanda']);

export function dupKey(_handle: string, read: Pick<TikTokRead, 'priceRwf' | 'bedrooms' | 'neighbourhood'>): string | null {
  if (read.priceRwf == null || read.bedrooms == null) return null;
  const place = placeToken(read.neighbourhood);
  // "Kigali" names a city, not a street: two 1-bedrooms at one price there are two homes.
  if (!place || BROAD_PLACES.has(place)) return null;
  const bucket = Math.round(Math.log(read.priceRwf) / Math.log(1.05));
  return [read.bedrooms, bucket, place].join('|');
}

/**
 * One post, one or several homes. A broker's "1bd 600k / 2bd 700k / 3bd 800k"
 * is three homes; the first keeps the video's own `tiktok:<id>` and the rest
 * get `tiktok:<id>#2`, `#3` so each has a stable key of its own.
 */
export function unitReads(videoId: string, read: TikTokRead): { sourceId: string; read: TikTokRead }[] {
  // Reads stored before tiktok-v2 have no `units` at all.
  if ((read.units ?? []).length < 2) return [{ sourceId: `tiktok:${videoId}`, read }];
  return read.units.map((u, i) => {
    const unit: TikTokRead = {
      ...read,
      bedrooms: u.bedrooms ?? read.bedrooms,
      priceRwf: u.priceRwf ?? read.priceRwf,
      propertyType: u.propertyType ?? read.propertyType,
      units: [],
    };
    // The reader's title names the first unit; the others get a factual one.
    if (i > 0) Object.assign(unit, { titleEn: null, titleRw: null });
    return { sourceId: i === 0 ? `tiktok:${videoId}` : `tiktok:${videoId}#${i + 1}`, read: unit };
  });
}

const linkList = (urls: string[], label = '') =>
  urls.length
    ? { primaryLinkUrl: urls[0], primaryLinkLabel: label, secondaryLinks: urls.slice(1).map((url) => ({ url, label })) }
    : undefined;
const rwf = (n: number | null) => (n != null ? { amountMicros: Math.round(n * 1_000_000), currencyCode: 'RWF' } : undefined);

/**
 * The terms a post states: the reader's answer first, then the rules over the
 * caption and on-screen text (terms-pure.ts) — a v3 read never asked, and a
 * model misses "nta komisiyo" now and then. Furnishing also falls back to the
 * reader's features ("furnished") before the rules.
 */
export function adTermsFor(row: Pick<VideoRow, 'meta'>, read: TikTokRead, readVersion?: string | null): AdTerms {
  const rules = termsFromText([row.meta?.caption, read.onScreenText].filter(Boolean).join('\n'), { priceRwf: read.priceRwf });
  return mergeTerms({ ...read, furnished: statedFurnished(read, readVersion) ?? factsFromFeatures(read.features).furnished }, rules);
}

/**
 * The reader's `furnished`, when it means something. Before tiktok-v4 (and
 * facebook-v1) the prompt never said "null when not said", and 126 of 235
 * TikTok reads answered false for captions that say nothing about furniture.
 * Their `true` (furniture seen in the frames) still counts.
 */
export function statedFurnished(read: Pick<TikTokRead, 'furnished'>, readVersion?: string | null): boolean | null {
  if (read.furnished === false && /^(tiktok-v[123]|facebook-v1)\b/.test(readVersion ?? '')) return null;
  return read.furnished ?? null;
}

/** The Twenty `home` body for one read video. Undefined values are dropped by the caller. */
export function homeBody(row: VideoRow, read: TikTokRead, opts: { frameUrls: string[]; phone: string | null; hostName: string; promptVersion: string; duplicate: boolean; sourceId?: string }) {
  const district = resolveDistrict(read, row.meta?.caption ?? '');
  const title = read.titleEn ?? fallbackTitle(read);
  const currency = currencyAsWritten(read.priceAsWritten);
  // The board's own chips: a wrong-looking price outranks a missing phone,
  // since a call fixes the phone but a quoted misread loses the tenant.
  const qualificationStatus = priceLooksWrong(read) ? 'PRICE_ANOMALY' : !opts.phone ? 'UNREACHABLE_HOST' : undefined;
  const terms = adTermsFor(row, read, opts.promptVersion);
  return {
    source: 'TIKTOK',
    sourceId: opts.sourceId ?? `tiktok:${row.videoId}`,
    sourceUrl: linkList([row.url], 'TikTok'),
    scrapedAt: new Date().toISOString(),
    country: 'RWANDA',
    city: 'KIGALI',
    zone: district ? `KIGALI_${district}` : undefined,
    homeState: district ?? undefined,
    homeAddress: read.neighbourhood ? { addressStreet1: read.neighbourhood, addressCity: 'Kigali', addressCountry: 'Rwanda' } : undefined,
    hostName: opts.hostName,
    hostPhone: rwPhonesComposite(opts.phone),
    title,
    titleEn: title,
    titleRw: read.titleRw ?? undefined,
    description: read.descriptionEn ?? row.meta?.caption ?? undefined,
    descriptionEn: read.descriptionEn ?? undefined,
    notesEn: [
      read.priceAsWritten ? `Price as written: ${read.priceAsWritten}` : null,
      currency ? `Currency as written: ${currency} — RWF price is converted, confirm with the broker.` : null,
      read.priceRwf == null ? 'No price in the post — ask the broker.' : null,
      priceLooksWrong(read) ? `Price ${read.priceRwf} RWF/${read.period.toLowerCase()} is outside the usual Kigali band — check before quoting.` : null,
      !opts.phone ? 'No phone in the post — reach the poster on TikTok.' : null,
      row.photoMode ? 'Photo-mode post: the photos are its cover images.' : null, read.features.length ? `Features: ${read.features.join(', ')}` : null, `Read by tiktok ${opts.promptVersion}, confidence ${read.confidence}`]
      .filter(Boolean)
      .join('\n'),
    // Twenty keys SELECT options in UPPER_SNAKE (live: APARTMENT, VILLA, …).
    propertyType: read.propertyType ? read.propertyType.toUpperCase() : undefined,
    roomType: read.roomType ?? undefined,
    bedrooms: read.bedrooms ?? undefined,
    bathrooms: read.bathrooms ?? undefined,
    // As the ad states them; empty = not stated. commissionPct is a percent (25), not a fraction.
    furnishing: terms.furnished == null ? undefined : terms.furnished ? 'FURNISHED' : 'UNFURNISHED',
    depositMonths: terms.depositMonths ?? undefined,
    commissionPct: terms.commission?.pct ?? undefined,
    noCommission: terms.commission ? terms.commission.none : undefined,
    viewingFee: terms.viewingFee ?? undefined,
    water: terms.water ?? undefined,
    electricity: terms.electricity ?? undefined,
    amenitiesRaw: read.features.length ? read.features : undefined,
    rentPeriod: read.period,
    priceMonthLocal: read.period === 'MONTH' ? rwf(read.priceRwf) : undefined,
    priceNightLocal: read.period === 'NIGHT' ? rwf(read.priceRwf) : undefined,
    priceConfirmedByHost: false,
    photoUrls: linkList(opts.frameUrls),
    coverPhotoUrl: linkList(opts.frameUrls.slice(0, 1)),
    photoCount: opts.frameUrls.length,
    photosRehosted: opts.frameUrls.length > 0,
    photoStage: opts.frameUrls.length ? 'INCOMPLETE' : 'NOT_FOUND',
    duplicateCheck: opts.duplicate ? 'SUSPECTED' : 'NONE',
    qualificationStatus,
    hotelAgencyCheck: read.posterKind === 'BROKER' ? 'LARGE_PORTFOLIO' : 'UNCHECKED',
    labels: ['SCRAPED'],
    homeStatus: 'SCRAPED',
    pipelineStage: 'VETTING',
    publishState: 'NOT_IMPORTED',
  };
}

/**
 * Which ledger rows get a TikTok post record: every video the reader judged or
 * is waiting to judge. Rows the caption gate or the age gate dropped unread
 * have nothing worth keeping beyond the ledger.
 */
export function wantsPost(row: VideoRow): boolean {
  if (!row.meta) return false;
  if (row.state === 'fetched' || row.state === 'read' || row.state === 'upserted') return true;
  return row.state === 'skipped' && !!row.read;
}

export function postStatus(row: VideoRow): 'WAITING' | 'LISTING' | 'JOINED_EXISTING' | 'SKIPPED' {
  if (row.state === 'upserted') return row.mergedInto ? 'JOINED_EXISTING' : 'LISTING';
  if (row.state === 'skipped') return 'SKIPPED';
  return 'WAITING';
}

/** The Twenty `tiktokPost` body for one video: the ad as posted. Undefined values are dropped by the caller. */
export function postBody(row: VideoRow) {
  const read = row.read;
  const published = row.meta?.timestamp ? new Date(row.meta.timestamp * 1000) : null;
  const broker = read?.brokerName ?? row.meta?.channel ?? row.handle;
  const phones = read ? phonesFor(read, `${adText(row)} ${row.handle} ${row.transcript ?? ''}`) : rwandaPhonesInText(`${adText(row)} ${row.handle}`);
  return {
    name: `${broker} · ${published ? published.toISOString().slice(0, 10) : row.videoId}`,
    videoId: row.videoId,
    videoUrl: linkList([row.url], 'TikTok'),
    tiktokHandle: row.handle,
    accountName: row.meta?.channel ?? undefined,
    brokerName: broker,
    publishedAt: published?.toISOString(),
    caption: row.meta?.caption || undefined,
    // The reader copies what it sees; the OCR is the full text when the read
    // came from text alone (no frames sent).
    onScreenText: read?.onScreenText ?? (ocrText(row) || undefined),
    contactName: read?.contactName ?? undefined,
    languages: postLanguages(row),
    transcript: row.transcript || undefined,
    phonesSeen: phones.length ? phones.join(', ') : undefined,
    views: row.meta?.views ?? undefined,
    durationSec: row.meta?.duration ?? undefined,
    postStatus: postStatus(row),
    skipReason: row.state === 'skipped' ? row.skipReason : undefined,
    coverUrl: linkList(row.frameUrls ?? []),
    readVersion: row.readVersion,
    scrapedAt: row.discoveredAt,
    homeId: row.state === 'upserted' ? (row.mergedInto ?? row.homeId) : undefined,
    hostId: row.state === 'upserted' ? row.hostId : undefined,
  };
}

/** The Twenty `host` body for a TikTok poster. */
export function hostBody(row: VideoRow, read: TikTokRead, phone: string | null, profile?: BrokerProfile) {
  const p = profile ?? brokerProfile([row]);
  return {
    name: p.brokerName || p.contactName || row.meta?.channel || row.handle,
    contactName: p.contactName ?? undefined,
    source: 'TIKTOK',
    tiktokHandle: row.handle,
    phone: rwPhonesComposite(phone),
    contactFoundVia: 'TIKTOK',
    preferredLanguage: p.preferredLanguage,
    agencySuspected: read.posterKind === 'BROKER',
    contactConfidence: phone ? undefined : 'NONE',
    notes: `TikTok @${row.handle} — https://www.tiktok.com/@${row.handle}`,
  };
}

/** The languages one post uses — the reader's call, else the written words. */
export function postLanguages(row: Pick<VideoRow, 'meta' | 'ocr' | 'read'>): Lang[] | undefined {
  const p = brokerProfile([row]);
  return p.languages.length ? p.languages : undefined;
}

/**
 * What a host already in Twenty learns from the broker profile. Only fields
 * the lane itself set are touched: a name that is still the handle or channel
 * name, a language still on the old blanket 'RW' default, an empty contact.
 * A person's edit in Twenty is never overwritten.
 */
export function hostProfilePatch(
  host: { name?: unknown; contactName?: unknown; preferredLanguage?: unknown },
  row: Pick<VideoRow, 'handle' | 'meta'>,
  p: BrokerProfile,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const name = String(host.name ?? '').trim();
  const autoName = !name || name === row.handle || name === row.meta?.channel;
  const better = p.brokerName || p.contactName;
  if (autoName && better && better !== name) patch.name = better;
  if (!host.contactName && p.contactName) patch.contactName = p.contactName;
  const lang = host.preferredLanguage as string | null | undefined;
  if (p.languages.length && (!lang || lang === 'RW') && p.preferredLanguage !== lang) patch.preferredLanguage = p.preferredLanguage;
  return patch;
}
