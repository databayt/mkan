/**
 * Sudan gazetteer — the single place that knows what "in Sudan" means and what
 * a coordinate should be called, in both languages.
 *
 * Four tables used to be scattered across the pipeline and had already drifted:
 *   - `deriveCity` in airbnb-parse.ts knew five cities and matched on the
 *     English title suffix, so anything outside greater Khartoum and Port Sudan
 *     collapsed into OTHER — which is why a national sweep could not be
 *     expressed even when the crawl found the listings.
 *   - `CITY_AR` / `CITY_EN` in outreach-templates.ts held six Arabic names.
 *   - `STATE_OF` was copy-pasted into mkan-import.ts and twenty-upsert.ts.
 * All four now come from here.
 *
 * ── Why there is a border polygon ───────────────────────────────────────────
 * The map crawler works in rectangles, and no rectangle is Sudan. The bounding
 * box reaches 39°E and 8°N, which also contains parts of Ethiopia, Eritrea,
 * Chad, CAR, South Sudan and Egypt. A sibling project learned this the
 * expensive way: a "Sudan" bbox scrape quietly imported 64 schools around Addis
 * Ababa, and the bad rows were only spotted much later by their +251 phone
 * numbers. `isInSudan()` is the guard against repeating that.
 *
 * Precision: the polygon is hand-simplified to ~35 vertices, so it is accurate
 * to roughly 20–50 km at the border. Errors are asymmetric — wrongly keeping a
 * foreign listing costs one manual review, wrongly dropping a Sudanese one
 * loses a home silently — so `classifyPoint()` keeps anything within
 * BORDER_BUFFER_KM of the line and flags it rather than deciding.
 */

export type CityCode =
  | 'KHARTOUM' | 'OMDURMAN' | 'BAHRI' | 'EAST_NILE'
  | 'PORT_SUDAN' | 'SUAKIN' | 'TOKAR' | 'SINKAT'
  | 'KASSALA' | 'NEW_HALFA' | 'GEDAREF'
  | 'WAD_MADANI' | 'HASAHEISA' | 'RUFAA' | 'EL_MANAGIL'
  | 'KOSTI' | 'RABAK' | 'ED_DUEIM'
  | 'SENNAR' | 'SINGA' | 'ED_DAMAZIN' | 'ER_ROSEIRES' | 'KURMUK'
  | 'ATBARA' | 'ED_DAMER' | 'SHENDI' | 'BERBER' | 'ABU_HAMAD'
  | 'DONGOLA' | 'MEROWE' | 'KARIMA' | 'WADI_HALFA'
  | 'EL_OBEID' | 'UMM_RUWABA' | 'BARA'
  | 'EN_NUHUD' | 'EL_FULA' | 'BABANUSA' | 'MUGLAD'
  | 'KADUGLI' | 'DILLING' | 'TALODI'
  | 'NYALA' | 'EL_FASHER' | 'EL_GENEINA' | 'ED_DAEIN' | 'ZALINGEI'
  | 'KUTUM' | 'KABKABIYA'
  | 'OTHER';

export type StateCode =
  | 'KHARTOUM' | 'RED_SEA' | 'KASSALA' | 'GEDAREF' | 'GEZIRA' | 'WHITE_NILE'
  | 'BLUE_NILE' | 'SENNAR' | 'RIVER_NILE' | 'NORTHERN' | 'NORTH_KORDOFAN'
  | 'SOUTH_KORDOFAN' | 'WEST_KORDOFAN' | 'NORTH_DARFUR' | 'SOUTH_DARFUR'
  | 'WEST_DARFUR' | 'EAST_DARFUR' | 'CENTRAL_DARFUR' | 'UNKNOWN';

export interface SudanState {
  code: StateCode;
  nameEn: string;
  nameAr: string;
  lat: number;
  lng: number;
}

export interface SudanPlace {
  code: CityCode;
  nameEn: string;
  nameAr: string;
  state: StateCode;
  lat: number;
  lng: number;
  /** How far from the centroid still counts as this place. */
  radiusKm: number;
  /** Alternative spellings seen in Airbnb titles, lowercased. */
  aliases?: string[];
}

// ── states ───────────────────────────────────────────────────────────────────

