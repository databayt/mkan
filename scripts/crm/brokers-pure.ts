/**
 * The broker directory's pure core: who is one person, what they cover.
 *
 * `brokers.ts` gathers every place a Kigali broker, agency or landlord shows
 * up — the ListingBroker users the TikTok mirror made, Twenty hosts that look
 * like agencies, the brokerName on TikTok posts, the TikTok seed accounts,
 * Facebook posters and the Maps agencies — as `Candidate`s. The same broker
 * appears under several of them (a handle here, a phone there), so they are
 * merged on shared keys: a normalised +250 phone first, then the TikTok
 * handle, then the website domain, then a few bookkeeping ids. Coverage
 * (districts, neighbourhoods, stays, price band) is read from the homes each
 * merged broker posted, because that is the only honest evidence of where
 * they work.
 *
 * Nothing here reads a database or the network, so it is unit-tested in
 * `tests/crm/brokers.test.ts`.
 */
import { normalizePhone } from '../../src/lib/phone';
import { districtForPlace, isInKigali, nearestDistrict } from '../../src/lib/geo/rwanda-places';
import { NEIGHBOURHOODS, inNeighbourhood } from '../../src/components/agent/areas';
import { KIGALI_ZONE_BY_SLUG, districtZone, resolveZone, zoneAt, type KigaliZone } from '../../src/lib/geo/kigali-zones';

export type BrokerKindT = 'BROKER' | 'AGENCY' | 'LANDLORD';
/** Matches the comment on `Broker.sources` in the Prisma schema. */
export type SourceTag = 'tiktok' | 'facebook' | 'web' | 'maps' | 'site' | 'airbnb' | 'whatsapp';
/** `directory`: an existing Prisma Broker row, so keys a person merged in Twenty keep its groups together. */
export type Origin = 'listing' | 'host' | 'post' | 'seed' | 'facebook' | 'maps' | 'whatsapp' | 'directory';
export type Stay = 'night' | 'month';

const DISTRICT_CODES = new Set(['GASABO', 'KICUKIRO', 'NYARUGENGE']);

/** One home a broker posted, reduced to what coverage needs. */
export interface HomeFact {
  /** `listing:<prisma id>` when the home is on the site, else `home:<twenty id>`; dedupes across sources. */
  key: string;
  district?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** False for TikTok/Facebook homes, whose pin is only the district centre. */
  pinIsReal?: boolean;
  stay?: Stay | null;
  /** RWF per month; null for nightly-only homes or other currencies. */
  priceMonth?: number | null;
  seenAt?: Date | null;
}

/** Where an agency says it is (Maps address) — counts towards coverage, not listings. */
export interface PlaceFact {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface Candidate {
  origin: Origin;
  kind: BrokerKindT;
  name: string | null;
  phones: string[];
  whatsapp?: string | null;
  tiktokHandle?: string | null;
  website?: string | null;
  facebookUrl?: string | null;
  email?: string | null;
  userId?: string | null;
  twentyHostIds?: string[];
  sources: SourceTag[];
  homes: HomeFact[];
  places?: PlaceFact[];
  lastSeenAt?: Date | null;
  /** From a WhatsApp chat: the visit fee they ask (RWF). */
  visitFee?: number | null;
  /** From a WhatsApp chat: median minutes to answer. */
  replyMinutes?: number | null;
  lastReplyAt?: Date | null;
  /** The person the ads say to call. */
  contactName?: string | null;
  /** Languages this source shows them using, most used first (RW, EN, FR, SW, AR). */
  languages?: string[];
}

export interface MergedBroker {
  /** The strongest key of the group: `phone:`, `tt:`, `web:`… — stable across runs. */
  key: string;
  kind: BrokerKindT;
  name: string;
  phones: string[];
  whatsapp: string | null;
  tiktokHandle: string | null;
  /** Every handle in the group; only the first fits the unique column. */
  tiktokHandles: string[];
  facebookUrl: string | null;
  website: string | null;
  email: string | null;
  /** The ListingBroker users merged here; `userId` is the one the Broker row points at. */
  userIds: string[];
  userId: string | null;
  twentyHostIds: string[];
  sources: SourceTag[];
  origins: Origin[];
  /** Zones served (kigali-zones slugs), most homes first. */
  zoneSlugs: string[];
  districts: string[];
  neighbourhoods: string[];
  stays: Stay[];
  priceMin: number | null;
  priceMax: number | null;
  listingsCount: number;
  lastSeenAt: Date | null;
  visitFee: number | null;
  replyMinutes: number | null;
  lastReplyAt: Date | null;
  contactName: string | null;
  /** The language to write to them in; null when no source shows one. */
  preferredLanguage: string | null;
  languages: string[];
}

/**
 * The group's languages, most used first: each source's first language counts
 * 2, the rest 1. Ties go to RW, which every Kigali broker reads.
 */
export function mergeLanguages(lists: (string[] | undefined)[]): string[] {
  const w = new Map<string, number>();
  for (const list of lists) (list ?? []).forEach((l, i) => w.set(l, (w.get(l) ?? 0) + (i === 0 ? 2 : 1)));
  return [...w].sort((a, b) => b[1] - a[1] || (a[0] === 'RW' ? -1 : b[0] === 'RW' ? 1 : a[0].localeCompare(b[0]))).map(([l]) => l);
}

// ── normalisers ──────────────────────────────────────────────────────────────

/** Any way a Rwandan mobile is written → `+2507XXXXXXXX`, else null. Landlines are not WhatsApp-able. */
export function normaliseRwPhone(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw, 'RW');
  return n?.startsWith('+250') ? n : null;
}

