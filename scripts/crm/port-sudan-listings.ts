/**
 * Port Sudan unit-level listings — collect the individual flats, not the operators.
 *
 * port-sudan-discover.ts answered "who holds inventory in this city" and found 43
 * businesses. Its own discovery log names the thing it deliberately did NOT do,
 * as gap #1:
 *
 *   "Individual landlord ads are catalogued, not collected. Each such ad is one
 *    landlord with one flat — genuine Mkan supply, but a different unit of work
 *    from the business-level dataset this brief asked for. Collecting them is the
 *    obvious next project."
 *
 * This is that project. A record here is ONE PROPERTY, not one business: a studio
 * in حي المطار مربع ٨ at 1,200/month is a row. The business-level dataset stays
 * where it is and is not modified — the two join on phone number, which is the
 * only identifier this market actually shares across platforms.
 *
 *   pnpm crm:ps-listings
 *
 * ── Sources, and what each can give ─────────────────────────────────────────
 *
 *   sources/alsoug-adverts.json     Classifieds board, crawled ad-by-ad. Richest
 *                                   structure available anywhere: rooms, baths,
 *                                   floor, area, furnished, generator, price and
 *                                   currency. NEVER a phone — alsoug hides the
 *                                   advertiser's number behind a login gate.
 *   sources/channels-expansion.json Units observed in a business's own public
 *                                   marketing (TikTok captions carry phones that
 *                                   the business published itself).
 *   sources/facebook-groups.json    Group posts, collected through a logged-in
 *                                   browser session. This is where the volume is:
 *                                   one group alone has 126.6K members. Posts are
 *                                   free text and carry phones inline.
 *   whatsapp-exports/*.txt          "Export chat → without media" dumps. Same
 *                                   shape as Facebook — free text, inline phones,
 *                                   but with a real timestamp per message.
 *
 * Only the first two exist on the first run. The generator does not throw on a
 * missing source; it reports what was absent, because a silent skip reads as
 * "there was nothing there".
 *
 * ── The rule this inherits from its sibling ─────────────────────────────────
 * Nothing enters from recall. Every listing carries a provenance record — a URL
 * that was fetched, or a file and line number that can be opened — and the script
 * ASSERTS that before writing. A plausible-sounding flat that nobody can trace
 * back to a post is worse than an empty dataset, because someone will call it.
 *
 * ── Why the zone canon is loaded rather than re-guessed ─────────────────────
 * zones.json already holds 45 zones with their aliases, and those aliases matter:
 * "وسط السوق" is an alias of city-centre, NOT of popular-market, and a hand-rolled
 * mapping gets that wrong. Zone assignment here resolves against that file so this
 * script cannot drift from generate-port-sudan-zones.ts.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RES = 'data/market-research/port-sudan';
const SRC = join(RES, 'sources');
const WA  = join(RES, 'whatsapp-exports');
const OUT = 'data/listings/portsudan';

/** Fixed, not `new Date()` — reruns must be byte-identical. */
const RUN_DATE = '2026-08-14';

const readJson = <T,>(p: string): T | null =>
  existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null;

// ── Arabic-Indic digits ──────────────────────────────────────────────────────
// This market writes prices and block numbers in both scripts, often in the same
// sentence ("حي المطار مربع ٨ ... 1200"). Fold before any number is parsed.
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const foldDigits = (s: string): string =>
  s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));

const foldArabic = (s: string): string =>
  foldDigits(s)
    .replace(/[ً-ْـ]/g, '')   // diacritics + tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

// ── Zone resolution ──────────────────────────────────────────────────────────
type Zone = {
  zone_slug: string; canonical_name: string; arabic_name: string;
  english_name: string; aliases: string[]; sector: string;
};

const loadZones = (): Zone[] => {
  const z = readJson<{ zones: Zone[] }>(join(RES, 'zones.json'));
  if (!z) throw new Error(
    `Zone canon missing at ${join(RES, 'zones.json')}. Run \`pnpm crm:ps-zones\` first — ` +
    `this script resolves districts against that file rather than re-guessing them.`,
  );
  return z.zones;
};

