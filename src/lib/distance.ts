/**
 * Great-circle distance helpers, shared by the client "Nearby" flows and the
 * server-side proximity search.
 *
 * Pure arithmetic with no imports, so it is safe on both sides of the
 * client/server boundary — the search action ranks rows with `haversineKm`
 * while the travel city picker uses the same function to pick the closest
 * assembly-point city, and neither can drift from the other. (Kept separate
 * from `src/lib/geo.ts`, which is the server-only IP-country payment gate and
 * imports `next/headers`.)
 */

/** A WGS-84 point. Matches the `latitude`/`longitude` columns on `Location`. */
export interface Coords {
  lat: number;
  lng: number;
}

/** Mean Earth radius (km) — the standard spherical approximation. */
const EARTH_RADIUS_KM = 6371;

/**
 * Kilometres per degree of latitude. Constant enough for a prefilter box
 * (the meridional degree varies ~110.57–111.69 km from equator to pole).
 */
const KM_PER_DEG_LAT = 110.574;

/**
 * Default "Nearby" radius. Wide enough that a user anywhere in a city — or in
 * its outskirts — still sees that city's stays, narrow enough that "nearby"
 * keeps meaning something.
 */
export const DEFAULT_NEARBY_RADIUS_KM = 50;

/** Hard ceiling on a client-supplied radius, so the box can't become global. */
export const MAX_NEARBY_RADIUS_KM = 500;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two points, in kilometres.
 *
 * Uses the haversine formula, which stays numerically stable for the small
 * distances we care about (the spherical law of cosines loses precision under
 * a few hundred metres).
 */
export function haversineKm(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** An axis-aligned latitude/longitude box, in decimal degrees. */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The smallest lat/lng box that fully contains the circle of `radiusKm` around
 * `center`.
 *
 * This exists so the database can prefilter with a plain range scan on the
 * existing `@@index([latitude, longitude])` instead of computing a trig
 * distance per row. The box is deliberately *over*-inclusive — its corners sit
 * outside the circle — so callers must still apply `haversineKm` to get a true
 * radius. Over-fetching a few corner rows is much cheaper than a full scan.
 *
 * Two edge cases widen the box rather than erroring, because a too-wide box
 * only costs a few extra rows that the haversine pass then drops: near the
 * poles `cos(lat) → 0` would blow the longitude span up to infinity, and a box
 * spanning the antimeridian cannot be expressed as a single range, so it clamps
 * at the ±180 edge (theoretical for a catalog sitting at ~32°E).
 */
export function boundingBox(center: Coords, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEG_LAT;
  const cosLat = Math.abs(Math.cos(toRad(center.lat)));

  // Below this the meridians have converged so tightly that the longitude span
  // is effectively the whole globe.
  const lngDelta =
    cosLat < 1e-6 ? 180 : Math.min(180, radiusKm / (KM_PER_DEG_LAT * cosLat));

  return {
    minLat: clamp(center.lat - latDelta, -90, 90),
    maxLat: clamp(center.lat + latDelta, -90, 90),
    minLng: clamp(center.lng - lngDelta, -180, 180),
    maxLng: clamp(center.lng + lngDelta, -180, 180),
  };
}

/** True when both parts of a coordinate pair are finite and in WGS-84 range. */
export function isValidCoords(value: Partial<Coords> | null | undefined): value is Coords {
  if (!value) return false;
  const { lat, lng } = value;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Parse a coordinate pair off URL search params.
 *
 * Returns null unless BOTH values are present and valid — a half-supplied pair
 * is a malformed link, not a partial location, and keeping one half would
 * produce a nonsense search.
 */
export function parseCoords(
  lat: string | number | undefined | null,
  lng: string | number | undefined | null
): Coords | null {
  if (lat === undefined || lat === null || lat === "") return null;
  if (lng === undefined || lng === null || lng === "") return null;

  const parsed = { lat: Number(lat), lng: Number(lng) };
  return isValidCoords(parsed) ? parsed : null;
}

/**
 * Round to ~11 m before putting coordinates in a URL.
 *
 * Full GPS precision in a shareable link is needlessly identifying, and the
 * long tail of decimals fragments the search cache key across positions that
 * return byte-identical results.
 */
export function roundCoord(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/**
 * Nearest entry to `origin`, or null for an empty list.
 *
 * Used by the travel city picker to turn a raw fix into the closest city we
 * actually run buses from.
 */
export function nearestBy<T>(
  origin: Coords,
  items: readonly T[],
  getCoords: (item: T) => Coords | null
): { item: T; distanceKm: number } | null {
  let best: { item: T; distanceKm: number } | null = null;

  for (const item of items) {
    const coords = getCoords(item);
    if (!coords) continue;
    const distanceKm = haversineKm(origin, coords);
    if (!best || distanceKm < best.distanceKm) best = { item, distanceKm };
  }

  return best;
}