/** `@Mossa_Real.Estate ` → `mossa_real.estate`; null for anything that cannot be a TikTok handle. */
export function normaliseHandle(raw: string | null | undefined): string | null {
  const h = (raw ?? '').trim().replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9._]{2,24}$/.test(h) ? h : null;
}

/** Hosts that are a profile, not a broker's own site, so their domain must never merge two brokers. */
const SHARED_HOSTS = /(^|\.)(facebook|fb|instagram|tiktok|twitter|x|linkedin|youtube|wa|whatsapp|linktr|google|goo|gmail|yahoo|business\.site|wixsite|blogspot|wordpress|jiji|airbnb|booking)\.[a-z.]+$/;

/** `https://www.Example.rw/contact` → `example.rw`; null for social profiles and junk. */
export function websiteDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.') || SHARED_HOSTS.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** Words that only a real-estate business uses in its name. */
const ESTATE_WORDS = /\b(real\s*estates?|realty|realtors?|propert(y|ies)|immobili[eè]re?|immo|agence|estates?|housing|apartments? management|homes?\s+rwanda)\b/i;
/** Housing words a person's handle uses too (kigali_houses) — an agency only with a business word. */
const HOUSING_WORDS = /\b(homes?|houses?|apartments?|rentals?|inzu|amazu)\b/i;
/** Generic business words: "Nina Group" or "Gakwaya Ltd" sells anything, so these alone never make an agency. */
const BUSINESS_WORDS = /\b(ltd|limited|company|co\.?\s*ltd|group|management|agency|enterprises?)\b/i;

/**
 * A name that says it is a real-estate business, not a person. Generic
 * business words (ltd, group, management, company) count only beside a
 * housing word: "Kigali Homes Ltd" is an agency, "Nina Group" is not.
 */
export function isAgencyName(name: string | null | undefined): boolean {
  if (!name) return false;
  return ESTATE_WORDS.test(name) || (BUSINESS_WORDS.test(name) && HOUSING_WORDS.test(name));
}

/** Maps categories that are real estate, but not homes to rent. */
const NOT_HOMES = /commercial real ?estate|industrial real ?estate|office space|warehouse|land surveyor|\bcar\b|vehicle|self.?drive|\btours?\b|safari/i;

/** A Maps place that rents or sells homes — "rental agency Kigali" also finds car hire and industrial estates. */
export const isHousingAgency = (r: { name?: string | null; category?: string | null }) =>
  /real ?estate|property|properties|apartment|realtor|housing|homes?\b|immobili/i.test(`${r.category ?? ''} ${r.name ?? ''}`) &&
  !NOT_HOMES.test(`${r.category ?? ''} ${r.name ?? ''}`);

/** Lower-case, accent-free, punctuation-free — for grouping agencies by name. */
export function nameKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const k = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(ltd|limited|co|company|rwanda|kigali)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return k.length >= 4 ? k : null;
}