export const STATES: SudanState[] = [
  { code: 'KHARTOUM',       nameEn: 'Khartoum',       nameAr: 'الخرطوم',      lat: 15.55, lng: 32.55 },
  { code: 'RED_SEA',        nameEn: 'Red Sea',        nameAr: 'البحر الأحمر', lat: 19.50, lng: 36.50 },
  { code: 'KASSALA',        nameEn: 'Kassala',        nameAr: 'كسلا',         lat: 15.50, lng: 36.00 },
  { code: 'GEDAREF',        nameEn: 'Gedaref',        nameAr: 'القضارف',      lat: 14.00, lng: 35.40 },
  { code: 'GEZIRA',         nameEn: 'Al Jazirah',     nameAr: 'الجزيرة',      lat: 14.40, lng: 33.20 },
  { code: 'WHITE_NILE',     nameEn: 'White Nile',     nameAr: 'النيل الأبيض', lat: 13.30, lng: 32.50 },
  { code: 'BLUE_NILE',      nameEn: 'Blue Nile',      nameAr: 'النيل الأزرق', lat: 11.50, lng: 34.20 },
  { code: 'SENNAR',         nameEn: 'Sennar',         nameAr: 'سنار',         lat: 13.40, lng: 33.80 },
  { code: 'RIVER_NILE',     nameEn: 'River Nile',     nameAr: 'نهر النيل',    lat: 17.80, lng: 33.80 },
  { code: 'NORTHERN',       nameEn: 'Northern',       nameAr: 'الشمالية',     lat: 19.50, lng: 30.50 },
  { code: 'NORTH_KORDOFAN', nameEn: 'North Kordofan', nameAr: 'شمال كردفان',  lat: 13.50, lng: 30.30 },
  { code: 'SOUTH_KORDOFAN', nameEn: 'South Kordofan', nameAr: 'جنوب كردفان',  lat: 11.30, lng: 29.80 },
  { code: 'WEST_KORDOFAN',  nameEn: 'West Kordofan',  nameAr: 'غرب كردفان',   lat: 11.80, lng: 28.30 },
  { code: 'NORTH_DARFUR',   nameEn: 'North Darfur',   nameAr: 'شمال دارفور',  lat: 15.00, lng: 25.50 },
  { code: 'SOUTH_DARFUR',   nameEn: 'South Darfur',   nameAr: 'جنوب دارفور',  lat: 11.70, lng: 25.00 },
  { code: 'WEST_DARFUR',    nameEn: 'West Darfur',    nameAr: 'غرب دارفور',   lat: 13.20, lng: 22.70 },
  { code: 'EAST_DARFUR',    nameEn: 'East Darfur',    nameAr: 'شرق دارفور',   lat: 11.50, lng: 26.30 },
  { code: 'CENTRAL_DARFUR', nameEn: 'Central Darfur', nameAr: 'وسط دارفور',   lat: 12.70, lng: 23.40 },
];

// ── places ───────────────────────────────────────────────────────────────────
//
// The tri-city (Khartoum / Omdurman / Bahri) sits inside ~15 km, so those carry
// deliberately tight radii and are resolved by nearest centroid — a generous
// radius there would let whichever is listed first swallow the other two.

