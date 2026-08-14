/**
 * Port Sudan rental-market discovery — build the supply-acquisition lead dataset.
 *
 * The Airbnb pipeline next door answered a different question. Its README says it
 * plainly: Sudan holds ~120 Airbnb listings in total, the crawl is provably
 * exhaustive, and therefore "coverage is not the constraint on this business;
 * inventory is. Growth has to come from onboarding hosts who are not on Airbnb at
 * all." This script goes after exactly those — the furnished-apartment operators,
 * hotel-apartment blocks, guest houses and brokers who hold Port Sudan inventory
 * and have never touched a booking platform.
 *
 * It is a MARKET RESEARCH artefact. It writes four files into
 * data/market-research/port-sudan/ and touches nothing else. It never writes the
 * mkan database and never creates a CRM record — a discovered business becomes a
 * listing only after a human contacts and verifies it.
 *
 *   pnpm crm:ps-discover                 # normalize + dedupe + score + emit
 *   pnpm crm:ps-discover --refresh-osm   # re-fetch OpenStreetMap first, then emit
 *
 * ── Why the sources are checked in ──────────────────────────────────────────
 * Three layers feed this, and only one of them is re-runnable on demand:
 *
 *   sources/osm-portsudan.json    OpenStreetMap via Overpass — re-fetchable
 *                                 (--refresh-osm). Gives existence + coordinates,
 *                                 almost never a phone.
 *   sources/arabplaces-redsea.json  A public directory mirroring Google Business.
 *                                 Gives phone + rating + review count + coordinates.
 *                                 Snapshotted because the host rate-limits.
 *   sources/web-research.json     Hand-curated search findings, each carrying the
 *                                 URL it came from. Search is not scriptable, so
 *                                 this file IS the reproducibility record — the
 *                                 same reason sudan-places.ts is hand-curated.
 *
 * ── The rule that matters most ──────────────────────────────────────────────
 * Nothing enters this dataset from recall. Every record must carry at least one
 * source URL that was actually fetched, and the script ASSERTS that before it
 * writes. A business that sounds plausible but has no fetched source is a
 * fabrication, and fabrications are the one failure mode that would make this
 * whole artefact worse than useless to the person picking up the phone.
 *
 * ── The foreign-backfill trap ───────────────────────────────────────────────
 * The directory silently pads a thin Sudanese "Red Sea" query with businesses
 * from EGYPT's Red Sea Governorate (Hurghada, El Gouna) served off a different
 * subdomain. 179 such rows were rejected during collection. This is the same trap
 * sudan-places.ts documents in its header — a sibling project once imported 64
 * schools around Addis Ababa from a "Sudan" bounding box and only noticed later,
 * via their +251 phone numbers. Every record here is re-checked against the
 * Port Sudan centroid before it is written.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const flag = (n: string) => process.argv.includes(`--${n}`);

const SRC = 'data/market-research/port-sudan/sources';
const OUT = 'data/market-research/port-sudan';

/** Collection date. Fixed, not `new Date()` — reruns must be byte-identical. */
const RUN_DATE = '2026-08-14';

// ── Geography ────────────────────────────────────────────────────────────────
// Port Sudan centroid + radius, taken from the gazetteer (sudan-places.ts
// PORT_SUDAN) so this file cannot drift from the rest of the pipeline.
const PS = { lat: 19.6158, lng: 37.2164, radiusKm: 25 };

const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ── Name normalization ───────────────────────────────────────────────────────
// The same business shows up as "Bohein Hotel" (OSM), "Bohaen Hotel" (directory)
// and "فندق البهين". Dedup has to survive Arabic/English, the definite article,
// and the fact that every one of these names is prefixed by its own category.
const NOISE = [
  'hotel', 'hotels', 'apartments', 'apartment', 'suites', 'suite', 'furnished',
  'resort', 'guest', 'house', 'guesthouse', 'lodge', 'the', 'port', 'sudan',
  'portsudan', 'for', 'and',
  'فندق', 'فنادق', 'شقق', 'شقه', 'شقة', 'مفروشة', 'مفروشه', 'الفندقية', 'الفندقيه',
  'فندقية', 'منتجع', 'مجمع', 'استراحة', 'سياحي', 'السياحي', 'نزل', 'بورتسودان',
  'بورت', 'سودان', 'للشقق', 'أجنحة', 'اجنحة', 'شاليه',
];

const normName = (raw: string): string => {
  let s = (raw || '').toLowerCase();
  // Arabic orthography folding: alef/ya/ta-marbuta variants + diacritics.
  s = s.replace(/[ً-ْـ]/g, '')
       .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
       .replace(/^ال/, '');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  const kept = s.split(' ')
    .map((w) => w.replace(/^(al|el)/, ''))
    .map((w) => w.replace(/^ال/, ''))
    .filter((w) => w.length > 1 && !NOISE.includes(w));
  return kept.sort().join(' ') || s;
};

