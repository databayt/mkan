/**
 * Rwanda gazetteer — what "in Kigali" means and what a Kigali coordinate is
 * called, in English, Arabic and Kinyarwanda.
 *
 * The Sudan file (`sudan-places.ts`) needs a border polygon because Sudan's
 * bounding box swallows six neighbours. Kigali does not: the city sits ~60 km
 * from the nearest border (Uganda, to the north), so a rectangle around Kigali
 * City province is all Rwanda and a box test is exact enough. What still needs
 * guarding is the same failure the Sudan crawl hit — Airbnb's placeholder
 * coordinates for listings on other continents — so `checkPlace()` keeps the
 * same corroboration rule: coordinates and Airbnb's own place string must
 * agree before a home counts as Kigali.
 *
 * Districts are classified by nearest centroid. Kigali's three districts are
 * irregular, so a home within ~1 km of a district line can land in the
 * neighbour; the district is a CRM zone label, not a legal address, and that
 * precision is enough for it.
 */

export type RwandaCityCode = 'KIGALI' | 'OTHER';
export type RwandaDistrictCode = 'GASABO' | 'KICUKIRO' | 'NYARUGENGE' | 'UNKNOWN';

export interface RwandaDistrict {
  code: Exclude<RwandaDistrictCode, 'UNKNOWN'>;
  nameEn: string;
  nameAr: string;
  nameRw: string;
  lat: number;
  lng: number;
}

export const KIGALI = {
  code: 'KIGALI' as const,
  nameEn: 'Kigali',
  nameAr: 'كيغالي',
  nameRw: 'Kigali',
  lat: -1.9441,
  lng: 30.0619,
  /** Kigali City province reaches ~20 km east (Rusororo) from the centre. */
  radiusKm: 24,
};

export const RWANDA = { nameEn: 'Rwanda', nameAr: 'رواندا', nameRw: 'u Rwanda' };

export const DISTRICTS: RwandaDistrict[] = [
  { code: 'NYARUGENGE', nameEn: 'Nyarugenge', nameAr: 'نياروغينغي', nameRw: 'Nyarugenge', lat: -1.9601, lng: 30.0430 },
  { code: 'GASABO',     nameEn: 'Gasabo',     nameAr: 'غاسابو',     nameRw: 'Gasabo',     lat: -1.8960, lng: 30.1120 },
  { code: 'KICUKIRO',   nameEn: 'Kicukiro',   nameAr: 'كيتشوكيرو',  nameRw: 'Kicukiro',   lat: -1.9900, lng: 30.1100 },
];

const DISTRICT_BY_CODE = new Map(DISTRICTS.map((d) => [d.code, d]));

/** Kigali City province with a small margin — the crawl's root viewport. */
export const KIGALI_BBOX = { swLat: -2.12, swLng: 29.95, neLat: -1.79, neLng: 30.33 };
/** The whole country, hand-rounded outward. Used only to tell "Rwanda, not Kigali" from "foreign". */
export const RWANDA_BBOX = { swLat: -2.85, swLng: 28.85, neLat: -1.04, neLng: 30.9 };

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const inBox = (lat: number, lng: number, b: typeof KIGALI_BBOX) =>
  lat >= b.swLat && lat <= b.neLat && lng >= b.swLng && lng <= b.neLng;

export const isInRwanda = (lat: number, lng: number): boolean => inBox(lat, lng, RWANDA_BBOX);
export const isInKigali = (lat: number, lng: number): boolean =>
  inBox(lat, lng, KIGALI_BBOX) && haversineKm(lat, lng, KIGALI.lat, KIGALI.lng) <= KIGALI.radiusKm;

/**
 * Kigali's 35 sectors (imirenge), approximate centres. Three district centroids
 * were not enough: the districts are long and irregular, and centroid distance
 * put Remera and Kimihurura, Gasabo's densest rental areas, in Kicukiro.
 * Airbnb's place line cannot settle it either: it names "Nyarugenge" for nearly
 * every Kigali listing. Nearest sector, then its district, is accurate to
 * roughly a sector's width at the boundaries.
 */