export const PLACES: SudanPlace[] = [
  // Greater Khartoum
  { code: 'KHARTOUM',   nameEn: 'Khartoum',        nameAr: 'الخرطوم',        state: 'KHARTOUM',   lat: 15.5007, lng: 32.5599, radiusKm: 14, aliases: ['khartoum', 'al khartoum', 'riyadh', 'arkaweet', 'amarat', 'al amarat', 'burri', 'taif', 'kalakla', 'jabra', 'soba'] },
  { code: 'OMDURMAN',   nameEn: 'Omdurman',        nameAr: 'أم درمان',       state: 'KHARTOUM',   lat: 15.6445, lng: 32.4777, radiusKm: 16, aliases: ['omdurman', 'umm durman', 'ombada', 'karari'] },
  { code: 'BAHRI',      nameEn: 'Khartoum North',  nameAr: 'الخرطوم بحري',   state: 'KHARTOUM',   lat: 15.6394, lng: 32.5497, radiusKm: 12, aliases: ['bahri', 'khartoum north', 'kafouri', 'shambat', 'halfaya'] },
  { code: 'EAST_NILE',  nameEn: 'East Nile',       nameAr: 'شرق النيل',      state: 'KHARTOUM',   lat: 15.6000, lng: 32.6800, radiusKm: 14, aliases: ['east nile', 'sharq al nil', 'haj yousif'] },

  // Red Sea
  { code: 'PORT_SUDAN', nameEn: 'Port Sudan',      nameAr: 'بورتسودان',      state: 'RED_SEA',    lat: 19.6158, lng: 37.2164, radiusKm: 25, aliases: ['port sudan', 'portsudan', 'bur sudan'] },
  { code: 'SUAKIN',     nameEn: 'Suakin',          nameAr: 'سواكن',          state: 'RED_SEA',    lat: 19.1059, lng: 37.3321, radiusKm: 20, aliases: ['suakin', 'sawakin'] },
  { code: 'TOKAR',      nameEn: 'Tokar',           nameAr: 'طوكر',           state: 'RED_SEA',    lat: 18.4264, lng: 37.7292, radiusKm: 20, aliases: ['tokar'] },
  { code: 'SINKAT',     nameEn: 'Sinkat',          nameAr: 'سنكات',          state: 'RED_SEA',    lat: 18.8333, lng: 36.8333, radiusKm: 20, aliases: ['sinkat'] },

  // Kassala / Gedaref
  { code: 'KASSALA',    nameEn: 'Kassala',         nameAr: 'كسلا',           state: 'KASSALA',    lat: 15.4510, lng: 36.4000, radiusKm: 25, aliases: ['kassala'] },
  { code: 'NEW_HALFA',  nameEn: 'New Halfa',       nameAr: 'حلفا الجديدة',   state: 'KASSALA',    lat: 15.3167, lng: 35.6000, radiusKm: 20, aliases: ['new halfa', 'halfa al jadida'] },
  { code: 'GEDAREF',    nameEn: 'Gedaref',         nameAr: 'القضارف',        state: 'GEDAREF',    lat: 14.0354, lng: 35.3837, radiusKm: 25, aliases: ['gedaref', 'al qadarif', 'gadarif'] },

  // Gezira
  { code: 'WAD_MADANI', nameEn: 'Wad Madani',      nameAr: 'ود مدني',        state: 'GEZIRA',     lat: 14.4013, lng: 33.5199, radiusKm: 22, aliases: ['wad madani', 'madani', 'wad medani'] },
  { code: 'HASAHEISA',  nameEn: 'Hasaheisa',       nameAr: 'الحصاحيصا',      state: 'GEZIRA',     lat: 14.7500, lng: 33.2833, radiusKm: 18, aliases: ['hasaheisa', 'hasahisa'] },
  { code: 'RUFAA',      nameEn: 'Rufaa',           nameAr: 'رفاعة',          state: 'GEZIRA',     lat: 14.7667, lng: 33.3667, radiusKm: 15, aliases: ['rufaa'] },
  { code: 'EL_MANAGIL', nameEn: 'El Managil',      nameAr: 'المناقل',        state: 'GEZIRA',     lat: 14.2500, lng: 32.9833, radiusKm: 18, aliases: ['managil', 'el managil'] },

  // White Nile
  { code: 'KOSTI',      nameEn: 'Kosti',           nameAr: 'كوستي',          state: 'WHITE_NILE', lat: 13.1629, lng: 32.6635, radiusKm: 20, aliases: ['kosti'] },
  { code: 'RABAK',      nameEn: 'Rabak',           nameAr: 'ربك',            state: 'WHITE_NILE', lat: 13.1833, lng: 32.7333, radiusKm: 15, aliases: ['rabak'] },
  { code: 'ED_DUEIM',   nameEn: 'Ed Dueim',        nameAr: 'الدويم',         state: 'WHITE_NILE', lat: 14.0000, lng: 32.3167, radiusKm: 20, aliases: ['ed dueim', 'dueim', 'ad duwaym'] },

  // Sennar / Blue Nile
  { code: 'SENNAR',     nameEn: 'Sennar',          nameAr: 'سنار',           state: 'SENNAR',     lat: 13.5500, lng: 33.6167, radiusKm: 20, aliases: ['sennar', 'sinnar'] },
  { code: 'SINGA',      nameEn: 'Singa',           nameAr: 'سنجة',           state: 'SENNAR',     lat: 13.1500, lng: 33.9333, radiusKm: 18, aliases: ['singa', 'sinja'] },
  { code: 'ED_DAMAZIN', nameEn: 'Ed Damazin',      nameAr: 'الدمازين',       state: 'BLUE_NILE',  lat: 11.7891, lng: 34.3592, radiusKm: 22, aliases: ['ed damazin', 'damazin'] },
  { code: 'ER_ROSEIRES',nameEn: 'Er Roseires',     nameAr: 'الروصيرص',       state: 'BLUE_NILE',  lat: 11.8500, lng: 34.3833, radiusKm: 15, aliases: ['roseires', 'er roseires'] },
  { code: 'KURMUK',     nameEn: 'Kurmuk',          nameAr: 'الكرمك',         state: 'BLUE_NILE',  lat: 10.5500, lng: 34.2833, radiusKm: 18, aliases: ['kurmuk'] },

  // River Nile
  { code: 'ATBARA',     nameEn: 'Atbara',          nameAr: 'عطبرة',          state: 'RIVER_NILE', lat: 17.7022, lng: 33.9865, radiusKm: 20, aliases: ['atbara'] },
  { code: 'ED_DAMER',   nameEn: 'Ed Damer',        nameAr: 'الدامر',         state: 'RIVER_NILE', lat: 17.5900, lng: 33.9700, radiusKm: 12, aliases: ['ed damer', 'damer'] },
  { code: 'SHENDI',     nameEn: 'Shendi',          nameAr: 'شندي',           state: 'RIVER_NILE', lat: 16.6917, lng: 33.4333, radiusKm: 20, aliases: ['shendi'] },
  { code: 'BERBER',     nameEn: 'Berber',          nameAr: 'بربر',           state: 'RIVER_NILE', lat: 18.0167, lng: 33.9833, radiusKm: 18, aliases: ['berber'] },
  { code: 'ABU_HAMAD',  nameEn: 'Abu Hamad',       nameAr: 'أبو حمد',        state: 'RIVER_NILE', lat: 19.5333, lng: 33.3167, radiusKm: 20, aliases: ['abu hamad', 'abu hamed'] },

  // Northern
  { code: 'DONGOLA',    nameEn: 'Dongola',         nameAr: 'دنقلا',          state: 'NORTHERN',   lat: 19.1680, lng: 30.4750, radiusKm: 25, aliases: ['dongola', 'dunqulah'] },
  { code: 'MEROWE',     nameEn: 'Merowe',          nameAr: 'مروي',           state: 'NORTHERN',   lat: 18.4667, lng: 31.8167, radiusKm: 18, aliases: ['merowe', 'meroe'] },
  { code: 'KARIMA',     nameEn: 'Karima',          nameAr: 'كريمة',          state: 'NORTHERN',   lat: 18.5500, lng: 31.8500, radiusKm: 12, aliases: ['karima'] },
  { code: 'WADI_HALFA', nameEn: 'Wadi Halfa',      nameAr: 'وادي حلفا',      state: 'NORTHERN',   lat: 21.8000, lng: 31.3500, radiusKm: 25, aliases: ['wadi halfa', 'halfa'] },

  // Kordofan
  { code: 'EL_OBEID',   nameEn: 'El Obeid',        nameAr: 'الأبيض',         state: 'NORTH_KORDOFAN', lat: 13.1839, lng: 30.2176, radiusKm: 25, aliases: ['el obeid', 'al ubayyid', 'obeid'] },
  { code: 'UMM_RUWABA', nameEn: 'Umm Ruwaba',      nameAr: 'أم روابة',       state: 'NORTH_KORDOFAN', lat: 12.9061, lng: 31.2136, radiusKm: 20, aliases: ['umm ruwaba'] },
  { code: 'BARA',       nameEn: 'Bara',            nameAr: 'بارا',           state: 'NORTH_KORDOFAN', lat: 13.7000, lng: 30.3667, radiusKm: 18, aliases: ['bara'] },
  { code: 'EN_NUHUD',   nameEn: 'En Nuhud',        nameAr: 'النهود',         state: 'WEST_KORDOFAN',  lat: 12.7000, lng: 28.4333, radiusKm: 22, aliases: ['en nuhud', 'nuhud'] },
  { code: 'EL_FULA',    nameEn: 'El Fula',         nameAr: 'الفولة',         state: 'WEST_KORDOFAN',  lat: 11.7333, lng: 28.3500, radiusKm: 20, aliases: ['el fula', 'fula'] },
  { code: 'BABANUSA',   nameEn: 'Babanusa',        nameAr: 'بابنوسة',        state: 'WEST_KORDOFAN',  lat: 11.3333, lng: 27.8000, radiusKm: 20, aliases: ['babanusa'] },
  { code: 'MUGLAD',     nameEn: 'Muglad',          nameAr: 'المجلد',         state: 'WEST_KORDOFAN',  lat: 11.0333, lng: 27.7333, radiusKm: 20, aliases: ['muglad'] },
  { code: 'KADUGLI',    nameEn: 'Kadugli',         nameAr: 'كادقلي',         state: 'SOUTH_KORDOFAN', lat: 11.0111, lng: 29.7176, radiusKm: 22, aliases: ['kadugli'] },
  { code: 'DILLING',    nameEn: 'Dilling',         nameAr: 'الدلنج',         state: 'SOUTH_KORDOFAN', lat: 12.0500, lng: 29.6500, radiusKm: 20, aliases: ['dilling'] },
  { code: 'TALODI',     nameEn: 'Talodi',          nameAr: 'تلودي',          state: 'SOUTH_KORDOFAN', lat: 10.6333, lng: 30.3833, radiusKm: 20, aliases: ['talodi'] },

  // Darfur
  { code: 'NYALA',      nameEn: 'Nyala',           nameAr: 'نيالا',          state: 'SOUTH_DARFUR',   lat: 12.0489, lng: 24.8807, radiusKm: 25, aliases: ['nyala'] },
  { code: 'EL_FASHER',  nameEn: 'El Fasher',       nameAr: 'الفاشر',         state: 'NORTH_DARFUR',   lat: 13.6279, lng: 25.3494, radiusKm: 25, aliases: ['el fasher', 'al fashir', 'fasher'] },
  { code: 'EL_GENEINA', nameEn: 'El Geneina',      nameAr: 'الجنينة',        state: 'WEST_DARFUR',    lat: 13.4526, lng: 22.4450, radiusKm: 25, aliases: ['el geneina', 'geneina', 'al junaynah'] },
  { code: 'ED_DAEIN',   nameEn: 'Ed Daein',        nameAr: 'الضعين',         state: 'EAST_DARFUR',    lat: 11.4614, lng: 26.1250, radiusKm: 22, aliases: ['ed daein', 'daein'] },
  { code: 'ZALINGEI',   nameEn: 'Zalingei',        nameAr: 'زالنجي',         state: 'CENTRAL_DARFUR', lat: 12.9096, lng: 23.4836, radiusKm: 22, aliases: ['zalingei', 'zalingi'] },
  { code: 'KUTUM',      nameEn: 'Kutum',           nameAr: 'كتم',            state: 'NORTH_DARFUR',   lat: 14.2000, lng: 24.6667, radiusKm: 20, aliases: ['kutum'] },
  { code: 'KABKABIYA',  nameEn: 'Kabkabiya',       nameAr: 'كبكابية',        state: 'NORTH_DARFUR',   lat: 13.6500, lng: 24.0833, radiusKm: 20, aliases: ['kabkabiya'] },
];