/** Transliteration-tolerant similarity: bohein ≈ bohaen, okere ≈ okier. */
const fold = (s: string) =>
  s.replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1');

/**
 * Deliberately strict. An earlier, looser version merged "Palace Palace Hotel",
 * "Baasher Palace Hotel" and "Nour al-Yemen" into a single record — three
 * genuinely different hotels — because they share one token and sit on the same
 * downtown block. In a city where every hotel is on the same two streets, a
 * single shared word means nothing.
 */
const similar = (a: string, b: string): boolean => {
  const [x, y] = [normName(a), normName(b)];
  if (!x || !y) return false;
  if (x === y) return true;
  if (fold(x) === fold(y) && fold(x).length >= 4) return true;   // bohein ≈ bohaen
  const tx = new Set(x.split(' ')), ty = new Set(y.split(' '));
  const small = Math.min(tx.size, ty.size);
  if (small < 2) return false;                                    // one word is never enough
  const inter = [...tx].filter((t) => ty.has(t));
  return inter.length === small;
};

const digits = (p: string) => (p || '').replace(/\D/g, '').replace(/^0+/, '');
const domain = (u: string | null | undefined): string | null => {
  if (!u) return null;
  const m = String(u).replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  return m && m.includes('.') ? m.toLowerCase() : null;
};

// ── Classification ───────────────────────────────────────────────────────────
type Category =
  | 'furnished_apartment' | 'hotel_apartment' | 'hotel' | 'guest_house'
  | 'resort' | 'chalet' | 'real_estate_office' | 'unknown';

/**
 * Places that are mapped but are NOT rental-supply leads: NGO/ministry staff
 * residences, police housing, a public-housing gate, the corniche, and OSM nodes
 * whose whole name is the word "house". Kept in the dataset (so a later pass does
 * not "rediscover" them as new) but marked out_of_scope and never scored.
 */
const OUT_OF_SCOPE = [
  'unicef', 'msf', 'وزارة', 'الشرطة', 'police', 'الاسكان الشعبي', 'كورنيش',
];
const outOfScopeReason = (name: string): string | null => {
  const n = name.toLowerCase();
  if (/unicef|msf/.test(n)) return 'international-organisation staff residence';
  if (n.includes('وزارة')) return 'government ministry rest house';
  if (/الشرطة|police/.test(n)) return 'police service housing';
  if (n.includes('الاسكان الشعبي')) return 'public-housing entrance — a place marker, not a business';
  if (n.includes('كورنيش')) return 'the corniche — a public place, not a business';
  if (['منزل', 'استراحة', 'resort'].includes(name.trim())) return 'name is a bare generic word — nothing identifies a business';
  return null;
};
const isOutOfScope = (name: string): boolean => outOfScopeReason(name) !== null;

const categorize = (name: string, hint?: string | null): Category => {
  const n = name.toLowerCase();
  if (hint === 'estate_agent' || /عقار|real ?estate|سمسار/.test(n)) return 'real_estate_office';
  if (/شقق (مفروشة|مفروشه)|furnished/.test(n)) return 'furnished_apartment';
  if (/الفندقية|الفندقيه|فندقية|hotel (suites|apartments)|suites/.test(n)) return 'hotel_apartment';
  if (/منتجع|resort/.test(n) || hint === 'resort') return 'resort';
  if (/شاليه|chalet/.test(n) || hint === 'chalet') return 'chalet';
  if (/فندق|hotel/.test(n) || hint === 'hotel' || hint === 'motel') return 'hotel';
  if (hint === 'guest_house' || hint === 'hostel' || /guest ?house|نزل|استراحة/.test(n)) return 'guest_house';
  if (hint === 'apartment' || /شقق|apartment/.test(n)) return 'furnished_apartment';
  return 'unknown';
};

/** Categories that by their nature hold more than one lettable unit. */
const MULTI_UNIT: Category[] = ['furnished_apartment', 'hotel_apartment', 'hotel', 'resort'];
/** The vertical Mkan actually wants: self-managed, furnished, short-to-mid stay. */
const MKAN_CORE: Category[] = ['furnished_apartment', 'hotel_apartment'];

const CHAINS = ['mercure', 'accor', 'coral', 'hilton', 'marriott'];