/** Every key a candidate can be joined on, strongest first. */
export function mergeKeys(c: Candidate): string[] {
  const keys: string[] = [];
  for (const p of c.phones) {
    const n = normaliseRwPhone(p);
    if (n) keys.push(`phone:${n}`);
  }
  const wa = normaliseRwPhone(c.whatsapp);
  if (wa) keys.push(`phone:${wa}`);
  const h = normaliseHandle(c.tiktokHandle);
  if (h) keys.push(`tt:${h}`);
  const d = websiteDomain(c.website);
  if (d) keys.push(`web:${d}`);
  if (c.userId) keys.push(`user:${c.userId}`);
  for (const id of c.twentyHostIds ?? []) keys.push(`host:${id}`);
  // Agencies are grouped by name too ("Agency names are grouped by brokerName");
  // a person's name is too common to merge on.
  const nk = nameKey(c.name);
  if (nk && (c.kind === 'AGENCY' || isAgencyName(c.name))) keys.push(`name:${nk}`);
  if (!keys.length && c.facebookUrl) keys.push(`fb:${c.facebookUrl.toLowerCase().replace(/\/+$/, '')}`);
  return [...new Set(keys)];
}

// ── coverage ─────────────────────────────────────────────────────────────────

/** Nearest-rank percentile of a sorted array. */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] ?? null;
}

/** The 10th–90th percentile of monthly rents, rounded to RWF 1,000. */
export function priceBand(rents: number[]): { priceMin: number | null; priceMax: number | null } {
  const s = rents.filter((r) => Number.isFinite(r) && r >= 10_000).sort((a, b) => a - b);
  const lo = percentile(s, 10);
  const hi = percentile(s, 90);
  const r = (n: number | null) => (n == null ? null : Math.round(n / 1000) * 1000);
  return { priceMin: r(lo), priceMax: r(hi) };
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** The district a home or office sits in, or null when nothing says. */
export function districtOf(h: { district?: string | null; address?: string | null; lat?: number | null; lng?: number | null; pinIsReal?: boolean }): string | null {
  const d = (h.district ?? '').toUpperCase().replace(/^KIGALI_/, '');
  if (DISTRICT_CODES.has(d)) return d;
  const named = districtForPlace(h.address);
  if (named !== 'UNKNOWN') return named;
  if (h.pinIsReal && h.lat != null && h.lng != null && isInKigali(h.lat, h.lng)) {
    const near = nearestDistrict(h.lat, h.lng);
    if (near !== 'UNKNOWN') return near;
  }
  return null;
}

/** Neighbourhoods a renter would name (areas.ts) that this home is in. */
export function neighbourhoodsOf(h: { address?: string | null; lat?: number | null; lng?: number | null; pinIsReal?: boolean }): string[] {
  const addr = h.address ? fold(h.address) : '';
  const named = NEIGHBOURHOODS.filter((n) => addr && new RegExp(`(^|[^a-z])${fold(n.name)}([^a-z]|$)`).test(addr)).map((n) => n.name);
  if (named.length) return named;
  if (h.pinIsReal && h.lat != null && h.lng != null) {
    const lat = h.lat;
    const lng = h.lng;
    return NEIGHBOURHOODS.filter((n) => inNeighbourhood(lat, lng, n.name)).map((n) => n.name);
  }
  return [];
}

/** Most frequent first, ties alphabetically — the first district is where they mostly work. */
function byFrequency(values: string[]): string[] {
  const n = new Map<string, number>();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);
}

/**
 * The most specific Kigali zone a home or office is in: a place the address
 * names (sector or finer), else a real pin inside Kigali, else the district
 * the text or the district code names. Null when nothing places it in Kigali.
 * TikTok/Facebook pins are district centres, so they never count (`pinIsReal`).
 */
export function zoneOf(h: { district?: string | null; address?: string | null; lat?: number | null; lng?: number | null; pinIsReal?: boolean }): KigaliZone | null {
  const named = resolveZone({ text: h.address, pinIsReal: false })?.zone;
  if (named && named.level !== 'district') return named;
  // "Kicukiro, Kigali" names only the district: a real pin inside Kigali says more.
  if (h.pinIsReal === true && h.lat != null && h.lng != null && isInKigali(h.lat, h.lng)) return zoneAt(h.lat, h.lng);
  if (named) return named;
  const d = (h.district ?? '').toUpperCase().replace(/^KIGALI_/, '');
  if (DISTRICT_CODES.has(d)) return districtZone(d as KigaliZone['district']);
  return null;
}

/** A zone and the sector above it, by name — what `Broker.neighbourhoods` lists. */
const placeNames = (z: KigaliZone): string[] => {
  const out: string[] = [];
  for (let cur: KigaliZone | undefined = z; cur && cur.level !== 'district'; cur = cur.parent ? KIGALI_ZONE_BY_SLUG.get(cur.parent) : undefined) out.push(cur.nameEn);
  return out;
};