// ── border ───────────────────────────────────────────────────────────────────

/**
 * Sudan's land + sea border, simplified, as [lat, lng] going clockwise from the
 * Libya/Egypt tripoint. Includes the Hala'ib Triangle (Sudan claims it; it is
 * empty enough that the choice does not affect listing data either way).
 */
export const SUDAN_BORDER: Array<[number, number]> = [
  // Egypt, along the 22°N line, west → east
  [22.00, 25.00], [22.00, 28.00], [22.00, 31.00], [22.00, 34.00], [22.00, 36.87],
  // Hala'ib Triangle, north then out to the coast
  [23.15, 36.87], [23.15, 37.30],
  // Red Sea coast, north → south
  [22.00, 36.95], [21.00, 37.10], [20.00, 37.22], [19.60, 37.25],
  [18.50, 37.80], [18.00, 38.10], [17.40, 38.55],
  // Eritrea, south-west
  [17.00, 38.40], [16.00, 37.40], [15.00, 36.60], [14.50, 36.45],
  // Ethiopia, south
  [14.00, 36.40], [13.00, 36.20], [12.00, 36.10], [11.00, 35.00],
  [10.20, 34.60], [9.80, 34.10],
  // South Sudan, east → west
  [9.90, 33.20], [10.20, 32.50], [9.70, 31.00], [9.50, 29.50],
  [9.60, 28.50], [10.20, 27.50], [9.80, 26.50], [9.50, 25.00], [9.60, 24.20],
  // Central African Republic, north-west
  [10.30, 23.50], [11.00, 22.90],
  // Chad, north — the 21.9°E vertex is Darfur's westernmost point
  [12.20, 22.20], [13.20, 21.90], [14.20, 22.10], [15.50, 22.90],
  [16.50, 23.60], [18.00, 23.90], [19.50, 24.00],
  // Libya, north-east back to the tripoint
  [20.50, 24.20],
];