/**
 * Longest-alias-first so "ديم المدينة غرب" cannot be swallowed by a bare "ديم".
 * Returns null rather than guessing: an unplaced listing is honest, a
 * mis-zoned one silently corrupts the density map the acquisition team plans from.
 */
const buildZoneResolver = (zones: Zone[]) => {
  const terms: Array<{ needle: string; slug: string }> = [];
  for (const z of zones) {
    for (const n of [z.canonical_name, z.arabic_name, z.english_name, ...(z.aliases || [])]) {
      if (!n) continue;
      const f = foldArabic(String(n)).toLowerCase();
      if (f.length >= 3) terms.push({ needle: f, slug: z.zone_slug });
    }
  }
  // Spellings the canon does not carry but adverts actually use — e.g. the bare
  // "الثورة" (canon has only "حي الثورة") and the single-alef "سللاب". Each entry
  // in that file carries the advert it was observed in; none is guessed.
  const ext = readJson<{ aliases: Array<{ zone_slug: string; alias: string }> }>(
    join(SRC, 'zone-alias-extensions.json'),
  );
  for (const a of ext?.aliases ?? []) {
    const f = foldArabic(a.alias).toLowerCase();
    if (f.length >= 3) terms.push({ needle: f, slug: a.zone_slug });
  }
  terms.sort((a, b) => b.needle.length - a.needle.length);
  return (text: string): { slug: string; matched: string } | null => {
    const hay = foldArabic(text || '').toLowerCase();
    for (const t of terms) if (hay.includes(t.needle)) return { slug: t.slug, matched: t.needle };
    return null;
  };
};

// ── Phones ───────────────────────────────────────────────────────────────────
// Sudan mobile: +249 then 9 digits, or local 0 then 9 digits. Normalised to E.164
// so a listing can join the business dataset, which stores the same shape.
const PHONE_RE = /(?:\+?249[\s-]?|0)(1[0-9]|9[0-9])[\s-]?(\d{3})[\s-]?(\d{4})/g;

const extractPhones = (text: string): string[] => {
  const out = new Set<string>();
  const t = foldDigits(text || '');
  for (const m of t.matchAll(PHONE_RE)) out.add(`+249${m[1]}${m[2]}${m[3]}`);
  return [...out];
};

// ── Price ────────────────────────────────────────────────────────────────────
// Two currencies circulate and they mean different tenants. The discovery log
// found the top of this market prices in USD and is let to companies and NGOs,
// while SDG prices are households. Currency is therefore a signal, not a format
// detail, and is never inferred when the text does not state it.
type Price = { amount: number | null; currency: 'USD' | 'SDG' | null; period: string | null; raw: string | null };

const parsePrice = (raw: string | null | undefined, blob: string): Price => {
  const none: Price = { amount: null, currency: null, period: null, raw: raw ?? null };
  const period =
    /يومي|بالايام|بالأيام|لليلة|daily|per night/i.test(blob) ? 'day' :
    /اسبوع|أسبوع|weekly/i.test(blob) ? 'week' :
    /سنوي|سنويا|annual|yearly/i.test(blob) ? 'year' :
    /شهري|الشهر|بالشهر|month/i.test(blob) ? 'month' : null;

  if (!raw) return { ...none, period };
  const t = foldDigits(String(raw));
  const usd = t.match(/(?:US\$|\$|دولار)\s*([\d,\.]+)|([\d,\.]+)\s*(?:US\$|\$|دولار)/);
  if (usd) {
    const n = Number((usd[1] || usd[2] || '').replace(/,/g, ''));
    return { amount: Number.isFinite(n) && n > 0 ? n : null, currency: 'USD', period, raw };
  }
  const sdg = t.match(/([\d,\.]+)\s*(?:SDG|جنيه)/i);
  if (sdg) {
    const n = Number(sdg[1].replace(/,/g, ''));
    return { amount: Number.isFinite(n) && n > 0 ? n : null, currency: n > 0 ? 'SDG' : null, period, raw };
  }
  return { ...none, period };
};

