/**
 * Marketplace zones — the unit the supply/acquisition and browse decision is made in.
 *
 * Supports Port Sudan's 45 canonical zones (sub-city granularity) and national
 * metro districts (Khartoum, Omdurman, Bahri, East Nile, Kassala, etc.).
 */

import { classifyPoint, cityNameAr, cityNameEn, type CityCode } from "./sudan-places";
import {
  getPortSudanZone,
  getPortSudanZoneLabel,
  resolvePortSudanZone,
  isPortSudanCoords,
} from "./portsudan-zones";

export {
  PORT_SUDAN_ZONES,
  PORT_SUDAN_ZONE_BY_SLUG,
  getPortSudanZone,
  getPortSudanZoneLabel,
  resolvePortSudanZone,
  searchPortSudanZones,
  isPortSudanCoords,
  type PortSudanZone,
  type PortSudanSector,
} from "./portsudan-zones";

/** Rows whose coordinates cannot be placed. Reported, never silently dropped. */
export const UNZONED = "UNZONED" as const;

/**
 * The zone for a coordinate and optional address/title text, or null when it cannot be placed.
 *
 * For Port Sudan listings, resolves to the specific sub-city zone slug (e.g. 'digna',
 * 'city-centre', 'airport-district', 'malaha', 'hadal', 'arous', etc.).
 */
export function zoneKeyFor(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  addressOrText?: string | null
): string | null {
  // 1. Try Port Sudan resolution first
  const psZone = resolvePortSudanZone(latitude, longitude, addressOrText);
  if (psZone) return psZone.slug;

  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // (0, 0) is placeholder / unlocated
  if (latitude === 0 && longitude === 0) return null;

  const hit = classifyPoint(latitude, longitude);
  if (hit.verdict === "OUTSIDE") return null;
  if (hit.city === "OTHER") return null;

  return hit.city;
}

/** Display name for a stored zone key in the viewer's language (Arabic or English). */
export function zoneLabel(key: string | null | undefined, locale: string): string | null {
  if (!key || key === UNZONED) return null;

  // 1. Check Port Sudan 45 zones
  const psLabel = getPortSudanZoneLabel(key, locale);
  if (psLabel) return psLabel;

  // 2. Check national place codes
  try {
    return locale === "ar" ? cityNameAr(key as CityCode) : cityNameEn(key as CityCode);
  } catch {
    return key;
  }
}