/** Bounding box of the polygon — the rectangle the map crawler seeds from. */
export const SUDAN_BBOX = { swLat: 8.0, swLng: 21.5, neLat: 23.2, neLng: 39.0 };

/** Within this distance of the border, we keep the point and flag it. */
export const BORDER_BUFFER_KM = 25;

// ── geometry ─────────────────────────────────────────────────────────────────

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Ray casting against the simplified border. */
export function isInSudan(lat: number, lng: number): boolean {
  let inside = false;
  for (let i = 0, j = SUDAN_BORDER.length - 1; i < SUDAN_BORDER.length; j = i++) {
    const [latI, lngI] = SUDAN_BORDER[i];
    const [latJ, lngJ] = SUDAN_BORDER[j];
    const straddles = latI > lat !== latJ > lat;
    if (straddles && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

/** Approximate distance to the border, as the shortest distance to any edge. */
export function kmToBorder(lat: number, lng: number): number {
  let best = Infinity;
  for (let i = 0, j = SUDAN_BORDER.length - 1; i < SUDAN_BORDER.length; j = i++) {
    const [aLat, aLng] = SUDAN_BORDER[j];
    const [bLat, bLng] = SUDAN_BORDER[i];
    // Project onto the segment in degree space, then measure in km. Fine at
    // this scale and far cheaper than a proper geodesic projection.
    const dLat = bLat - aLat;
    const dLng = bLng - aLng;
    const len2 = dLat * dLat + dLng * dLng;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((lat - aLat) * dLat + (lng - aLng) * dLng) / len2));
    best = Math.min(best, haversineKm(lat, lng, aLat + t * dLat, aLng + t * dLng));
  }
  return best;
}

// ── greater Khartoum ─────────────────────────────────────────────────────────
//
// Khartoum, Omdurman and Bahri sit within ~15 km of each other, so a
// nearest-centroid match cannot separate them: the Riyadh district is 7.5 km
// from Bahri's centroid and 8.1 km from Khartoum's, and lands in the wrong one.
// The real boundaries are the rivers, and locals use them:
//
//   · west of the White Nile / main Nile        → Omdurman
//   · north of the Blue Nile                    → Bahri (or East Nile, further east)
//   · the wedge between the two rivers          → Khartoum
//
// Two monotone polylines are enough to express that.

/** Blue Nile, west → east from the confluence: [lng, lat]. */
const BLUE_NILE: Array<[number, number]> = [
  [32.490, 15.620], [32.560, 15.600], [32.620, 15.575], [32.700, 15.545], [32.790, 15.510],
];

/** White Nile below the confluence and the main Nile above it: [lat, lng]. */
const NILE_MERIDIAN: Array<[number, number]> = [
  [15.380, 32.530], [15.480, 32.520], [15.560, 32.510], // White Nile, south → north
  [15.620, 32.490],                                     // confluence
  [15.680, 32.470], [15.750, 32.430], [15.850, 32.400], // main Nile, heading north
];

/** Linear interpolation along a polyline, clamped at both ends. */
function interp(points: Array<[number, number]>, x: number): number {
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/** The tri-city lives inside this box; outside it the river rule is meaningless. */
const GREATER_KHARTOUM = { swLat: 15.30, swLng: 32.30, neLat: 15.90, neLng: 32.90 };

export function isGreaterKhartoum(lat: number, lng: number): boolean {
  return (
    lat >= GREATER_KHARTOUM.swLat && lat <= GREATER_KHARTOUM.neLat &&
    lng >= GREATER_KHARTOUM.swLng && lng <= GREATER_KHARTOUM.neLng
  );
}

/** Which of the three cities (or East Nile) a greater-Khartoum point falls in. */
export function classifyGreaterKhartoum(lat: number, lng: number): CityCode {
  if (lng < interp(NILE_MERIDIAN, lat)) return 'OMDURMAN';
  if (lat > interp(BLUE_NILE, lng)) return lng >= 32.62 ? 'EAST_NILE' : 'BAHRI';
  return 'KHARTOUM';
}

// ── classification ───────────────────────────────────────────────────────────

export type PointVerdict = 'IN_SUDAN' | 'BORDERLINE' | 'OUTSIDE';

export interface PlaceHit {
  verdict: PointVerdict;
  city: CityCode;
  state: StateCode;
  /** Distance to the matched place centroid, km. Null when nothing matched. */
  km: number | null;
  kmToBorder: number;
}

/**
 * The one function the pipeline should call for a coordinate.
 *
 * BORDERLINE is deliberate: near the line the polygon is not accurate enough to
 * decide, and dropping a real Sudanese home is the worse error, so the caller
 * keeps the row and a human resolves it.
 */
export function classifyPoint(lat: number | null | undefined, lng: number | null | undefined): PlaceHit {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { verdict: 'OUTSIDE', city: 'OTHER', state: 'UNKNOWN', km: null, kmToBorder: Infinity };
  }
  const border = kmToBorder(lat, lng);
  const inside = isInSudan(lat, lng);
  const verdict: PointVerdict = inside ? 'IN_SUDAN' : border <= BORDER_BUFFER_KM ? 'BORDERLINE' : 'OUTSIDE';

  if (verdict === 'OUTSIDE') {
    return { verdict, city: 'OTHER', state: 'UNKNOWN', km: null, kmToBorder: border };
  }

  // The tri-city is decided by the rivers, not by centroid distance.
  if (isGreaterKhartoum(lat, lng)) {
    const city = classifyGreaterKhartoum(lat, lng);
    const place = PLACE_BY_CODE.get(city)!;
    return { verdict, city, state: 'KHARTOUM', km: haversineKm(lat, lng, place.lat, place.lng), kmToBorder: border };
  }

  let bestPlace: SudanPlace | null = null;
  let bestKm = Infinity;
  for (const p of PLACES) {
    const km = haversineKm(lat, lng, p.lat, p.lng);
    if (km <= p.radiusKm && km < bestKm) {
      bestKm = km;
      bestPlace = p;
    }
  }
  if (bestPlace) return { verdict, city: bestPlace.code, state: bestPlace.state, km: bestKm, kmToBorder: border };

  // No town matched — still name the state, so nothing lands in an unlabelled
  // bucket and a wave can be planned by region.
  let bestState: SudanState = STATES[0];
  let bestStateKm = Infinity;
  for (const s of STATES) {
    const km = haversineKm(lat, lng, s.lat, s.lng);
    if (km < bestStateKm) {
      bestStateKm = km;
      bestState = s;
    }
  }
  return { verdict, city: 'OTHER', state: bestState.code, km: null, kmToBorder: border };
}

export type PlaceAgreement = 'CONFIRMED' | 'COORDS_ONLY' | 'CONFLICT' | 'SUSPECT_FOREIGN';

export interface PlaceCheck extends PlaceHit {
  titleCity: CityCode;
  agreement: PlaceAgreement;
  note: string | null;
}

/**
 * Decide whether a listing really is in Sudan, using the coordinates AND the
 * place name Airbnb prints in the card category ("Apartment in Hikkaduwa").
 *
 * Coordinates alone are not enough. Airbnb serves placeholder coordinates for
 * some listings, and in the existing scrape two of them — a villa in Hikkaduwa,
 * Sri Lanka and a home in Sioux Falls, South Dakota — carry near-identical fake
 * points ~200 m apart that land in North Kordofan, 360 km from any border. Both
 * descriptions name their real location. A coordinates-only filter keeps them.
 *
 * So we require corroboration. The asymmetry still holds — a real Sudanese
 * listing in a village the gazetteer does not know (Arous, on the Red Sea coast)
 * is confirmed by its title naming Port Sudan, not dropped.
 */
export function checkPlace(
  lat: number | null | undefined,
  lng: number | null | undefined,
  titleOrCategory: string | null | undefined,
): PlaceCheck {
  const hit = classifyPoint(lat, lng);
  const titleCity = deriveCityFromTitle(titleOrCategory);

  if (hit.verdict === 'OUTSIDE') {
    return { ...hit, titleCity, agreement: 'SUSPECT_FOREIGN', note: 'coordinates fall outside Sudan' };
  }
  if (titleCity !== 'OTHER' && hit.city !== 'OTHER') {
    return titleCity === hit.city
      ? { ...hit, titleCity, agreement: 'CONFIRMED', note: null }
      : {
          ...hit,
          titleCity,
          agreement: 'CONFLICT',
          note: `title says ${titleCity}, coordinates say ${hit.city}`,
        };
  }
  if (titleCity !== 'OTHER') {
    // Named a Sudanese place; coordinates just fall outside any town radius.
    return { ...hit, titleCity, agreement: 'CONFIRMED', note: hit.city === 'OTHER' ? 'outside any town radius' : null };
  }
  if (hit.city !== 'OTHER') {
    return { ...hit, titleCity, agreement: 'COORDS_ONLY', note: null };
  }
  return {
    ...hit,
    titleCity,
    agreement: 'SUSPECT_FOREIGN',
    note: 'no Sudanese place named in the title and coordinates match no town',
  };
}

/** Coordinates are authoritative; this is the fallback when they are missing. */
export function deriveCityFromTitle(title: string | null | undefined): CityCode {
  const s = (title ?? '').toLowerCase();
  if (!s) return 'OTHER';
  // Longest alias first so "khartoum north" cannot be won by "khartoum".
  const byLength = PLACES.flatMap((p) => (p.aliases ?? []).map((a) => ({ alias: a, code: p.code })))
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, code } of byLength) if (s.includes(alias)) return code;
  return 'OTHER';
}