// ── Record shape ─────────────────────────────────────────────────────────────
interface Lead {
  id: string;
  name: { primary: string; arabic: string | null; english: string | null; aliases: string[] };
  entity_type: 'business' | 'institutional';
  category: Category;
  rental_type: 'short_term' | 'long_term' | 'both' | 'unknown';
  location: { address: string | null; area: string | null; latitude: number | null; longitude: number | null; distance_from_city_centre_km: number | null };
  contact: { phone: string[]; website: string | null; website_status: string | null; email: string | null; social: { facebook: string | null; instagram: string | null; tiktok: string | null; other: string[] } };
  google_maps: { url: string | null; place_id: string | null; rating: number | null; review_count: number | null };
  market: { estimated_inventory: number | null; likely_multiple_units: boolean; likely_active: boolean | null; mkan_relevance: 'high' | 'medium' | 'low' | 'none'; lead_priority: 'high' | 'medium' | 'low' | 'review_required' | 'out_of_scope'; score: number };
  crm: { lead_status: 'new'; source: string; assigned_to: null; notes: string };
  discovery: { queries: string[]; sources: string[]; source_layers: string[]; first_seen: string; last_verified: string };
  out_of_scope_reason: string | null;
  possible_duplicate_of: string[];
  review_reasons: string[];
}

// ── Load ─────────────────────────────────────────────────────────────────────
const read = <T,>(p: string): T => JSON.parse(readFileSync(p, 'utf8'));

async function refreshOsm(): Promise<void> {
  const BBOX = '19.40,37.00,19.85,37.40';
  const q = `[out:json][timeout:90];
(
  nwr["tourism"~"^(hotel|guest_house|apartment|apartments|hostel|motel|chalet|resort|camp_site)$"](${BBOX});
  nwr["office"~"^(estate_agent|property_management)$"](${BBOX});
  nwr["shop"~"^(estate_agent|rental)$"](${BBOX});
  nwr["building"="hotel"](${BBOX});
  nwr["name"~"شقق|فندق|استراحة|منتجع|عقار|سكن|نزل|أجنحة|شقه"](${BBOX});
  nwr["name"~"hotel|apartment|suites|resort|guest ?house|lodge|real ?estate|rental",i](${BBOX});
);
out center tags;`;
  console.log('   fetching Overpass…');
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: new URLSearchParams({ data: q }),
    headers: { 'User-Agent': 'mkan-market-research/1.0' },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json() as { elements: Array<Record<string, any>> };
  const elements = data.elements
    .map((e) => {
      const t = e.tags ?? {};
      const name = t.name || t['name:ar'] || t['name:en'];
      if (!name) return null;
      return {
        osm: `${e.type}/${e.id}`, name,
        name_ar: t['name:ar'] ?? null, name_en: t['name:en'] ?? null, alt_name: t.alt_name ?? null,
        lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon,
        tourism: t.tourism ?? null, office: t.office ?? null, shop: t.shop ?? null,
        building: t.building ?? null,
        phone: t.phone ?? t['contact:phone'] ?? null,
        website: t.website ?? t['contact:website'] ?? null,
        email: t.email ?? t['contact:email'] ?? null,
        facebook: t['contact:facebook'] ?? null,
        addr: [t['addr:street'], t['addr:city'], t['addr:suburb']].filter(Boolean).join(' ') || null,
        stars: t.stars ?? null, rooms: t.rooms ?? null, operator: t.operator ?? null,
      };
    })
    .filter(Boolean);
  const p = join(SRC, 'osm-portsudan.json');
  const prev = read<Record<string, unknown>>(p);
  writeFileSync(p, JSON.stringify({ ...prev, _fetched_at: RUN_DATE, _named_kept: elements.length, elements }, null, 1) + '\n');
  console.log(`   OSM refreshed → ${elements.length} named POIs`);
}

// ── Normalize each layer into candidate leads ────────────────────────────────
interface Cand {
  name: string; ar: string | null; en: string | null; aliases: string[];
  cat: Category; addr: string | null; area: string | null;
  lat: number | null; lng: number | null;
  phones: string[]; website: string | null; websiteStatus: string | null;
  email: string | null; fb: string | null; ig: string | null; tt: string | null; other: string[];
  gmUrl: string | null; gmPlaceId: string | null; rating: number | null; reviews: number | null;
  sources: string[]; layer: string; notes: string[]; queries: string[];
}

