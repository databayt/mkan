/**
 * Marketplace zones — the unit the supply/acquisition decision is made in.
 *
 * A thin wrapper over the Sudan gazetteer rather than a second location system.
 * `Location.city` already exists but is free text written at import time, and
 * measured against the coordinates it is wrong for 20% of live listings: 16
 * rows filed as "Khartoum" sit across the Blue Nile in Bahri, 10 are in
 * Omdurman. Acquisition planned on that column sends the team to the wrong
 * side of the river, so zones are derived from coordinates instead.
 *
 * Granularity is city / metro district (Khartoum, Omdurman, Bahri, East Nile,
 * Port Sudan, …). It is deliberately NOT finer: the gazetteer folds
 * neighbourhoods in as aliases, so sub-city zones would mean inventing
 * centroids for Arkaweet, Amarat and the rest, and a wrong centroid silently
 * misfiles listings while looking authoritative. "Acquire in Omdurman" is a
 * real instruction; a fabricated neighbourhood boundary is not.
 */

import { classifyPoint, cityNameAr, cityNameEn, type CityCode } from "./sudan-places";

/** Rows whose coordinates cannot be placed. Reported, never silently dropped. */
export const UNZONED = "UNZONED" as const;

/**
 * The zone for a coordinate, or null when it cannot be placed.
 *
 * Null rather than a catch-all bucket so the caller decides how to present
 * "we don't know" — a zone table that quietly lumps unplaceable listings into
 * a real city would overstate that city's supply.
 */
export function zoneKeyFor(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // (0, 0) is the Gulf of Guinea and is what the importer writes when Airbnb
  // returned no coordinate — a real value in the column, not a real place.
  if (latitude === 0 && longitude === 0) return null;

  const hit = classifyPoint(latitude, longitude);
  if (hit.verdict === "OUTSIDE") return null;
  if (hit.city === "OTHER") return null;

  return hit.city;
}

/** Display name for a stored zone key, in the viewer's language. */
export function zoneLabel(key: string | null | undefined, locale: string): string | null {
  if (!key || key === UNZONED) return null;
  return locale === "ar" ? cityNameAr(key as CityCode) : cityNameEn(key as CityCode);
}