// ── lookups ──────────────────────────────────────────────────────────────────

const PLACE_BY_CODE = new Map(PLACES.map((p) => [p.code, p]));
const STATE_BY_CODE = new Map(STATES.map((s) => [s.code, s]));

export const cityNameEn = (code: CityCode): string => PLACE_BY_CODE.get(code)?.nameEn ?? 'Sudan';
export const cityNameAr = (code: CityCode): string => PLACE_BY_CODE.get(code)?.nameAr ?? 'السودان';
export const stateNameEn = (code: StateCode): string => STATE_BY_CODE.get(code)?.nameEn ?? 'Sudan';
export const stateNameAr = (code: StateCode): string => STATE_BY_CODE.get(code)?.nameAr ?? 'السودان';

/** The state a city belongs to — replaces the STATE_OF maps that were copied
 *  into mkan-import.ts and twenty-upsert.ts. */
export const stateOfCity = (code: CityCode): StateCode => PLACE_BY_CODE.get(code)?.state ?? 'UNKNOWN';

/** Twenty SELECT options, in declaration order. */
export const CITY_OPTIONS = [...PLACES.map((p) => ({ value: p.code, label: p.nameEn })), { value: 'OTHER', label: 'Other' }];
export const STATE_OPTIONS = [...STATES.map((s) => ({ value: s.code, label: s.nameEn })), { value: 'UNKNOWN', label: 'Unknown' }];