const build = (): Cand[] => {
  const out: Cand[] = [];

  // Layer A — OpenStreetMap
  const osm = read<{ elements: any[] }>(join(SRC, 'osm-portsudan.json'));
  for (const e of osm.elements) {
    const hint = e.tourism ?? e.office ?? e.shop ?? null;
    out.push({
      name: e.name, ar: e.name_ar, en: e.name_en, aliases: [e.alt_name].filter(Boolean),
      cat: categorize(e.name, hint), addr: e.addr, area: null,
      lat: e.lat ?? null, lng: e.lng ?? null,
      phones: [e.phone].filter(Boolean), website: e.website ?? null, websiteStatus: null,
      email: e.email ?? null, fb: e.facebook ?? null, ig: null, tt: null, other: [],
      gmUrl: null, gmPlaceId: null, rating: null, reviews: null,
      sources: [`https://www.openstreetmap.org/${e.osm}`],
      layer: 'openstreetmap',
      notes: e.operator ? [`OSM operator tag: ${e.operator}`] : [],
      queries: ['overpass: tourism/office/shop/name sweep of the Port Sudan bbox'],
    });
  }

  // Layer B — public Google-Business directory
  const ap = read<{ places: any[] }>(join(SRC, 'arabplaces-redsea.json'));
  for (const p of ap.places) {
    out.push({
      name: p.name, ar: /[؀-ۿ]/.test(p.name) ? p.name : p.alt_name,
      en: /[؀-ۿ]/.test(p.name) ? null : p.name,
      aliases: [p.alt_name].filter(Boolean),
      cat: categorize(`${p.name} ${p.alt_name ?? ''}`, (p.categories?.[0] ?? '').toLowerCase()),
      addr: p.address, area: null, lat: p.lat, lng: p.lng,
      phones: [p.phone].filter(Boolean),
      website: p.website_listed ?? null, websiteStatus: null,
      email: p.emails?.[0] ?? null, fb: null, ig: null, tt: null, other: [],
      gmUrl: null, gmPlaceId: null, rating: p.rating, reviews: p.review_count,
      sources: [p.url], layer: 'directory(google-business)',
      notes: [], queries: ['directory: /al-bahr-al-ahmar/hotel + /hostel category index'],
    });
  }

  // Layer C — curated web research
  const web = read<{ businesses: any[] }>(join(SRC, 'web-research.json'));
  for (const b of web.businesses) {
    const other = [b.tripadvisor, b.trip_com, b.youtube].filter(Boolean);
    out.push({
      name: b.name_primary, ar: b.name_ar ?? (/[؀-ۿ]/.test(b.name_primary) ? b.name_primary : null),
      en: b.name_en ?? (/[؀-ۿ]/.test(b.name_primary) ? null : b.name_primary),
      aliases: b.aliases ?? [],
      cat: (b.category as Category) ?? categorize(b.name_primary),
      addr: null, area: b.area ?? null, lat: b.lat ?? null, lng: b.lng ?? null,
      phones: b.phone ?? [], website: b.website ?? null, websiteStatus: b.website_status ?? null,
      email: null, fb: b.facebook ?? null, ig: b.instagram ?? null, tt: b.tiktok ?? null, other,
      gmUrl: null, gmPlaceId: b.google_place_id ?? null,
      rating: b.tripadvisor_rating ?? null, reviews: b.tripadvisor_reviews ?? null,
      sources: b.sources ?? [], layer: 'web-research',
      notes: b.note ? [b.note] : [],
      queries: ['web search (AR+EN), see discovery-log.md'],
    });
  }

  return out;
};

// ── Dedup ────────────────────────────────────────────────────────────────────
// Merging is allowed on a HARD signal only:
//   · the same phone number
//   · the same website domain
//   · a hand-verified alias bridge (sources/web-research.json → alias_bridges),
//     which is how cross-script pairs like "فندق اوكير" ↔ "Okere Hotel" are
//     resolved — no algorithm can match those, and guessing would be a lie
//   · near-identical coordinates PLUS a strict name match
//
// Everything else that merely looks close — two hotels 40 m apart with different
// names — is SOFT-LINKED, not merged: both records survive, each points at the
// other, and both are flagged review_required. That is what the brief asks for
// ("If uncertain, do NOT merge automatically"), and it is the same
// fill-empty-never-guess posture sync-contacts-to-twenty.ts takes.

/** normalized alias → canonical name, from the hand-verified bridge list. */
const BRIDGE: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const web = read<{ alias_bridges?: Array<{ canonical: string; aliases: string[] }> }>(join(SRC, 'web-research.json'));
  for (const b of web.alias_bridges ?? []) {
    for (const n of [b.canonical, ...b.aliases]) m.set(normName(n), b.canonical);
  }
  return m;
})();

const bridgeOf = (c: Cand): string | null => {
  for (const n of [c.name, c.ar, c.en, ...c.aliases]) {
    if (!n) continue;
    const hit = BRIDGE.get(normName(n));
    if (hit) return hit;
  }
  return null;
};

interface Group {
  members: Cand[]; reasons: Set<string>; review: Set<string>;
  /** name → true when a hard signal already proves they are DIFFERENT businesses. */
  near: Map<string, boolean>;
}