/**
 * Districts and neighbourhood names for zones served, most first — the
 * back-compat columns the Twenty broker view and older readers use.
 */
export function namesForZones(zoneSlugs: string[]): { districts: string[]; neighbourhoods: string[] } {
  const zones = zoneSlugs.map((s) => KIGALI_ZONE_BY_SLUG.get(s)).filter((z): z is KigaliZone => !!z);
  return {
    districts: [...new Set(zones.map((z) => z.district))],
    neighbourhoods: [...new Set(zones.flatMap(placeNames))],
  };
}

export interface Coverage {
  /** Zones served, most homes first (each home counts once, at its most specific zone). */
  zoneSlugs: string[];
  districts: string[];
  neighbourhoods: string[];
  stays: Stay[];
  priceMin: number | null;
  priceMax: number | null;
  listingsCount: number;
  lastSeenAt: Date | null;
}

/** What a broker covers, from the homes they posted (deduped by key) and where their office is. */
export function coverage(homes: HomeFact[], places: PlaceFact[] = []): Coverage {
  const unique = new Map<string, HomeFact>();
  for (const h of homes) {
    const prev = unique.get(h.key);
    // Two sources for one home: keep whichever knows more.
    if (!prev || (prev.priceMonth == null && h.priceMonth != null) || (!prev.address && h.address)) unique.set(h.key, { ...prev, ...h });
  }
  const list = [...unique.values()];
  // An office pin from Maps is real; a home's pin only when its source says so.
  const spots = [...list, ...places.map((p) => ({ ...p, pinIsReal: true }))];
  const zones = spots.map((h) => zoneOf(h));
  const zoneSlugs = byFrequency(zones.filter((z): z is KigaliZone => !!z).map((z) => z.slug));
  // Districts from the zone where there is one, else the older gazetteer (it knows a few more place names).
  const districts = byFrequency(spots.map((h, i) => zones[i]?.district ?? districtOf(h)).filter((d): d is string => !!d));
  const neighbourhoods = byFrequency(
    spots.flatMap((h, i) => {
      const z = zones[i];
      return z && z.level !== 'district' ? placeNames(z) : neighbourhoodsOf(h);
    }),
  );
  const stays: Stay[] = (['month', 'night'] as const).filter((s) => list.some((h) => h.stay === s));
  const { priceMin, priceMax } = priceBand(list.map((h) => h.priceMonth).filter((p): p is number => p != null));
  const seen = list.map((h) => h.seenAt?.getTime()).filter((t): t is number => t != null && Number.isFinite(t));
  return {
    zoneSlugs,
    districts,
    neighbourhoods,
    stays,
    priceMin,
    priceMax,
    listingsCount: list.length,
    lastSeenAt: seen.length ? new Date(Math.max(...seen)) : null,
  };
}

// ── merge ────────────────────────────────────────────────────────────────────

const KIND_RANK: Record<BrokerKindT, number> = { AGENCY: 3, BROKER: 2, LANDLORD: 1 };
// A name a broker gave in a chat ("I'm Thierry") is the one they answer to.
const ORIGIN_NAME_RANK: Record<Origin, number> = { whatsapp: 7, maps: 6, host: 5, post: 4, facebook: 3, listing: 2, seed: 1, directory: 0 };
const KEY_RANK = ['phone:', 'tt:', 'web:', 'name:', 'user:', 'host:', 'fb:'];
const keyRank = (k: string) => KEY_RANK.findIndex((p) => k.startsWith(p));

