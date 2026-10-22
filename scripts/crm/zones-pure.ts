/**
 * The pure half of `crm:zones`: which Kigali zone a home, a broker or a
 * tenant's request sits in, and the counters each Twenty `zone` record shows.
 *
 * Counting is hierarchical — a home in Nyarutarama counts for Nyarutarama,
 * Remera and Gasabo — because a zone page answers "what is in here", and
 * `zoneWithin` makes a district hold its sectors and their neighbourhoods.
 *
 * Unit-tested in `tests/crm/zones.test.ts`.
 */
import { KIGALI_ZONES, KIGALI_ZONE_BY_SLUG, districtZone, resolveZone, zoneAt, zoneNamed, zoneWithin, type KigaliDistrict, type KigaliZone } from '../../src/lib/geo/kigali-zones';

import { isInKigali } from '../../src/lib/geo/rwanda-places';

const DISTRICTS = new Set<KigaliDistrict>(['GASABO', 'KICUKIRO', 'NYARUGENGE']);

/** `Gasabo`, `KIGALI_GASABO`, `gasabo` → GASABO; anything else → null. */
export function districtCode(...values: (string | null | undefined)[]): KigaliDistrict | null {
  for (const v of values) {
    const d = (v ?? '').trim().toUpperCase().replace(/^KIGALI_/, '');
    if (DISTRICTS.has(d as KigaliDistrict)) return d as KigaliDistrict;
  }
  return null;
}

/** A Prisma Location, as far as placing it needs. */
export interface LocationFacts {
  state?: string | null;
  zoneKey?: string | null;
  sector?: string | null;
  neighbourhood?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Airbnb and owner-entered homes carry a real pin; TikTok/Facebook/web leads sit at their district's centre. */
  pinIsReal?: boolean;
}

/**
 * The most specific zone slug of a listing's location: the backfilled
 * neighbourhood or sector, else a place its address names or its real pin
 * falls in (inside the same district when the district is known), else the
 * district.
 */
export function listingZoneSlug(l: LocationFacts): string | null {
  const known = [l.neighbourhood, l.sector].find((s) => s && KIGALI_ZONE_BY_SLUG.has(s));
  if (known) return known;
  const district = districtCode(l.zoneKey, l.state);
  const named = resolveZone({ text: l.address, pinIsReal: false })?.zone;
  if (named && named.level !== 'district' && (!district || named.district === district)) return named.slug;
  // "Kicukiro, Kigali" names only the district: a real pin says more. A lead's pin is its
  // district's centre, which says nothing finer, so only a real pin inside Kigali counts.
  if (l.pinIsReal === true && l.latitude != null && l.longitude != null && isInKigali(l.latitude, l.longitude)) return zoneAt(l.latitude, l.longitude).slug;
  if (named && (!district || named.district === district)) return named.slug;
  return district ? districtZone(district).slug : null;
}

/** A tenant's request (`TenantRequest.requirements`) → the zone they asked for. */
export function demandZoneSlug(r: { district?: string | null; neighbourhood?: string | null } | null | undefined): string | null {
  if (!r) return null;
  const hood = r.neighbourhood ? zoneNamed(r.neighbourhood) : undefined;
  if (hood) return hood.slug;
  const d = districtCode(r.district);
  return d ? districtZone(d).slug : null;
}

export interface ZoneCounters {
  homesCount: number;
  brokersCount: number;
  openDemand: number;
}

/** How many of `slugs` sit at or under each zone. */
export function countWithin(zones: KigaliZone[], slugs: (string | null | undefined)[]): Map<string, number> {
  const out = new Map(zones.map((z) => [z.slug, 0]));
  for (const s of slugs) {
    if (!s) continue;
    for (const z of zones) if (zoneWithin(z.slug, s)) out.set(z.slug, out.get(z.slug)! + 1);
  }
  return out;
}

/**
 * Counters for every zone: homes (one slug per listing), brokers (one count
 * per broker however many of its zones fall inside) and open demand.
 */
export function zoneCounters(
  input: { homes: (string | null)[]; brokers: string[][]; demand: (string | null)[] },
  zones: KigaliZone[] = KIGALI_ZONES,
): Map<string, ZoneCounters> {
  const homes = countWithin(zones, input.homes);
  const demand = countWithin(zones, input.demand);
  const out = new Map<string, ZoneCounters>();
  for (const z of zones) {
    const brokersCount = input.brokers.filter((slugs) => slugs.some((s) => zoneWithin(z.slug, s))).length;
    out.set(z.slug, { homesCount: homes.get(z.slug)!, brokersCount, openDemand: demand.get(z.slug)! });
  }
  return out;
}

/** The Twenty `zone` body for one zone (no parent — that needs the parent's record id). */
export function zoneBody(z: KigaliZone, c: ZoneCounters | undefined): Record<string, unknown> {
  return {
    name: z.nameEn,
    level: z.level.toUpperCase(),
    district: z.district,
    nameAr: z.nameAr,
    nameRw: z.nameRw,
    aliases: z.aliases.join(', '),
    latitude: z.lat,
    longitude: z.lng,
    radiusKm: z.radiusKm,
    homesCount: c?.homesCount ?? 0,
    brokersCount: c?.brokersCount ?? 0,
    openDemand: c?.openDemand ?? 0,
    mkanZoneSlug: z.slug,
  };
}

const sameValue = (a: unknown, b: unknown) =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-6 : (a ?? '') === (b ?? '');

/** The fields of `want` that differ from the live record — an empty object means nothing to PATCH. */
export function zonePatch(live: Record<string, unknown>, want: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(want)) if (!sameValue(live[k], v)) out[k] = v;
  return out;
}

/** Parents before children, so a child's `parentId` always exists. */
export const ZONES_PARENTS_FIRST: KigaliZone[] = [...KIGALI_ZONES].sort(
  (a, b) => ['district', 'sector', 'neighbourhood'].indexOf(a.level) - ['district', 'sector', 'neighbourhood'].indexOf(b.level),
);