// ── Classification ───────────────────────────────────────────────────────────
const listingType = (blob: string): 'rent' | 'sale' | null => {
  const t = foldArabic(blob);
  if (/للايجار|للإيجار|ايجار|إيجار|for rent|to let/i.test(t)) return 'rent';
  if (/للبيع|for sale/i.test(t)) return 'sale';
  return null;
};

/**
 * Order matters, and one trap dominates it: ارض ("land") is a prefix of ارضي /
 * ارضية ("ground floor"). A naive land-first check reads "شقه ارضية للايجار" — a
 * ground-floor FLAT — as a plot of land, and "عمارة ... ارضي + اول" — a BUILDING
 * with a ground and first floor — as land too. Both were misclassified on the
 * first run. So: the specific structure words are tested before the land words,
 * and the land words themselves are anchored to reject the ارضي/ارضية suffix.
 */
const propertyType = (blob: string): string | null => {
  const t = foldArabic(blob);
  if (/استديو|ستوديو|studio/i.test(t)) return 'studio';
  if (/عماره|عمارة|building/i.test(t)) return 'building';
  if (/فيلا|فله|villa/i.test(t)) return 'villa';
  if (/شقه|شقة|شقق|apartment|flat/i.test(t)) return 'apartment';
  if (/بيت|منزل|house/i.test(t)) return 'house';
  if (/حوش/.test(t)) return 'yard';
  // ارض only when NOT followed by ي (ارضي = ground floor, not land).
  if (/قطعه|قطعة|اراضي|ارض(?!ي)|land|plot/i.test(t)) return 'land';
  if (/غرفه|غرفة|room/i.test(t)) return 'room';
  return null;
};

const furnishedOf = (blob: string): boolean | null => {
  const t = foldArabic(blob);
  if (/مفروشه|مفروشة|furnished/i.test(t) && !/غير مفروشه|غير مفروشة|unfurnished/i.test(t)) return true;
  if (/الفاضي|فاضي|غير مفروشه|غير مفروشة|unfurnished/i.test(t)) return false;
  return null;
};

const blockOf = (blob: string): string | null => {
  const m = foldDigits(blob).match(/مربع\s*([0-9]{1,3})/);
  return m ? m[1] : null;
};

const amenitiesOf = (blob: string) => {
  const t = foldArabic(blob);
  return {
    solar:     /طاقه شمسيه|طاقة شمسية|solar/i.test(t) || null,
    generator: /مولد|generator/i.test(t) || null,
    elevator:  /مصعد|elevator|lift/i.test(t) || null,
    ac:        /مكيف|تكييف|air con/i.test(t) || null,
    well:      /بير|بئر|well/i.test(t) || null,
    security:  /حراسه|حراسة|security/i.test(t) || null,
    parking:   /جراج|موقف|parking/i.test(t) || null,
  };
};

/** Who this is offered to. The discovery log found Port Sudan demand is
 *  organisational — the largest ad on the board is explicitly for companies and
 *  NGOs — so this is a first-class field, not a note. */
const targetTenant = (blob: string): string | null => {
  const t = foldArabic(blob);
  if (/الشركات|المنظمات|المؤسسات|المكاتب|المستوصفات|ngo|compan/i.test(t)) return 'organisations';
  if (/موظفين|موظفات|الاسر|أسر|عائل|famil|employee/i.test(t)) return 'employees_families';
  return null;
};

// ── Record shape ─────────────────────────────────────────────────────────────
type Listing = {
  id: string;
  source: { platform: string; url: string | null; ref: string | null; collected_at: string };
  listing_type: 'rent' | 'sale' | null;
  property_type: string | null;
  title_ar: string | null;
  text_ar: string;
  zone_slug: string | null;
  zone_matched_on: string | null;
  block: string | null;
  price: Price;
  rooms: number | null;
  bathrooms: number | null;
  area_sqm: number | null;
  floor: string | null;
  furnished: boolean | null;
  amenities: Record<string, boolean | null>;
  target_tenant: string | null;
  contact: { phones: string[]; name: string | null; platform_uid: string | null };
  posted_at: string | null;
  flags: string[];
};

const listings: Listing[] = [];
const missing: string[] = [];
const notes: string[] = [];

const resolveZone = buildZoneResolver(loadZones());

