/**
 * Shared shapes + helpers for the transport landing's Airbnb-style route
 * cards. `PopularRoute` is the structural subset of the Prisma payload
 * returned by `getPopularRoutes()` (route + origin/destination
 * AssemblyPoints) that the cards actually read.
 */

export interface RouteEndpoint {
  id: number;
  name: string;
  nameAr: string | null;
  city: string;
  latitude: number;
  longitude: number;
}

export interface PopularRoute {
  id: number;
  originId: number;
  destinationId: number;
  basePrice: number;
  duration: number;
  origin: RouteEndpoint;
  destination: RouteEndpoint;
}

/** Search URL for a route, pre-filled with a travel date (yyyy-MM-dd). */
export function routeSearchHref(
  route: PopularRoute,
  lang: string,
  dateIso: string,
): string {
  const query = new URLSearchParams({
    originId: String(route.originId),
    destinationId: String(route.destinationId),
    origin: route.origin.city,
    destination: route.destination.city,
    date: dateIso,
  });
  return `/${lang}/travel/search?${query.toString()}`;
}

// ─── Static route-map thumbnails (Mapbox Static Images API) ─────────────────
//
// Every route gets a unique, data-true card image: a light-styled map with
// brand-red pins on both assembly points and a straight connector line.
// The token is the same NEXT_PUBLIC one the interactive maps already ship
// to the client, so exposing it in an image URL adds nothing new.

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN ||
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  "";

const BRAND_PIN = "de3151";

/** Google encoded-polyline algorithm over (lat, lng) pairs. */
function encodePolyline(points: Array<[number, number]>): string {
  let result = "";
  let prevLat = 0;
  let prevLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    for (const [value, prev] of [
      [iLat, prevLat],
      [iLng, prevLng],
    ] as const) {
      let d = value - prev;
      d = d < 0 ? ~(d << 1) : d << 1;
      while (d >= 0x20) {
        result += String.fromCharCode((0x20 | (d & 0x1f)) + 63);
        d >>= 5;
      }
      result += String.fromCharCode(d + 63);
    }
    prevLat = iLat;
    prevLng = iLng;
  }
  return result;
}

/** Static map URL for a route card, or null when no Mapbox token is set. */
export function routeMapThumbUrl(route: PopularRoute): string | null {
  if (!MAPBOX_TOKEN) return null;
  const { origin: o, destination: d } = route;
  const path = encodeURIComponent(
    encodePolyline([
      [o.latitude, o.longitude],
      [d.latitude, d.longitude],
    ]),
  );
  const overlays = [
    `path-3+${BRAND_PIN}-0.8(${path})`,
    `pin-s+${BRAND_PIN}(${o.longitude},${o.latitude})`,
    `pin-s+${BRAND_PIN}(${d.longitude},${d.latitude})`,
  ].join(",");
  return (
    `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${overlays}` +
    `/auto/480x360@2x?padding=60&attribution=false&logo=false&access_token=${MAPBOX_TOKEN}`
  );
}