/** Union-find over the candidates' keys → one MergedBroker per real broker. */
export function mergeCandidates(cands: Candidate[]): MergedBroker[] {
  const parent = cands.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const owner = new Map<string, number>();
  const keysOf = cands.map(mergeKeys);
  keysOf.forEach((keys, i) => {
    for (const k of keys) {
      const j = owner.get(k);
      if (j == null) owner.set(k, i);
      else parent[find(i)] = find(j);
    }
  });

  const groups = new Map<number, number[]>();
  cands.forEach((_, i) => {
    if (!keysOf[i]!.length) return; // nothing to reach them by, nothing to merge on
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });

  const out: MergedBroker[] = [];
  for (const idx of groups.values()) {
    const g = idx.map((i) => cands[i]!);
    // A directory row alone is a broker no source shows any more: leave its row as it is.
    if (g.every((c) => c.origin === 'directory')) continue;
    const keys = [...new Set(idx.flatMap((i) => keysOf[i]!))].sort((a, b) => keyRank(a) - keyRank(b) || a.localeCompare(b));
    const uniq = <T>(xs: (T | null | undefined)[]) => [...new Set(xs.filter((x): x is T => x != null && x !== ''))];
    const phones = uniq(g.flatMap((c) => [...c.phones, c.whatsapp ?? null].map(normaliseRwPhone)));
    // The handle with the most homes behind it wins the unique column.
    const handleWeight = new Map<string, number>();
    for (const c of g) {
      const h = normaliseHandle(c.tiktokHandle);
      if (h) handleWeight.set(h, (handleWeight.get(h) ?? 0) + 1 + c.homes.length);
    }
    const tiktokHandles = [...handleWeight].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([h]) => h);
    const userWeight = new Map<string, number>();
    for (const c of g) if (c.userId) userWeight.set(c.userId, (userWeight.get(c.userId) ?? 0) + 1 + c.homes.length);
    const userIds = [...userWeight].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([u]) => u);
    const kind = g.filter((c) => c.origin !== 'directory').map((c) => c.kind).sort((a, b) => KIND_RANK[b] - KIND_RANK[a])[0] ?? 'BROKER';
    const named = g
      .filter((c) => c.name?.trim())
      .sort((a, b) => ORIGIN_NAME_RANK[b.origin] - ORIGIN_NAME_RANK[a.origin] || (b.name ?? '').length - (a.name ?? '').length);
    const name = (named[0]?.name ?? (tiktokHandles[0] ? `@${tiktokHandles[0]}` : phones[0]) ?? 'Unknown broker').replace(/\s+/g, ' ').trim();
    const cov = coverage(g.flatMap((c) => c.homes), g.flatMap((c) => c.places ?? []));
    const languages = mergeLanguages(g.map((c) => c.languages));
    const seen = [cov.lastSeenAt, ...g.map((c) => c.lastSeenAt ?? null)].map((d) => d?.getTime()).filter((t): t is number => t != null && Number.isFinite(t));
    out.push({
      key: keys[0]!,
      kind,
      name,
      phones,
      whatsapp: uniq(g.map((c) => normaliseRwPhone(c.whatsapp)))[0] ?? null,
      tiktokHandle: tiktokHandles[0] ?? null,
      tiktokHandles,
      facebookUrl: uniq(g.map((c) => c.facebookUrl))[0] ?? null,
      website: g.find((c) => websiteDomain(c.website))?.website ?? null,
      email: uniq(g.map((c) => c.email?.trim().toLowerCase()))[0] ?? null,
      userIds,
      userId: userIds[0] ?? null,
      twentyHostIds: uniq(g.flatMap((c) => c.twentyHostIds ?? [])),
      sources: uniq(g.flatMap((c) => c.sources)).sort() as SourceTag[],
      origins: uniq(g.map((c) => c.origin).filter((o) => o !== 'directory')).sort() as Origin[],
      zoneSlugs: cov.zoneSlugs,
      districts: cov.districts,
      neighbourhoods: cov.neighbourhoods,
      stays: cov.stays,
      priceMin: cov.priceMin,
      priceMax: cov.priceMax,
      listingsCount: cov.listingsCount,
      lastSeenAt: seen.length ? new Date(Math.max(...seen)) : null,
      visitFee: g.find((c) => c.visitFee != null)?.visitFee ?? null,
      replyMinutes: g.reduce<number | null>((m, c) => (c.replyMinutes == null ? m : m == null ? c.replyMinutes : Math.min(m, c.replyMinutes)), null),
      lastReplyAt: g.reduce<Date | null>((m, c) => (c.lastReplyAt && (!m || c.lastReplyAt > m) ? c.lastReplyAt : m), null),
      contactName: mostNamed(g.map((c) => c.contactName)),
      preferredLanguage: languages[0] ?? null,
      languages,
    });
  }
  return out.sort((a, b) => b.listingsCount - a.listingsCount || a.key.localeCompare(b.key));
}

/** Counts for the dry run: by kind, by source, by origin, and how many can be messaged. */
export function summarise(brokers: MergedBroker[]) {
  const count = (xs: string[]) => {
    const m: Record<string, number> = {};
    for (const x of xs) m[x] = (m[x] ?? 0) + 1;
    return m;
  };
  return {
    total: brokers.length,
    byKind: count(brokers.map((b) => b.kind)),
    bySource: count(brokers.flatMap((b) => b.sources)),
    byOrigin: count(brokers.flatMap((b) => b.origins)),
    withPhone: brokers.filter((b) => b.phones.length).length,
    withCoverage: brokers.filter((b) => b.districts.length).length,
    withZones: brokers.filter((b) => b.zoneSlugs.some((z) => z.includes('/'))).length,
    withHomes: brokers.filter((b) => b.listingsCount > 0).length,
  };
}