const dedupe = (cands: Cand[]): Group[] => {
  const groups: Group[] = [];

  for (const c of cands) {
    let hit: Group | null = null;
    let why = '';
    const cb = bridgeOf(c);

    for (const g of groups) {
      for (const m of g.members) {
        if (c.phones.some((p) => m.phones.some((q) => digits(p) && digits(p) === digits(q)))) {
          hit = g; why = 'same phone number'; break;
        }
        if (domain(c.website) && domain(c.website) === domain(m.website)) {
          hit = g; why = 'same website domain'; break;
        }
        const mb = bridgeOf(m);
        if (cb && mb && cb === mb) { hit = g; why = `verified alias bridge → "${cb}"`; break; }

        const near = c.lat != null && m.lat != null && haversineKm(c.lat, c.lng!, m.lat, m.lng!) < 0.2;
        const nameMatch = similar(c.name, m.name) ||
          [...c.aliases, c.ar, c.en].filter(Boolean).some((a) => similar(a as string, m.name)) ||
          [...m.aliases, m.ar, m.en].filter(Boolean).some((a) => similar(a as string, c.name));
        if (near && nameMatch) { hit = g; why = 'coordinates within 200 m + matching name'; break; }
      }
      if (hit) break;
    }

    if (hit) { hit.members.push(c); hit.reasons.add(why); }
    else groups.push({ members: [c], reasons: new Set(), review: new Set(), near: new Map() });
  }

  // Soft links: distinct groups sitting on top of each other. Recorded, never merged.
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i].members.find((m) => m.lat != null);
      const b = groups[j].members.find((m) => m.lat != null);
      if (!a || !b) continue;
      const d = haversineKm(a.lat!, a.lng!, b.lat!, b.lng!);
      if (d >= 0.06) continue;   // ~60 m — same building or next door
      // Two neighbours that each publish a DIFFERENT phone number are provably
      // two businesses. Record the adjacency, but do not waste a human on it.
      const pi = new Set(groups[i].members.flatMap((m) => m.phones).map(digits).filter(Boolean));
      const pj = new Set(groups[j].members.flatMap((m) => m.phones).map(digits).filter(Boolean));
      const provenDistinct = pi.size > 0 && pj.size > 0 && ![...pi].some((x) => pj.has(x));
      groups[i].near.set(groups[j].members[0].name, provenDistinct);
      groups[j].near.set(groups[i].members[0].name, provenDistinct);
    }
  }
  return groups;
};

