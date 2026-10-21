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

export interface Landmark {
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
}

/**
 * Places tenants name instead of a neighbourhood — a workplace, a campus, a
 * market, the airport. "Near Kigali Heights" ranks homes by distance to this
 * pin (rank.ts), softly: a pin off by a few hundred metres costs a home a few
 * points, never its place. Approximate like the rest of this file; a place
 * missing here can still be placed by the neighbourhood the reader names.
 */
export const LANDMARKS: Landmark[] = [
  { name: "Kigali Convention Centre", aliases: ["kcc", "convention centre", "convention center", "radisson blu"], lat: -1.9536, lng: 30.0928 },
  { name: "Kigali Heights", aliases: ["kigali heights mall"], lat: -1.9531, lng: 30.0936 },
  { name: "Kigali City Tower", aliases: ["kct", "city tower", "car free zone", "utc", "union trade centre", "union trade center"], lat: -1.9441, lng: 30.0619 },
  { name: "King Faisal Hospital", aliases: ["king faisal", "kfh"], lat: -1.9446, lng: 30.0928 },
  { name: "CHUK", aliases: ["chuk hospital", "university teaching hospital of kigali"], lat: -1.9566, lng: 30.0603 },
  { name: "University of Rwanda Nyarugenge", aliases: ["ur nyarugenge", "cst", "kist", "ur cst", "university of rwanda"], lat: -1.9586, lng: 30.0636 },
  { name: "University of Rwanda Gikondo", aliases: ["ur gikondo", "cbe", "ur cbe"], lat: -1.977, lng: 30.073 },
  { name: "University of Rwanda Remera", aliases: ["ur remera", "cmhs", "kie"], lat: -1.956, lng: 30.116 },
  { name: "ULK", aliases: ["kigali independent university", "ulk gisozi"], lat: -1.921, lng: 30.063 },
  { name: "Kigali Innovation City", aliases: ["kic", "cmu africa", "carnegie mellon", "carnegie mellon africa", "alu"], lat: -1.93, lng: 30.153 },
  { name: "Kigali International Airport", aliases: ["airport", "kanombe airport", "kgl"], lat: -1.9686, lng: 30.1395 },
  { name: "Kimironko Market", aliases: ["kimironko market", "isoko rya kimironko"], lat: -1.9365, lng: 30.1271 },
  { name: "Nyabugogo", aliases: ["nyabugogo bus park", "nyabugogo taxi park", "nyabugogo bus station"], lat: -1.9375, lng: 30.0447 },
  { name: "Amahoro Stadium", aliases: ["amahoro"], lat: -1.955, lng: 30.1163 },
  { name: "BK Arena", aliases: ["kigali arena"], lat: -1.9536, lng: 30.1175 },
  { name: "Remera Giporoso", aliases: ["giporoso", "remera bus park", "remera taxi park"], lat: -1.9575, lng: 30.111 },
  { name: "Sonatubes", aliases: ["sonatube"], lat: -1.966, lng: 30.104 },
  { name: "Kicukiro Centre", aliases: ["kicukiro center", "centre kicukiro"], lat: -1.972, lng: 30.103 },
  { name: "Kigali Golf Course", aliases: ["golf course", "kigali golf", "golf resort"], lat: -1.937, lng: 30.103 },
  { name: "Kigali Marriott", aliases: ["marriott"], lat: -1.9535, lng: 30.0617 },
  { name: "Kigali Serena", aliases: ["serena", "serena hotel"], lat: -1.9545, lng: 30.0632 },
  { name: "Kigali Genocide Memorial", aliases: ["genocide memorial", "gisozi memorial"], lat: -1.9306, lng: 30.0605 },
  { name: "Kigali Special Economic Zone", aliases: ["sez", "ksez", "special economic zone", "free zone"], lat: -1.928, lng: 30.145 },
  { name: "Nyamirambo Stadium", aliases: ["pele stadium", "kigali pele stadium", "nyamirambo regional stadium"], lat: -1.9759, lng: 30.0452 },
];

const placeKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A landmark by its name or a common alias ("KCC", "the airport"). */
export function landmarkNamed(name: string | null | undefined): Landmark | undefined {
  if (!name) return undefined;
  const key = placeKey(name).replace(/^the /, "");
  return LANDMARKS.find((l) => placeKey(l.name) === key || l.aliases.some((a) => placeKey(a) === key));
}

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
