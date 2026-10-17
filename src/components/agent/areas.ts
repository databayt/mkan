/**
 * Kigali places the badges and the parser can name: neighbourhoods tenants ask
 * for, and three "near…" areas (city centre, business district, universities).
 * Pure data + distance — rank.ts applies them, the badges list them.
 *
 * Coordinates are approximate (a sector or campus centre to ~300 m); the radii
 * are generous on purpose, since a listing pin is itself an approximation.
 */
import { haversineKm } from "@/lib/geo/rwanda-places";

export type District = "GASABO" | "KICUKIRO" | "NYARUGENGE";

export interface Neighbourhood {
  name: string;
  district: District;
  lat: number;
  lng: number;
}

/** The names Kigali renters use — sectors plus a few well-known cells. */
export const NEIGHBOURHOODS: Neighbourhood[] = [
  { name: "Kimihurura", district: "GASABO", lat: -1.95, lng: 30.09 },
  { name: "Kacyiru", district: "GASABO", lat: -1.938, lng: 30.083 },
  { name: "Nyarutarama", district: "GASABO", lat: -1.935, lng: 30.103 },
  { name: "Remera", district: "GASABO", lat: -1.955, lng: 30.11 },
  { name: "Kibagabaga", district: "GASABO", lat: -1.925, lng: 30.115 },
  { name: "Kimironko", district: "GASABO", lat: -1.935, lng: 30.127 },
  { name: "Kinyinya", district: "GASABO", lat: -1.905, lng: 30.1 },
  { name: "Gisozi", district: "GASABO", lat: -1.921, lng: 30.068 },
  { name: "Kiyovu", district: "NYARUGENGE", lat: -1.95, lng: 30.065 },
  { name: "Nyamirambo", district: "NYARUGENGE", lat: -1.98, lng: 30.04 },
  { name: "Muhima", district: "NYARUGENGE", lat: -1.942, lng: 30.056 },
  { name: "Kicukiro", district: "KICUKIRO", lat: -1.975, lng: 30.103 },
  { name: "Niboye", district: "KICUKIRO", lat: -1.98, lng: 30.115 },
  { name: "Kagarama", district: "KICUKIRO", lat: -1.995, lng: 30.11 },
  { name: "Gikondo", district: "KICUKIRO", lat: -1.975, lng: 30.075 },
  { name: "Rebero", district: "KICUKIRO", lat: -1.995, lng: 30.075 },
  { name: "Kanombe", district: "KICUKIRO", lat: -1.97, lng: 30.145 },
];

/** How far from a neighbourhood's centre still counts as "in" it. */
export const NEIGHBOURHOOD_RADIUS_KM = 1.8;

export const AREA_KEYS = ["center", "business", "university"] as const;
export type AreaKey = (typeof AREA_KEYS)[number];

/** Each area is one or more points; a home within `radiusKm` of any of them is in it. */
export const AREAS: Record<AreaKey, { radiusKm: number; points: [number, number][] }> = {
  // The CBD around Nyarugenge's KN 4 Ave / Kigali City Tower.
  center: { radiusKm: 2.5, points: [[-1.9441, 30.0619]] },
  // Kimihurura–Kacyiru: Convention Centre, Kigali Heights, ministries, embassies.
  business: { radiusKm: 2.2, points: [[-1.9536, 30.0928], [-1.9405, 30.0835]] },
  // University of Rwanda (Nyarugenge, Gikondo, Remera), ULK Gisozi, Kigali Innovation City.
  university: {
    radiusKm: 2,
    points: [[-1.9586, 30.0636], [-1.977, 30.073], [-1.956, 30.116], [-1.921, 30.063], [-1.93, 30.153]],
  },
};

export const neighbourhoodNamed = (name: string | null | undefined): Neighbourhood | undefined =>
  name ? NEIGHBOURHOODS.find((n) => n.name.toLowerCase() === name.toLowerCase()) : undefined;

export function inNeighbourhood(lat: number, lng: number, name: string): boolean {
  const n = neighbourhoodNamed(name);
  return !!n && haversineKm(lat, lng, n.lat, n.lng) <= NEIGHBOURHOOD_RADIUS_KM;
}

export function inArea(lat: number, lng: number, area: AreaKey): boolean {
  const a = AREAS[area];
  return a.points.some(([pLat, pLng]) => haversineKm(lat, lng, pLat, pLng) <= a.radiusKm);
}

/** A lat/lng box that contains every point within `km` of the given points — a cheap SQL prefilter. */
export function boxAround(points: [number, number][], km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((2 * Math.PI) / 180));
  const lats = points.map(([la]) => la);
  const lngs = points.map(([, lo]) => lo);
  return {
    latitude: { gte: Math.min(...lats) - dLat, lte: Math.max(...lats) + dLat },
    longitude: { gte: Math.min(...lngs) - dLng, lte: Math.max(...lngs) + dLng },
  };
}