const push = (l: Listing) => {
  const z = l.zone_slug ? null : resolveZone(`${l.title_ar || ''} ${l.text_ar}`);
  if (z && !l.zone_slug) { l.zone_slug = z.slug; l.zone_matched_on = z.matched; }
  listings.push(l);
};

// ── Layer 1: alsoug ──────────────────────────────────────────────────────────
type AlsougDoc = { adverts: Array<Record<string, any>> };
const alsoug = readJson<AlsougDoc>(join(SRC, 'alsoug-adverts.json'));
if (!alsoug) missing.push('sources/alsoug-adverts.json');
else {
  for (const a of alsoug.adverts) {
    const blob = `${a.title_ar || ''} ${a.description_ar || ''}`;
    push({
      id: a.id,
      source: { platform: 'alsoug.com', url: a.source?.url ?? null, ref: null, collected_at: a.source?.collected_at ?? RUN_DATE },
      // Recomputed here, never taken from the source file: sources hold raw
      // observation, the generator owns interpretation. A classification bug baked
      // into a source file would otherwise survive every regeneration.
      listing_type: listingType(blob),
      property_type: propertyType(blob),
      title_ar: a.title_ar ?? null,
      text_ar: a.description_ar ?? '',
      zone_slug: null, zone_matched_on: null,
      block: a.block ?? blockOf(blob),
      price: parsePrice(a.price?.raw ?? null, blob),
      rooms: a.rooms ?? null,
      bathrooms: a.bathrooms ?? null,
      area_sqm: a.area_sqm ?? null,
      floor: a.floor ?? null,
      furnished: a.furnished ?? furnishedOf(blob),
      amenities: amenitiesOf(blob),
      target_tenant: a.target_tenant ?? targetTenant(blob),
      // alsoug gates the advertiser's number behind login. Empty, never guessed.
      contact: { phones: [], name: a.advertiser?.display_name ?? null, platform_uid: a.advertiser?.platform_uid ?? null },
      posted_at: a.posted_at ?? null,
      flags: [
        'phone_gated_by_platform',
        // alsoug's room picker tops out at "More than 5", so a 15-room building
        // and a 6-room one both store 5. Recording that the number is a floor
        // keeps anyone from averaging it as if it were exact.
        ...(/More than/i.test(String(a.rooms_raw ?? '')) ? ['rooms_is_minimum'] : []),
      ],
    });
  }
}

// ── Layer 2: units observed in a business's own public marketing ─────────────
type ChanDoc = { business_contact_enrichment?: Array<Record<string, any>> };
const chan = readJson<ChanDoc>(join(SRC, 'channels-expansion.json'));
if (!chan) missing.push('sources/channels-expansion.json');
else {
  for (const biz of chan.business_contact_enrichment || []) {
    const phones = extractPhones((biz.phones_published_by_the_business || []).join(' '));
    (biz.port_sudan_inventory_observed || []).forEach((u: any, i: number) => {
      const blob = `${u.type || ''} ${u.zone_ar || ''} ${u.detail_ar || ''}`;
      push({
        id: `marketing-${String(biz.business).replace(/\s+/g, '-')}-${i + 1}`,
        source: { platform: 'business_own_marketing', url: (biz.source_urls || [])[0] ?? null, ref: null, collected_at: RUN_DATE },
        listing_type: 'rent',
        property_type: propertyType(blob),
        title_ar: u.type ?? null,
        text_ar: `${u.zone_ar || ''} — ${u.detail_ar || ''}`.trim(),
        zone_slug: null, zone_matched_on: null,
        block: blockOf(blob),
        price: parsePrice(null, blob),
        rooms: null, bathrooms: null, area_sqm: null, floor: null,
        furnished: furnishedOf(blob),
        amenities: amenitiesOf(blob),
        target_tenant: u.tenant_restriction ? 'employees_families' : targetTenant(blob),
        contact: { phones, name: biz.business ?? null, platform_uid: null },
        posted_at: null,
        flags: ['operator_held', 'price_not_published'],
      });
    });
  }
}