// ── two-way with Twenty ──────────────────────────────────────────────────────
//
// Prisma is the source of truth, but people fix brokers in Twenty: an agency
// filed as a broker, a wrong name, a dead number, the zones they really serve,
// an opt-out by phone, two records that are one person. Each run pulls those
// edits back first, then never overwrites them.

/** Fields a person can own from Twenty. Names are Prisma's; `phones` is Twenty's `phone`. */
export const LOCKABLE = ['kind', 'name', 'phones', 'whatsapp', 'optOut', 'zoneSlugs'] as const;
export type LockableField = (typeof LOCKABLE)[number];

/** Our own PATCH lands a moment after `syncedAt` is read; later than this is someone else. */
export const EDIT_TOLERANCE_MS = 5_000;

/** Actors Twenty stamps on `updatedBy` / `createdBy` that are scripts, not people. */
const MACHINE_ACTORS = new Set(['API', 'SYSTEM']);
const byPerson = (source: string | null | undefined) => !!source && !MACHINE_ACTORS.has(source.toUpperCase());

/** A Twenty `broker` record, read back. */
export interface TwentyBrokerState {
  id: string;
  updatedAt: Date | null;
  /** `updatedBy.source`: MANUAL for the UI, API for scripts. Null when Twenty does not say. */
  updatedBy: string | null;
  kind: BrokerKindT | null;
  name: string | null;
  phones: string[];
  whatsapp: string | null;
  optOut: boolean;
  /** Zones from its `brokerZone` rows; null when the junction object does not exist yet. */
  zoneSlugs: string[] | null;
  /** True when any of those rows was created by a person. */
  zonesByPerson: boolean;
  mergeIntoId: string | null;
}

/** The Prisma `Broker` row, as far as the two-way sync needs it. */
export interface BrokerRowState {
  id: string;
  kind: BrokerKindT;
  name: string;
  phones: string[];
  whatsapp: string | null;
  optOut: boolean;
  optOutAt: Date | null;
  zoneSlugs: string[];
  lockedFields: string[];
  syncedAt: Date | null;
}