// ── Score ────────────────────────────────────────────────────────────────────
const scoreOf = (l: Omit<Lead, 'market'> & { market: Partial<Lead['market']> }, c: { layers: Set<string> }) => {
  let s = 0;
  const why: string[] = [];
  if (l.contact.phone.length) { s += 25; why.push('reachable by phone'); }
  if (l.location.latitude != null) { s += 15; why.push('mapped'); }
  const extra = Math.min(c.layers.size - 1, 2) * 10;
  if (extra) { s += extra; why.push(`corroborated across ${c.layers.size} independent sources`); }
  const rv = l.google_maps.review_count ?? 0;
  if (rv >= 20) { s += 20; why.push(`${rv} public reviews`); }
  else if (rv >= 10) { s += 15; why.push(`${rv} public reviews`); }
  else if (rv >= 5) { s += 10; why.push(`${rv} public reviews`); }
  else if (rv >= 1) { s += 5; why.push(`${rv} public review(s)`); }
  if (MULTI_UNIT.includes(l.category)) { s += 15; why.push('multi-unit by category'); }
  if (MKAN_CORE.includes(l.category)) { s += 10; why.push('furnished/serviced apartments — the exact Mkan vertical'); }
  if (CHAINS.some((k) => l.name.primary.toLowerCase().includes(k))) { s -= 20; why.push('international chain — unlikely to self-serve on Mkan'); }
  return { score: Math.max(0, Math.min(100, s)), why };
};

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (flag('refresh-osm')) await refreshOsm();

  const cands = build();
  console.log(`\n📥 candidates: ${cands.length}`);
  for (const layer of new Set(cands.map((c) => c.layer))) {
    console.log(`     ${layer.padEnd(28)} ${cands.filter((c) => c.layer === layer).length}`);
  }

  const groups = dedupe(cands);
  console.log(`🔗 after dedup: ${groups.length} unique businesses (${cands.length - groups.length} merged away)`);

  const leads: Lead[] = groups.map((g) => {
    // The richest member wins the canonical name: prefer one with a phone, then
    // one with coordinates, then the longest name (usually the fullest form).
    const rank = (c: Cand) => (c.phones.length ? 4 : 0) + (c.lat != null ? 2 : 0) + (c.gmPlaceId ? 1 : 0);
    const richest = [...g.members].sort((a, b) => rank(b) - rank(a) || b.name.length - a.name.length)[0];
    // A hand-verified canonical beats whichever source happened to carry the most
    // fields — OSM's terse "Al-Sultan" should not outrank "السلطان للشقق الفندقية".
    const canonical = g.members.map(bridgeOf).find(Boolean) ?? null;
    const best = canonical ? { ...richest, name: canonical } : richest;

    const all = g.members;
    const names = new Set<string>();
    for (const m of all) { names.add(m.name); m.aliases.forEach((a) => names.add(a)); if (m.ar) names.add(m.ar); if (m.en) names.add(m.en); }
    names.delete(best.name);

    const phones = [...new Set(all.flatMap((m) => m.phones).filter(Boolean))];
    const sources = [...new Set(all.flatMap((m) => m.sources))];
    const layers = new Set(all.map((m) => m.layer));
    const withCoord = all.find((m) => m.lat != null);
    const rating = all.map((m) => m.rating).find((r) => r != null) ?? null;
    const reviews = Math.max(0, ...all.map((m) => m.reviews ?? 0)) || null;
    const cat = all.map((m) => m.cat).find((c) => c !== 'unknown') ?? 'unknown';

    const dist = withCoord?.lat != null
      ? Math.round(haversineKm(PS.lat, PS.lng, withCoord.lat, withCoord.lng!) * 10) / 10
      : null;

    const review = new Set(g.review);
    const ambiguous = [...g.near].filter(([, distinct]) => !distinct).map(([n]) => n);
    if (ambiguous.length) {
      review.add(`sits within ~60 m of ${ambiguous.join(', ')} with no distinguishing phone number — confirm these are separate businesses, not one under two names`);
    }
    if (dist != null && dist > PS.radiusKm) {
      review.add(`${dist} km from the Port Sudan centroid — outside the city, classify as Red Sea State`);
    }

    const oosReason = all.map((m) => outOfScopeReason(m.name)).find(Boolean) ?? null;
    const institutional = oosReason !== null;

    const partial: any = {
      id: '', // filled below
      name: {
        primary: best.name,
        arabic: all.map((m) => m.ar).find(Boolean) ?? null,
        english: all.map((m) => m.en).find(Boolean) ?? null,
        aliases: [...names],
      },
      entity_type: institutional ? 'institutional' : 'business',
      category: cat,
      rental_type: 'unknown',
      location: {
        address: all.map((m) => m.addr).find(Boolean) ?? null,
        area: all.map((m) => m.area).find(Boolean) ?? null,
        latitude: withCoord?.lat ?? null,
        longitude: withCoord?.lng ?? null,
        distance_from_city_centre_km: dist,
      },
      contact: {
        phone: phones,
        website: all.map((m) => m.website).find(Boolean) ?? null,
        website_status: all.map((m) => m.websiteStatus).find(Boolean) ?? null,
        email: all.map((m) => m.email).find(Boolean) ?? null,
        social: {
          facebook: all.map((m) => m.fb).find(Boolean) ?? null,
          instagram: all.map((m) => m.ig).find(Boolean) ?? null,
          tiktok: all.map((m) => m.tt).find(Boolean) ?? null,
          other: [...new Set(all.flatMap((m) => m.other))],
        },
      },
      google_maps: {
        url: null,           // never constructed — see discovery-log.md §"Google Maps"
        place_id: all.map((m) => m.gmPlaceId).find(Boolean) ?? null,
        rating, review_count: reviews,
      },
      crm: {
        lead_status: 'new',
        source: [...layers].join('+'),
        assigned_to: null,
        notes: [...all.flatMap((m) => m.notes), ...(g.reasons.size ? [`Merged ${all.length} source records on: ${[...g.reasons].join('; ')}.`] : [])].join(' | '),
      },
      discovery: {
        queries: [...new Set(all.flatMap((m) => m.queries))],
        sources, source_layers: [...layers],
        first_seen: RUN_DATE, last_verified: RUN_DATE,
      },
      out_of_scope_reason: oosReason,
      possible_duplicate_of: [...g.near].map(([n, distinct]) => distinct ? `${n} (adjacent; different phone — confirmed distinct)` : `${n} (adjacent; unconfirmed)`),
      review_reasons: [...review],
      market: {},
    };

    const { score, why } = scoreOf(partial, { layers });
    const relevance = institutional ? 'none'
      : MKAN_CORE.includes(cat) ? 'high'
      : cat === 'guest_house' || cat === 'hotel' || cat === 'chalet' ? 'medium'
      : cat === 'real_estate_office' ? 'medium'
      : cat === 'resort' ? 'low' : 'low';

    const priority: Lead['market']['lead_priority'] =
      institutional ? 'out_of_scope'
      : review.size ? 'review_required'
      : score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low';

    partial.market = {
      estimated_inventory: null,                 // never invented — see §5 of the brief
      likely_multiple_units: MULTI_UNIT.includes(cat),
      likely_active: reviews ? true : null,
      mkan_relevance: relevance,
      lead_priority: priority,
      score,
      score_reasons: why,
    };

    const slugSource = (partial.name.english ?? partial.name.primary);
    partial.id = 'ps-' + slugSource.toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 44)
      .normalize('NFKD');
    return partial as Lead;
  });

  // Hand-flagged ambiguities the matcher cannot settle on its own (cross-script
  // brand names too far apart to merge on coordinates). Recorded on both sides.
  const suspected = read<{ suspected_duplicates?: Array<{ a: string; b: string; why: string }> }>(
    join(SRC, 'web-research.json')).suspected_duplicates ?? [];
  for (const s2 of suspected) {
    for (const [x, y] of [[s2.a, s2.b], [s2.b, s2.a]]) {
      const l = leads.find((z) => z.name.primary === x || z.name.aliases.includes(x));
      if (!l) continue;
      l.possible_duplicate_of.push(`${y} (hand-flagged)`);
      l.review_reasons.push(`possible duplicate of "${y}" — ${s2.why}`);
      if (l.market.lead_priority !== 'out_of_scope') l.market.lead_priority = 'review_required';
    }
  }

  // stable ids even if two slugs collide
  const seen = new Map<string, number>();
  for (const l of leads) {
    const n = (seen.get(l.id) ?? 0) + 1;
    seen.set(l.id, n);
    if (n > 1) l.id = `${l.id}-${n}`;
  }

  // ── The invariant ──────────────────────────────────────────────────────────
  const unsourced = leads.filter((l) => l.discovery.sources.length === 0);
  if (unsourced.length) {
    throw new Error(`${unsourced.length} lead(s) carry no source URL: ${unsourced.map((l) => l.name.primary).join(', ')}`);
  }
  const foreign = leads.filter((l) => l.location.latitude != null &&
    haversineKm(PS.lat, PS.lng, l.location.latitude, l.location.longitude!) > 150);
  if (foreign.length) {
    throw new Error(`${foreign.length} lead(s) sit >150 km away — foreign backfill leaked in: ${foreign.map((l) => l.name.primary).join(', ')}`);
  }

  leads.sort((a, b) => b.market.score - a.market.score || a.name.primary.localeCompare(b.name.primary));

  const web = read<any>(join(SRC, 'web-research.json'));
  const biz = leads.filter((l) => l.entity_type === 'business');
  const payload = {
    _what: 'Port Sudan rental-market lead dataset — market research, NOT mkan production data.',
    _rule: 'Every record carries at least one fetched source URL. Unknown fields are null, never guessed. No estimated_inventory is invented.',
    _workflow: 'public sources → THIS dataset → Twenty CRM → contact → verify inventory → onboard → real mkan listings',
    _generated_by: 'pnpm crm:ps-discover (scripts/crm/port-sudan-discover.ts)',
    _collected_at: RUN_DATE,
    _city: { name_en: 'Port Sudan', name_ar: 'بورتسودان', ...PS },
    _counts: {
      total: leads.length,
      business: biz.length,
      institutional_out_of_scope: leads.filter((l) => l.entity_type === 'institutional').length,
      by_priority: Object.fromEntries(['high', 'medium', 'low', 'review_required', 'out_of_scope']
        .map((p) => [p, leads.filter((l) => l.market.lead_priority === p).length])),
      by_category_business_only: Object.fromEntries([...new Set(biz.map((l) => l.category))]
        .map((c) => [c, biz.filter((l) => l.category === c).length])),
      // Coverage is reported over BUSINESSES only — mixing in the out-of-scope
      // places would flatter the contactability numbers a salesperson relies on.
      with_phone: biz.filter((l) => l.contact.phone.length).length,
      with_coordinates: biz.filter((l) => l.location.latitude != null).length,
      with_google_rating: biz.filter((l) => l.google_maps.rating != null).length,
      with_website: biz.filter((l) => l.contact.website).length,
      with_social: biz.filter((l) => l.contact.social.facebook || l.contact.social.instagram || l.contact.social.tiktok).length,
    },
    channels: web.channels,
    areas_observed: web.areas_observed,
    negative_results: web.negative_results,
    leads,
  };

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'rental-leads.json'), JSON.stringify(payload, null, 1) + '\n');
  writeFileSync(join(OUT, 'rental-leads.md'), report(payload));

  console.log(`\n✅ ${leads.length} unique businesses → ${OUT}/rental-leads.json`);
  console.table(payload._counts.by_priority);
}

