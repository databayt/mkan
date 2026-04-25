import { Amenity, PropertyType } from "@prisma/client";

export interface ListingsFilterShape {
  location?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  adults?: number;
  children?: number;
  infants?: number;
  priceMin?: number;
  priceMax?: number;
  beds?: number;
  baths?: number;
  propertyType?: PropertyType;
  amenities?: Amenity[];
  page?: number;
}

const AMENITY_VALUES = new Set(Object.values(Amenity));
const PROPERTY_TYPE_VALUES = new Set(Object.values(PropertyType));

function toInt(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toFloat(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toEnum<T extends string>(
  raw: string | null | undefined,
  allowed: Set<T>,
): T | undefined {
  if (!raw || !allowed.has(raw as T)) return undefined;
  return raw as T;
}

function toAmenities(raw: string | null | undefined): Amenity[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Amenity => AMENITY_VALUES.has(s as Amenity));
  return parts.length > 0 ? parts : undefined;
}

export function parseListingsParams(
  sp: URLSearchParams | Record<string, string | undefined>,
): ListingsFilterShape {
  const get = (key: string): string | null | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(key);
    return sp[key];
  };

  // Legacy `priceRange=min,max` still emitted by old filter-bar. Split it here.
  let legacyPriceMin: number | undefined;
  let legacyPriceMax: number | undefined;
  const priceRange = get("priceRange");
  if (priceRange && typeof priceRange === "string") {
    const [lo, hi] = priceRange.split(",");
    legacyPriceMin = toInt(lo);
    legacyPriceMax = toInt(hi);
  }

  return {
    location: get("location")?.trim() || undefined,
    checkIn: get("checkIn")?.trim() || undefined,
    checkOut: get("checkOut")?.trim() || undefined,
    guests: toInt(get("guests")),
    adults: toInt(get("adults")),
    children: toInt(get("children")),
    infants: toInt(get("infants")),
    priceMin: toInt(get("priceMin")) ?? legacyPriceMin,
    priceMax: toInt(get("priceMax")) ?? legacyPriceMax,
    beds: toInt(get("beds")),
    baths: toFloat(get("baths")),
    propertyType: toEnum(get("propertyType"), PROPERTY_TYPE_VALUES),
    amenities: toAmenities(get("amenities")),
    page: toInt(get("page")),
  };
}

export function toListingsParams(input: ListingsFilterShape): URLSearchParams {
  const qs = new URLSearchParams();
  if (input.location) qs.set("location", input.location);
  if (input.checkIn) qs.set("checkIn", input.checkIn);
  if (input.checkOut) qs.set("checkOut", input.checkOut);
  if (input.guests != null && input.guests > 0) qs.set("guests", String(input.guests));
  if (input.adults != null && input.adults > 0) qs.set("adults", String(input.adults));
  if (input.children != null && input.children > 0) qs.set("children", String(input.children));
  if (input.infants != null && input.infants > 0) qs.set("infants", String(input.infants));
  if (input.priceMin != null) qs.set("priceMin", String(input.priceMin));
  if (input.priceMax != null) qs.set("priceMax", String(input.priceMax));
  if (input.beds != null && input.beds > 0) qs.set("beds", String(input.beds));
  if (input.baths != null && input.baths > 0) qs.set("baths", String(input.baths));
  if (input.propertyType) qs.set("propertyType", input.propertyType);
  if (input.amenities && input.amenities.length > 0) {
    qs.set("amenities", input.amenities.join(","));
  }
  if (input.page != null && input.page > 1) qs.set("page", String(input.page));
  return qs;
}

/**
 * Merge updates into current params. `undefined` removes the key, empty
 * arrays remove list keys. Resets `page` unless the caller explicitly
 * sets it (filter changes should start at page 1).
 */
export function mergeListingsParams(
  current: ListingsFilterShape,
  updates: Partial<ListingsFilterShape>,
): URLSearchParams {
  const merged: ListingsFilterShape = { ...current };
  for (const key of Object.keys(updates) as Array<keyof ListingsFilterShape>) {
    const value = updates[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete merged[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  if (!("page" in updates)) {
    merged.page = 1;
  }
  return toListingsParams(merged);
}