export interface HumanEdit {
  /** The Prisma update: changed values plus `lockedFields`. Empty when nothing changed. */
  data: Partial<Pick<BrokerRowState, LockableField | 'optOutAt' | 'lockedFields'>>;
  /** Fields copied from Twenty this run. */
  changed: LockableField[];
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set([...a, ...b]).size === a.length;

/**
 * What a person changed on a broker in Twenty, as a Prisma update that also
 * locks those fields. A record counts as edited when a person (not the API)
 * touched it after our last write (`syncedAt` + tolerance); with no
 * `syncedAt` yet, only a person's stamp counts. Only fields that differ from
 * Prisma are copied and locked. Zones are judged on the junction rows
 * themselves, since adding a `brokerZone` row does not touch the broker.
 */
export function humanEdit(t: TwentyBrokerState, p: BrokerRowState, now = new Date()): HumanEdit {
  const changed: LockableField[] = [];
  const data: HumanEdit['data'] = {};
  const after = p.syncedAt ? t.updatedAt != null && t.updatedAt.getTime() > p.syncedAt.getTime() + EDIT_TOLERANCE_MS : true;
  const recordEdited = after && (t.updatedBy == null ? p.syncedAt != null : byPerson(t.updatedBy));

  if (recordEdited) {
    if (t.kind && t.kind !== p.kind) {
      data.kind = t.kind;
      changed.push('kind');
    }
    const name = t.name?.replace(/\s+/g, ' ').trim();
    if (name && name !== p.name) {
      data.name = name;
      changed.push('name');
    }
    const phones = [...new Set(t.phones.map(normaliseRwPhone).filter((n): n is string => !!n))];
    // A cleared phone field is a person removing a dead number — but never every number at once by accident of a bad read.
    if (phones.length && !sameSet(phones, p.phones)) {
      data.phones = phones;
      changed.push('phones');
    }
    const wa = normaliseRwPhone(t.whatsapp);
    if (wa !== p.whatsapp && (wa || t.whatsapp === null || t.whatsapp === '')) {
      data.whatsapp = wa;
      changed.push('whatsapp');
    }
    if (t.optOut !== p.optOut) {
      // The agent opted them out after our last write, so Twenty still shows the old "no": keep the opt-out.
      const agentNewer = p.optOut && !t.optOut && p.optOutAt != null && (!p.syncedAt || p.optOutAt.getTime() > p.syncedAt.getTime());
      if (!agentNewer) {
        data.optOut = t.optOut;
        data.optOutAt = t.optOut ? now : null;
        changed.push('optOut');
      }
    }
  }

  // Zones: a person-created row, or (once we have synced) any difference from what we last wrote.
  if (t.zoneSlugs && (t.zonesByPerson || p.syncedAt) && !sameSet(t.zoneSlugs, p.zoneSlugs)) {
    data.zoneSlugs = t.zoneSlugs;
    changed.push('zoneSlugs');
  }

  if (changed.length) data.lockedFields = [...new Set([...p.lockedFields, ...changed])];
  return { data, changed };
}

/** The derived update minus what a person owns. `zoneSlugs` locked keeps districts/neighbourhoods on those zones. */
export function withoutLocked<T extends Record<string, unknown>>(data: T, locked: string[], lockedZones?: string[]): Partial<T> {
  const out: Record<string, unknown> = { ...data };
  for (const f of locked) delete out[f];
  if (locked.includes('zoneSlugs') && lockedZones) Object.assign(out, namesForZones(lockedZones));
  return out as Partial<T>;
}

/** The name most sources repeat (case and spacing ignored); first seen wins a tie. */
export function mostNamed(names: (string | null | undefined)[]): string | null {
  const n = new Map<string, { label: string; count: number }>();
  for (const raw of names) {
    const label = raw?.replace(/\s+/g, ' ').trim();
    if (!label) continue;
    const k = label.toLowerCase();
    n.set(k, { label: n.get(k)?.label ?? label, count: (n.get(k)?.count ?? 0) + 1 });
  }
  let best: { label: string; count: number } | null = null;
  for (const v of n.values()) if (!best || v.count > best.count) best = v;
  return best?.label ?? null;
}

/** The Twenty body keys each lockable field writes. */
export const TWENTY_KEYS: Record<LockableField, string[]> = {
  kind: ['kind'],
  name: ['name'],
  phones: ['phone'],
  whatsapp: ['whatsapp'],
  optOut: ['optOut', 'optOutAt'],
  zoneSlugs: [],
};

/**
 * `mergeInto` chains resolved to the record that survives: A → B → C merges
 * A and B into C. Cycles and targets that no longer exist are skipped.
 */
export function resolveMerges(rows: { id: string; mergeIntoId: string | null }[]): Map<string, string> {
  const next = new Map(rows.filter((r) => r.mergeIntoId && r.mergeIntoId !== r.id).map((r) => [r.id, r.mergeIntoId!]));
  const exists = new Set(rows.map((r) => r.id));
  const out = new Map<string, string>();
  for (const id of next.keys()) {
    const seen = new Set([id]);
    let cur = next.get(id)!;
    while (next.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = next.get(cur)!;
    }
    if (seen.has(cur) || !exists.has(cur)) continue; // a cycle, or merged into nothing
    out.set(id, cur);
  }
  return out;
}

/** A full Prisma `Broker` row, for merging two of them. */
export interface BrokerRowFull extends BrokerRowState {
  userId: string | null;
  tiktokHandle: string | null;
  facebookUrl: string | null;
  website: string | null;
  email: string | null;
  districts: string[];
  neighbourhoods: string[];
  stays: string[];
  priceMin: number | null;
  priceMax: number | null;
  listingsCount: number;
  lastSeenAt: Date | null;
  lastAskedAt: Date | null;
  asks: number;
  answers: number;
  availableAnswers: number;
  sources: string[];
}

const maxDate = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : (a ?? b));

/**
 * The survivor's row after absorbing the loser: counters summed, phones,
 * sources and zones unioned (survivor's first), blanks filled from the loser,
 * and every field the survivor's person locked kept as it is. The loser's
 * unique `userId` / `tiktokHandle` move only into an empty slot — the caller
 * deletes the loser first so the unique index allows it.
 */