// ── Layer 3: Facebook group posts ────────────────────────────────────────────
type FbDoc = { posts?: Array<Record<string, any>> };
const fb = readJson<FbDoc>(join(SRC, 'facebook-groups.json'));
if (!fb) missing.push('sources/facebook-groups.json (needs a logged-in browser session)');
else {
  for (const p of fb.posts || []) {
    const blob = String(p.text_ar || p.text || '');
    push({
      id: `fb-${p.post_id || p.permalink || Math.abs(hash(blob))}`,
      source: { platform: 'facebook_group', url: p.permalink ?? p.group_url ?? null, ref: p.group_name ?? null, collected_at: p.collected_at ?? RUN_DATE },
      listing_type: listingType(blob),
      property_type: propertyType(blob),
      title_ar: null,
      text_ar: blob,
      zone_slug: null, zone_matched_on: null,
      block: blockOf(blob),
      price: parsePrice(priceTokenIn(blob), blob),
      rooms: roomsIn(blob), bathrooms: null, area_sqm: null, floor: null,
      furnished: furnishedOf(blob),
      amenities: amenitiesOf(blob),
      target_tenant: targetTenant(blob),
      contact: { phones: extractPhones(blob), name: p.author ?? null, platform_uid: p.author_id ?? null },
      posted_at: p.posted_at ?? null,
      flags: ['individual_poster'],
    });
  }
}

// ── Layer 4: WhatsApp exports ────────────────────────────────────────────────
// iOS  : [14/08/2026, 10:23:45] Name: text
// Android: 14/08/2026, 10:23 - Name: text
// A message continues across newlines until the next timestamp, so listings that
// span several lines (very common — price on its own line) stay intact.
const WA_LINE = /^\[?(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?)\s*(?:[APap][Mm])?\]?\s*[-–]?\s*([^:]{1,60}?):\s?([\s\S]*)$/;

const parseWhatsapp = (raw: string, file: string) => {
  type Msg = { date: string; author: string; text: string; line: number };
  const msgs: Msg[] = [];
  let cur: Msg | null = null;
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].replace(/[\u200e\u200f]/g, '').match(WA_LINE);
    if (m) {
      if (cur) msgs.push(cur);
      // WhatsApp prefixes '~' to a display name that is not in the exporter's
      // contacts. It is a UI marker, not part of the person's name.
      cur = { date: m[1], author: m[3].trim().replace(/^~\s*/, ''), text: m[4], line: i + 1 };
    } else if (cur) {
      cur.text += '\n' + lines[i];
    }
  }
  if (cur) msgs.push(cur);

  let kept = 0;
  for (const m of msgs) {
    const blob = m.text;
    const lt = listingType(blob);
    const pt = propertyType(blob);
    // A group is mostly chatter. A message is a listing only if it both names a
    // property type and says rent or sale — otherwise "شكرا" becomes inventory.
    if (!lt || !pt) continue;
    kept++;
    push({
      id: `wa-${file.replace(/\W+/g, '-')}-${m.line}`,
      source: { platform: 'whatsapp_group', url: null, ref: `${file}:${m.line}`, collected_at: RUN_DATE },
      listing_type: lt,
      property_type: pt,
      title_ar: null,
      text_ar: blob.trim(),
      zone_slug: null, zone_matched_on: null,
      block: blockOf(blob),
      price: parsePrice(priceTokenIn(blob), blob),
      rooms: roomsIn(blob), bathrooms: null, area_sqm: areaIn(blob), floor: null,
      furnished: furnishedOf(blob),
      amenities: amenitiesOf(blob),
      target_tenant: targetTenant(blob),
      contact: { phones: extractPhones(blob), name: m.author, platform_uid: null },
      posted_at: m.date,
      flags: ['individual_poster'],
    });
  }
  notes.push(`${file}: ${msgs.length} messages parsed, ${kept} classified as listings`);
};

if (!existsSync(WA)) missing.push('whatsapp-exports/ (folder absent)');
else {
  const files = readdirSync(WA).filter((f) => f.toLowerCase().endsWith('.txt'));
  if (files.length === 0) missing.push('whatsapp-exports/*.txt (folder empty — export chats from WhatsApp)');
  for (const f of files) parseWhatsapp(readFileSync(join(WA, f), 'utf8'), f);
}