const SECTORS: Array<[string, Exclude<RwandaDistrictCode, 'UNKNOWN'>, number, number]> = [
  ['Gitega', 'NYARUGENGE', -1.96, 30.055], ['Kanyinya', 'NYARUGENGE', -1.93, 30.01],
  ['Kigali', 'NYARUGENGE', -1.955, 30.02], ['Kimisagara', 'NYARUGENGE', -1.959, 30.043],
  ['Mageragere', 'NYARUGENGE', -2.03, 30.02], ['Muhima', 'NYARUGENGE', -1.942, 30.056],
  ['Nyakabanda', 'NYARUGENGE', -1.968, 30.045], ['Nyamirambo', 'NYARUGENGE', -1.98, 30.04],
  ['Nyarugenge', 'NYARUGENGE', -1.95, 30.06], ['Rwezamenyo', 'NYARUGENGE', -1.972, 30.05],
  ['Bumbogo', 'GASABO', -1.89, 30.15], ['Gatsata', 'GASABO', -1.92, 30.055],
  ['Gikomero', 'GASABO', -1.86, 30.17], ['Gisozi', 'GASABO', -1.921, 30.068],
  ['Jabana', 'GASABO', -1.89, 30.05], ['Jali', 'GASABO', -1.88, 30.0],
  ['Kacyiru', 'GASABO', -1.938, 30.083], ['Kimihurura', 'GASABO', -1.95, 30.09],
  ['Kimironko', 'GASABO', -1.935, 30.127], ['Kinyinya', 'GASABO', -1.905, 30.1],
  ['Ndera', 'GASABO', -1.93, 30.17], ['Nduba', 'GASABO', -1.87, 30.1],
  ['Remera', 'GASABO', -1.955, 30.11], ['Rusororo', 'GASABO', -1.95, 30.18],
  ['Rutunga', 'GASABO', -1.82, 30.13],
  ['Gahanga', 'KICUKIRO', -2.03, 30.1], ['Gatenga', 'KICUKIRO', -1.99, 30.085],
  ['Gikondo', 'KICUKIRO', -1.975, 30.075], ['Kagarama', 'KICUKIRO', -1.995, 30.11],
  ['Kanombe', 'KICUKIRO', -1.97, 30.145], ['Kicukiro', 'KICUKIRO', -1.975, 30.103],
  ['Kigarama', 'KICUKIRO', -1.988, 30.095], ['Masaka', 'KICUKIRO', -1.995, 30.19],
  ['Niboye', 'KICUKIRO', -1.98, 30.115], ['Nyarugunga', 'KICUKIRO', -1.965, 30.13],
];

export function nearestSector(lat: number, lng: number): { sector: string; district: RwandaDistrictCode } {
  let best = SECTORS[0];
  let bestKm = Infinity;
  for (const s of SECTORS) {
    const km = haversineKm(lat, lng, s[2], s[3]);
    if (km < bestKm) {
      bestKm = km;
      best = s;
    }
  }
  return { sector: best[0], district: best[1] };
}

export function nearestDistrict(lat: number, lng: number): RwandaDistrictCode {
  return nearestSector(lat, lng).district;
}

export interface RwandaPlaceCheck {
  city: RwandaCityCode;
  state: RwandaDistrictCode;
  agreement: 'CONFIRMED' | 'COORDS_ONLY' | 'OUTSIDE_CITY' | 'SUSPECT_FOREIGN';
  note: string | null;
}

/** Last segment of Airbnb's "Kigali, Kigali City, Rwanda" (or "…، رواندا"). */
const countryOf = (subtitle: string) => subtitle.split(/[,،]/).pop()?.trim().toLowerCase() ?? '';
const isRwandaName = (s: string) => /^rwanda$/.test(s) || /^رواندا$/.test(s);
const namesKigali = (s: string | null | undefined) =>
  !!s && (/kigali|gasabo|kicukiro|nyarugenge/i.test(s) || /كيغالي|كيجالي/.test(s));