export function mergeBrokerRows(survivor: BrokerRowFull, loser: BrokerRowFull) {
  const locked = new Set(survivor.lockedFields);
  const union = (a: string[], b: string[]) => [...new Set([...a, ...b])];
  const keep = <K extends LockableField>(k: K, merged: BrokerRowFull[K]) => (locked.has(k) ? survivor[k] : merged);
  const zoneSlugs = keep('zoneSlugs', union(survivor.zoneSlugs, loser.zoneSlugs));
  const names = namesForZones(zoneSlugs);
  const optOut = keep('optOut', survivor.optOut || loser.optOut);
  return {
    kind: keep('kind', KIND_RANK[loser.kind] > KIND_RANK[survivor.kind] ? loser.kind : survivor.kind),
    name: survivor.name,
    phones: keep('phones', union(survivor.phones, loser.phones)),
    whatsapp: keep('whatsapp', survivor.whatsapp ?? loser.whatsapp),
    optOut,
    optOutAt: optOut ? (survivor.optOutAt ?? loser.optOutAt) : null,
    zoneSlugs,
    districts: union(names.districts.length ? names.districts : survivor.districts, loser.districts),
    neighbourhoods: union(names.neighbourhoods.length ? names.neighbourhoods : survivor.neighbourhoods, loser.neighbourhoods),
    userId: survivor.userId ?? loser.userId,
    tiktokHandle: survivor.tiktokHandle ?? loser.tiktokHandle,
    facebookUrl: survivor.facebookUrl ?? loser.facebookUrl,
    website: survivor.website ?? loser.website,
    email: survivor.email ?? loser.email,
    stays: union(survivor.stays, loser.stays),
    priceMin: survivor.priceMin == null ? loser.priceMin : loser.priceMin == null ? survivor.priceMin : Math.min(survivor.priceMin, loser.priceMin),
    priceMax: survivor.priceMax == null ? loser.priceMax : loser.priceMax == null ? survivor.priceMax : Math.max(survivor.priceMax, loser.priceMax),
    listingsCount: survivor.listingsCount + loser.listingsCount,
    lastSeenAt: maxDate(survivor.lastSeenAt, loser.lastSeenAt),
    lastAskedAt: maxDate(survivor.lastAskedAt, loser.lastAskedAt),
    asks: survivor.asks + loser.asks,
    answers: survivor.answers + loser.answers,
    availableAnswers: survivor.availableAnswers + loser.availableAnswers,
    sources: union(survivor.sources, loser.sources),
    lockedFields: survivor.lockedFields,
  };
}

/** An existing Prisma row as a merge candidate: its keys hold together what a person merged. */
export function directoryCandidate(r: { phones: string[]; whatsapp: string | null; tiktokHandle: string | null; userId: string | null; website: string | null; facebookUrl: string | null }): Candidate {
  return {
    origin: 'directory',
    kind: 'LANDLORD',
    name: null,
    phones: r.phones,
    whatsapp: r.whatsapp,
    tiktokHandle: r.tiktokHandle,
    userId: r.userId,
    website: r.website,
    facebookUrl: r.facebookUrl,
    sources: [],
    homes: [],
  };
}

// ── agency websites (agencies-discover.ts) ───────────────────────────────────

/** Phones, WhatsApp and email on an agency's web page. */
export function contactsInHtml(html: string): { phones: string[]; whatsapp: string | null; email: string | null } {
  const phones: string[] = [];
  const add = (raw: string) => {
    const n = normaliseRwPhone(raw);
    if (n && !phones.includes(n)) phones.push(n);
  };
  let whatsapp: string | null = null;
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp:\/\/send\?phone=)\+?(\d{9,15})/gi)) {
    const n = normaliseRwPhone(m[1]);
    if (n) {
      whatsapp ??= n;
      add(n);
    }
  }
  for (const m of html.matchAll(/tel:([+\d\s().-]{9,20})/gi)) add(m[1]!);
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (const m of text.matchAll(/(?:\+|00)?\d[\d\s.()-]{7,16}\d/g)) add(m[0]);
  const email = html.match(/mailto:([^"'?\s>]+@[^"'?\s>]+)/i)?.[1] ?? text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
  return { phones, whatsapp, email: email ? email.toLowerCase() : null };
}

/** Google Maps place URL → a stable id (the `!1s0x…:0x…` feature id, else the place path). */
export function placeIdFromMapsUrl(url: string): string | null {
  const fid = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1];
  if (fid) return fid.toLowerCase();
  const path = url.match(/\/maps\/place\/([^/?]+)/)?.[1];
  return path ? decodeURIComponent(path).toLowerCase() : null;
}

/** `@-1.95,30.09,17z` or `!3d-1.95!4d30.09` in a Maps URL → coordinates. */
export function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  const m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}
