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

export type BrokerKindT = 'BROKER' | 'AGENCY' | 'LANDLORD';
/** Matches the comment on `Broker.sources` in the Prisma schema. */
export type SourceTag = 'tiktok' | 'facebook' | 'web' | 'maps' | 'site' | 'airbnb';
export type Origin = 'listing' | 'host' | 'post' | 'seed' | 'facebook' | 'maps';
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
  districts: string[];
  neighbourhoods: string[];
  stays: Stay[];
  priceMin: number | null;
  priceMax: number | null;
  listingsCount: number;
  lastSeenAt: Date | null;
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

const AGENCY_WORDS = /\b(real\s*estate|realty|realtors?|propert(y|ies)|immobili[eè]re?|immo|agency|agence|estates?|homes?\s+(ltd|rwanda)|ltd|limited|company|co\.?\s*ltd|group|housing|apartments? management|management)\b/i;

/** A name that says it is a business, not a person. */
export function isAgencyName(name: string | null | undefined): boolean {
  return !!name && AGENCY_WORDS.test(name);
}

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

export interface Coverage {
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
  const districts = byFrequency([...list, ...places].map((h) => districtOf(h)).filter((d): d is string => !!d));
  const neighbourhoods = byFrequency([...list, ...places].flatMap((h) => neighbourhoodsOf(h)));
  const stays: Stay[] = (['month', 'night'] as const).filter((s) => list.some((h) => h.stay === s));
  const { priceMin, priceMax } = priceBand(list.map((h) => h.priceMonth).filter((p): p is number => p != null));
  const seen = list.map((h) => h.seenAt?.getTime()).filter((t): t is number => t != null && Number.isFinite(t));
  return {
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
const ORIGIN_NAME_RANK: Record<Origin, number> = { maps: 6, host: 5, post: 4, facebook: 3, listing: 2, seed: 1 };
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
    const kind = g.map((c) => c.kind).sort((a, b) => KIND_RANK[b] - KIND_RANK[a])[0] ?? 'BROKER';
    const named = g
      .filter((c) => c.name?.trim())
      .sort((a, b) => ORIGIN_NAME_RANK[b.origin] - ORIGIN_NAME_RANK[a.origin] || (b.name ?? '').length - (a.name ?? '').length);
    const name = (named[0]?.name ?? (tiktokHandles[0] ? `@${tiktokHandles[0]}` : phones[0]) ?? 'Unknown broker').replace(/\s+/g, ' ').trim();
    const cov = coverage(g.flatMap((c) => c.homes), g.flatMap((c) => c.places ?? []));
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
      origins: uniq(g.map((c) => c.origin)).sort() as Origin[],
      districts: cov.districts,
      neighbourhoods: cov.neighbourhoods,
      stays: cov.stays,
      priceMin: cov.priceMin,
      priceMax: cov.priceMax,
      listingsCount: cov.listingsCount,
      lastSeenAt: seen.length ? new Date(Math.max(...seen)) : null,
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
    withHomes: brokers.filter((b) => b.listingsCount > 0).length,
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