const districtFromText = (s: string): RwandaDistrictCode =>
  DISTRICTS.find((d) => new RegExp(d.nameEn, 'i').test(s))?.code ?? 'UNKNOWN';

/**
 * Decide whether a listing is a Kigali home.
 *
 * OUTSIDE_CITY is a real Rwandan listing that is not in Kigali (Musanze,
 * Rubavu…) — the crawl's viewport padding brings those in. They are not
 * foreign, but they are not this wave either, so the caller skips them.
 */
export function checkPlace(
  lat: number | null | undefined,
  lng: number | null | undefined,
  titleOrCategory: string | null | undefined,
  locationSubtitle?: string | null,
): RwandaPlaceCheck {
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const inKigali = hasCoords && isInKigali(lat!, lng!);
  const inRwanda = hasCoords && isInRwanda(lat!, lng!);
  const state = inKigali ? nearestDistrict(lat!, lng!) : 'UNKNOWN';

  if (locationSubtitle) {
    const country = countryOf(locationSubtitle);
    if (country && !isRwandaName(country)) {
      return { city: 'OTHER', state: 'UNKNOWN', agreement: 'SUSPECT_FOREIGN', note: `Airbnb places this listing in ${locationSubtitle}` };
    }
    // Airbnb's own place line outranks the radius: the city's edge is fuzzy and
    // the crawl's outer cells reach Bugesera and Kamonyi, whose homes sit
    // inside 24 km of the centre but are not Kigali.
    if (namesKigali(locationSubtitle)) {
      return { city: 'KIGALI', state: hasCoords ? nearestDistrict(lat!, lng!) : districtFromText(locationSubtitle), agreement: 'CONFIRMED', note: null };
    }
    if (inRwanda || inKigali) return { city: 'OTHER', state: 'UNKNOWN', agreement: 'OUTSIDE_CITY', note: `Rwanda, outside Kigali (${locationSubtitle})` };
    return {
      city: 'OTHER',
      state: 'UNKNOWN',
      agreement: 'SUSPECT_FOREIGN',
      note: `Airbnb says "${locationSubtitle}" but the coordinates are not in Rwanda`,
    };
  }

  if (!hasCoords) {
    return namesKigali(titleOrCategory)
      ? { city: 'KIGALI', state: 'UNKNOWN', agreement: 'CONFIRMED', note: 'no coordinates; title names Kigali' }
      : { city: 'OTHER', state: 'UNKNOWN', agreement: 'SUSPECT_FOREIGN', note: 'no coordinates and no place named' };
  }
  if (inKigali) {
    return namesKigali(titleOrCategory)
      ? { city: 'KIGALI', state, agreement: 'CONFIRMED', note: null }
      : { city: 'KIGALI', state, agreement: 'COORDS_ONLY', note: null };
  }
  if (inRwanda) return { city: 'OTHER', state: 'UNKNOWN', agreement: 'OUTSIDE_CITY', note: 'Rwanda, outside Kigali' };
  return { city: 'OTHER', state: 'UNKNOWN', agreement: 'SUSPECT_FOREIGN', note: 'coordinates fall outside Rwanda' };
}

export const districtName = (code: string, lang: 'en' | 'ar' | 'rw' = 'en'): string => {
  const d = DISTRICT_BY_CODE.get(code as RwandaDistrict['code']);
  if (!d) return '';
  return lang === 'ar' ? d.nameAr : lang === 'rw' ? d.nameRw : d.nameEn;
};

export const CITY_OPTIONS = [{ value: 'KIGALI', label: 'Kigali' }];
export const ZONE_OPTIONS = DISTRICTS.map((d) => ({ value: `KIGALI_${d.code}`, label: `Kigali — ${d.nameEn}` }));