// ── Human report ─────────────────────────────────────────────────────────────
const esc = (s: string | null) => (s ?? '—').replace(/\|/g, '\\|');
/** Addresses arrive as "…, Port Sudan, Sudan" — the country adds nothing to a table. */
const place = (l: Lead) => {
  const a = l.location.area ?? l.location.address;
  if (!a) return '—';
  const t = a.replace(/[،,]\s*Sudan\s*$/i, '').replace(/[،,\s]+$/, '').trim();
  return esc(t === 'Port Sudan' ? 'Port Sudan (no finer address published)' : t);
};
const phoneCell = (l: Lead) => (l.contact.phone.length ? l.contact.phone.join(', ') : '—');

function report(p: any): string {
  const L: Lead[] = p.leads;
  const biz = L.filter((l) => l.entity_type === 'business');
  const byCat = (c: string) => biz.filter((l) => l.category === c);

  const table = (rows: Lead[]) => [
    '| Business | Category | Area | Phone | Google | Priority |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((l) => `| **${esc(l.name.primary)}** | ${l.category.replace(/_/g, ' ')} | ${place(l)} | ${phoneCell(l)} | ${l.google_maps.rating ? `${l.google_maps.rating}★ (${l.google_maps.review_count})` : '—'} | ${l.market.lead_priority} |`),
  ].join('\n');

  const top = biz.filter((l) => l.market.lead_priority !== 'out_of_scope')
    .sort((a, b) => b.market.score - a.market.score).slice(0, 20);

  return `# Port Sudan rental market — lead dataset

> Market research for Mkan supply acquisition. Collected **${p._collected_at}** from public
> sources. **This is not mkan production data** — a business here becomes a listing only
> after the team contacts it and verifies its inventory.
>
> Machine-readable canonical copy: [\`rental-leads.json\`](./rental-leads.json) ·
> method and coverage: [\`discovery-log.md\`](./discovery-log.md) ·
> CRM field mapping: [\`twenty-crm-mapping.md\`](./twenty-crm-mapping.md)

## Totals

| | |
| --- | --- |
| Unique businesses | **${p._counts.business}** |
| Mapped places kept but out of scope (NGO/ministry/police housing, unnamed generics) | ${p._counts.institutional_out_of_scope} |
| With a public phone number | ${p._counts.with_phone} |
| With coordinates | ${p._counts.with_coordinates} |
| With a Google rating | ${p._counts.with_google_rating} |
| With a website | ${p._counts.with_website} |
| With social presence | ${p._counts.with_social} |

**By priority** — ${Object.entries(p._counts.by_priority).map(([k, v]) => `${k}: ${v}`).join(' · ')}

**By category** — ${Object.entries(p._counts.by_category_business_only).map(([k, v]) => `${String(k).replace(/_/g, ' ')}: ${v}`).join(' · ')}

## Top ${top.length} acquisition targets

Ranked by the transparent rubric in \`discovery-log.md\` — reachability, corroboration,
public review volume, and how squarely the business sits in Mkan's vertical.

| # | Business | Category | Area | Phone | Score | Why it ranks here |
| --- | --- | --- | --- | --- | --- | --- |
${top.map((l, i) => `| ${i + 1} | **${esc(l.name.primary)}** | ${l.category.replace(/_/g, ' ')} | ${place(l)} | ${phoneCell(l)} | ${l.market.score} | ${((l.market as any).score_reasons ?? []).join('; ')} |`).join('\n')}

## Furnished & hotel apartments — the core vertical

These are the businesses whose inventory maps most directly onto an Mkan listing.

${table([...byCat('furnished_apartment'), ...byCat('hotel_apartment')].sort((a, b) => b.market.score - a.market.score))}

## Hotels

${table(byCat('hotel').sort((a, b) => b.market.score - a.market.score))}

## Guest houses, chalets & resorts

${table([...byCat('guest_house'), ...byCat('chalet'), ...byCat('resort')].sort((a, b) => b.market.score - a.market.score))}

## Brokers & real-estate offices

${byCat('real_estate_office').length ? table(byCat('real_estate_office')) : '_None confirmed as a Port Sudan office. See `discovery-log.md` — the brokerage layer here trades through Facebook groups, TikTok and classifieds rather than through mapped storefronts, which is itself the finding._'}

## Other / uncategorised

${byCat('unknown').length ? table(byCat('unknown')) : '_None._'}

## Needs manual verification

${(() => {
  const r = L.filter((l) => l.market.lead_priority === 'review_required');
  return r.length ? [
    '| Business | Why |', '| --- | --- |',
    ...r.map((l) => `| **${esc(l.name.primary)}** | ${l.review_reasons.join('; ')} |`),
  ].join('\n') : '_None._';
})()}

## Kept but out of scope

Mapped accommodation that is **not** rental supply — recorded so a later pass does not
rediscover them as new leads.

${(() => {
  const r = L.filter((l) => l.entity_type === 'institutional');
  return r.length ? [
    '| Place | Why it is not a lead |', '| --- | --- |',
    ...r.map((l) => `| ${esc(l.name.primary)} | ${esc(l.out_of_scope_reason)} |`),
  ].join('\n') : '_None._';
})()}

## Where the supply actually trades

Port Sudan's furnished-rental market runs through channels, not storefronts. These are
where inventory is advertised day to day — the highest-yield place to find hosts who will
never appear in any directory:

${p.channels.map((c: any) => `- **${c.name}** — ${c.kind.replace(/_/g, ' ')} · ${c.url}${c.note ? ` _(${c.note})_` : ''}`).join('\n')}

## Areas named by the market

${p.areas_observed.map((a: any) => `- **${a.ar}** (${a.en})${a.note ? ` — ${a.note}` : ''}`).join('\n')}

## Negative results worth keeping

${p.negative_results.map((n: any) => `- ${n.finding}`).join('\n')}

---

_Generated by \`pnpm crm:ps-discover\`. Do not hand-edit — edit the files in \`sources/\` and regenerate._
`;
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1); });