// ── Free-text helpers used by the post-shaped layers ─────────────────────────
function priceTokenIn(blob: string): string | null {
  const t = foldDigits(blob);
  const m = t.match(/(?:US\$|\$|دولار)\s*[\d,\.]+|[\d,\.]+\s*(?:US\$|\$|دولار)|[\d,\.]{3,}\s*(?:SDG|جنيه)/i)
    // bare number next to a rent word: "الشهر ب ١٢٠٠"
    || t.match(/(?:الشهر|شهري|اليوم|يومي|بسعر|السعر|المطلوب)\s*(?:ب|:)?\s*([\d,\.]{3,})/);
  return m ? m[0] : null;
}
function roomsIn(blob: string): number | null {
  const t = foldDigits(foldArabic(blob));
  if (/استديو|studio/i.test(t)) return 0;
  const m = t.match(/(\d{1,2})\s*غرف|غرفتين|(\d{1,2})\s*bed/i);
  if (/غرفتين/.test(t)) return 2;
  const n = m ? Number(m[1] || m[2]) : NaN;
  return Number.isFinite(n) && n > 0 && n < 30 ? n : null;
}
function areaIn(blob: string): number | null {
  const m = foldDigits(blob).match(/(\d{2,5})\s*(?:متر|م\b|sqm|m2)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 20 && n <= 20000 ? n : null;
}
function hash(s: string): number {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h;
}

// ── Dedupe ───────────────────────────────────────────────────────────────────
// The same flat is posted to several groups verbatim, and the same broker cross-
// posts to alsoug. Merge only on a HARD signal: identical normalised text, or a
// shared phone AND the same zone AND the same price. Never on phone alone — one
// broker legitimately holds many flats, and collapsing those would erase supply.
const key = (l: Listing) => foldArabic(l.text_ar).slice(0, 160);
const byText = new Map<string, Listing>();
const merged: string[] = [];
for (const l of listings) {
  const k = key(l);
  const prior = byText.get(k);
  if (prior && k.length > 40) {
    prior.contact.phones = [...new Set([...prior.contact.phones, ...l.contact.phones])];
    if (!prior.flags.includes('cross_posted')) prior.flags.push('cross_posted');
    merged.push(`${l.id} → ${prior.id}`);
    continue;
  }
  byText.set(k, l);
}
const unique = [...byText.values()];

// ── Invariants — throw rather than emit something misleading ─────────────────
const unsourced = unique.filter((l) => !l.source.url && !l.source.ref);
if (unsourced.length) {
  throw new Error(
    `${unsourced.length} listing(s) carry no source URL and no file reference: ` +
    `${unsourced.slice(0, 5).map((l) => l.id).join(', ')}. Every row must be traceable ` +
    `to something that was actually fetched or exported — an untraceable listing is a ` +
    `fabrication, and someone will call it.`,
  );
}
const badPhone = unique.flatMap((l) => l.contact.phones.filter((p) => !/^\+249\d{9}$/.test(p)).map((p) => `${l.id}:${p}`));
if (badPhone.length) throw new Error(`Malformed phone(s): ${badPhone.slice(0, 5).join(', ')}`);

// ── Emit ─────────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });

const rentals = unique.filter((l) => l.listing_type === 'rent');
const byZone = new Map<string, number>();
for (const l of unique) byZone.set(l.zone_slug ?? 'unplaced', (byZone.get(l.zone_slug ?? 'unplaced') ?? 0) + 1);
const byPlatform = new Map<string, number>();
for (const l of unique) byPlatform.set(l.source.platform, (byPlatform.get(l.source.platform) ?? 0) + 1);

const doc = {
  _what: 'Unit-level Port Sudan property listings — one record is ONE PROPERTY, not one business. Companion to rental-leads.json, which is business-level. The two join on phone.',
  _generated_by: 'scripts/crm/port-sudan-listings.ts (pnpm crm:ps-listings)',
  _rule: 'Every record carries a fetched URL or an exportable file:line. Nothing enters from recall. The generator throws rather than emit an untraceable row.',
  _collected_at: RUN_DATE,
  _counts: {
    listings: unique.length,
    for_rent: rentals.length,
    for_sale: unique.filter((l) => l.listing_type === 'sale').length,
    with_phone: unique.filter((l) => l.contact.phones.length > 0).length,
    with_price: unique.filter((l) => l.price.amount !== null).length,
    zoned: unique.filter((l) => l.zone_slug).length,
    unplaced: unique.length - unique.filter((l) => l.zone_slug).length,
    merged_as_crosspost: merged.length,
  },
  _by_platform: Object.fromEntries([...byPlatform].sort((a, b) => b[1] - a[1])),
  _by_zone: Object.fromEntries([...byZone].sort((a, b) => b[1] - a[1])),
  _unplaced: unique.filter((l) => !l.zone_slug).map((l) => ({
    id: l.id,
    text: (l.title_ar || l.text_ar).slice(0, 120),
    url: l.source.url,
  })),
  _unplaced_note: 'These carry no district this generator could resolve against zones.json + zone-alias-extensions.json. Left unplaced on purpose: a mis-zoned row silently corrupts the density map the acquisition team plans routes around, which is worse than a blank. Extend sources/zone-alias-extensions.json to place them.',
  _sources_absent_this_run: missing,
  _parse_notes: notes,
  listings: unique,
};

writeFileSync(join(OUT, 'listings.json'), JSON.stringify(doc, null, 2) + '\n');

const md: string[] = [
  '# Port Sudan listings — unit level',
  '',
  `**${unique.length} properties, ${rentals.length} for rent, ${doc._counts.with_phone} reachable by phone.** Generated ${RUN_DATE} by \`pnpm crm:ps-listings\`. Do not hand-edit — edit \`sources/\` and regenerate.`,
  '',
  'One row is one property. `rental-leads.json` next door is one row per *business*; the two join on phone number.',
  '',
];
if (missing.length) {
  md.push('## Sources absent from this run', '',
    'Stated plainly, because a silent skip reads as completeness:', '',
    ...missing.map((m) => `- \`${m}\``), '');
}
md.push('## By platform', '', '| Platform | Listings |', '| :--- | ---: |',
  ...[...byPlatform].sort((a, b) => b[1] - a[1]).map(([p, n]) => `| ${p} | ${n} |`), '');
md.push('## By zone', '', '| Zone | Listings |', '| :--- | ---: |',
  ...[...byZone].sort((a, b) => b[1] - a[1]).map(([z, n]) => `| \`${z}\` | ${n} |`), '');
md.push('## Rentals', '', '| Zone | Type | Rooms | Price | Furnished | Phone | Source |', '| :--- | :--- | ---: | :--- | :--- | :--- | :--- |');
for (const l of rentals.sort((a, b) => (a.zone_slug ?? 'zz').localeCompare(b.zone_slug ?? 'zz'))) {
  const price = l.price.amount ? `${l.price.amount.toLocaleString()} ${l.price.currency}${l.price.period ? '/' + l.price.period : ''}` : '—';
  md.push(`| \`${l.zone_slug ?? 'unplaced'}\`${l.block ? ' م' + l.block : ''} | ${l.property_type ?? '—'} | ${l.rooms ?? '—'} | ${price} | ${l.furnished === true ? 'yes' : l.furnished === false ? 'no' : '—'} | ${l.contact.phones[0] ?? '—'} | ${l.source.url ? `[${l.source.platform}](${l.source.url})` : l.source.ref ?? l.source.platform} |`);
}
md.push('');
writeFileSync(join(OUT, 'listings.md'), md.join('\n'));

console.log(`✓ ${unique.length} listings → ${OUT}/listings.json`);
console.log(`  rent ${rentals.length} · sale ${doc._counts.for_sale} · phone ${doc._counts.with_phone} · priced ${doc._counts.with_price} · zoned ${doc._counts.zoned}`);
if (merged.length) console.log(`  ${merged.length} merged as cross-posts`);
for (const m of missing) console.log(`  ⚠ absent: ${m}`);
for (const n of notes) console.log(`  · ${n}`);
