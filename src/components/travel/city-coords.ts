import type { Coords } from "@/lib/distance";

/**
 * Approximate centres for the Sudan intercity destinations we serve.
 *
 * Mirrors the `latitude`/`longitude` on the assembly points in
 * `src/lib/constants/travel-data.ts` without importing that file — the same
 * reason `city-names.ts` keeps its own Arabic-label map. travel-data.ts carries
 * every route, operator and fare table in the country, and the city picker is a
 * client component; pulling it in to read 28 coordinate pairs would ship all of
 * that to the browser.
 *
 * Used to resolve a device position to the nearest city we actually run buses
 * from, so "Near me" picks a real origin instead of a place name we can't
 * search. City keys stay the canonical English strings that URL state and the
 * database use.
 */
export const CITY_COORDS: Record<string, Coords> = {
  Khartoum: { lat: 15.5007, lng: 32.5599 },
  Omdurman: { lat: 15.6445, lng: 32.4777 },
  // Both spellings appear in the wild — the assembly points use the
  // parenthesised form, the picker's fallback list the short one.
  "Khartoum North (Bahri)": { lat: 15.6361, lng: 32.5528 },
  "Khartoum North": { lat: 15.6361, lng: 32.5528 },
  "Port Sudan": { lat: 19.5856, lng: 37.2159 },
  Kassala: { lat: 15.4503, lng: 36.3986 },
  "Wad Madani": { lat: 14.4012, lng: 33.5199 },
  Atbara: { lat: 17.7024, lng: 33.9868 },
  Shendi: { lat: 16.6833, lng: 33.4333 },
  Dongola: { lat: 19.1753, lng: 30.4767 },
  Gedaref: { lat: 14.0333, lng: 35.3833 },
  "El Obeid": { lat: 13.1833, lng: 30.2167 },
  Sennar: { lat: 13.55, lng: 33.6167 },
  Kosti: { lat: 13.1629, lng: 32.6635 },
  Rabak: { lat: 13.1667, lng: 32.7333 },
  Karima: { lat: 18.55, lng: 31.85 },
  "Ed Damazin": { lat: 11.7667, lng: 34.35 },
  Nyala: { lat: 12.05, lng: 24.8833 },
  "El Fasher": { lat: 13.6333, lng: 25.35 },
  Kadugli: { lat: 11.0167, lng: 29.7167 },
  "Wadi Halfa": { lat: 21.8, lng: 31.35 },
  Berber: { lat: 18.0167, lng: 33.9833 },
  Sinja: { lat: 13.15, lng: 33.9333 },
  "Abu Hamed": { lat: 19.5333, lng: 33.3167 },
  "El Daein": { lat: 11.4667, lng: 26.1333 },
  "El Geneina": { lat: 13.45, lng: 22.45 },
  "Al Manaqil": { lat: 14.25, lng: 32.9833 },
  "Al Duwaym": { lat: 14.0, lng: 32.3167 },
  Dilling: { lat: 12.05, lng: 29.6333 },
};

/** Coordinates for a canonical city name, or null when we don't know it. */
export function cityCoords(city: string): Coords | null {
  return CITY_COORDS[city] ?? null;
}
