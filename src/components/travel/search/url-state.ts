import { BusAmenity } from '@prisma/client';

export type SortOption = 'price-asc' | 'price-desc' | 'departure-asc' | 'duration-asc';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';

export interface SearchParamsShape {
  originId?: number;
  destinationId?: number;
  origin?: string;
  destination?: string;
  date?: string;              // YYYY-MM-DD
  when?: TimeOfDay;
  priceMin?: number;
  priceMax?: number;
  amenities?: BusAmenity[];
  officeIds?: number[];
  minSeats?: number;
  sort?: SortOption;
  page?: number;
}

const TIME_OF_DAY = ['morning', 'afternoon', 'evening', 'night'] as const;
const SORT_OPTIONS = ['price-asc', 'price-desc', 'departure-asc', 'duration-asc'] as const;
const AMENITY_VALUES = new Set(Object.values(BusAmenity));

function toInt(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toIntList(raw: string | null | undefined): number[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n) && n > 0);
  return parts.length > 0 ? parts : undefined;
}

function toNum(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function toEnum<T extends string>(raw: string | null | undefined, allowed: readonly T[]): T | undefined {
  if (!raw) return undefined;
  return allowed.includes(raw as T) ? (raw as T) : undefined;
}

function toAmenities(raw: string | null | undefined): BusAmenity[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is BusAmenity => AMENITY_VALUES.has(s as BusAmenity));
  return parts.length > 0 ? parts : undefined;
}

export function parseSearchParams(
  sp: URLSearchParams | Record<string, string | undefined>,
): SearchParamsShape {
  const get = (key: string): string | null | undefined => {
    if (sp instanceof URLSearchParams) return sp.get(key);
    return sp[key];
  };

  const parsed: SearchParamsShape = {
    originId: toInt(get('originId')),
    destinationId: toInt(get('destinationId')),
    origin: get('origin')?.trim() || undefined,
    destination: get('destination')?.trim() || undefined,
    date: get('date')?.trim() || undefined,
    when: toEnum(get('when'), TIME_OF_DAY),
    priceMin: toNum(get('priceMin')),
    priceMax: toNum(get('priceMax')),
    amenities: toAmenities(get('amenities')),
    officeIds: toIntList(get('office')),
    minSeats: toInt(get('seats')),
    sort: toEnum(get('sort'), SORT_OPTIONS),
    page: toInt(get('page')),
  };

  return parsed;
}

export function toSearchParams(input: SearchParamsShape): URLSearchParams {
  const qs = new URLSearchParams();
  if (input.originId != null) qs.set('originId', String(input.originId));
  if (input.destinationId != null) qs.set('destinationId', String(input.destinationId));
  if (input.origin) qs.set('origin', input.origin);
  if (input.destination) qs.set('destination', input.destination);
  if (input.date) qs.set('date', input.date);
  if (input.when) qs.set('when', input.when);
  if (input.priceMin != null) qs.set('priceMin', String(input.priceMin));
  if (input.priceMax != null) qs.set('priceMax', String(input.priceMax));
  if (input.amenities && input.amenities.length > 0) qs.set('amenities', input.amenities.join(','));
  if (input.officeIds && input.officeIds.length > 0) qs.set('office', input.officeIds.join(','));
  if (input.minSeats != null) qs.set('seats', String(input.minSeats));
  if (input.sort && input.sort !== 'departure-asc') qs.set('sort', input.sort);
  if (input.page != null && input.page > 1) qs.set('page', String(input.page));
  return qs;
}

/**
 * Merge updates into current params and produce a new URLSearchParams.
 * `undefined` values remove the key; empty arrays remove list keys.
 */
export function mergeSearchParams(
  current: SearchParamsShape,
  updates: Partial<SearchParamsShape>,
): URLSearchParams {
  const merged: SearchParamsShape = { ...current };
  for (const key of Object.keys(updates) as Array<keyof SearchParamsShape>) {
    const value = updates[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete merged[key];
    } else {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  // Reset page to 1 when any filter changes (but not when user updates page directly)
  if (!('page' in updates)) {
    merged.page = 1;
  }
  return toSearchParams(merged);
}
