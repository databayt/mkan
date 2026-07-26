/**
 * Airbnb amenity strings → the mkan `Amenity` enum (docs/growth.md §4.4).
 *
 * This table was copy-pasted into both mkan-import.ts and twenty-upsert.ts,
 * once as `Amenity` enum members and once as bare strings. Two copies of a
 * regex table drift, and when they do the CRM and the app disagree about what
 * a listing offers — so it lives here now and both import it.
 *
 * Arabic rules matter as much as English ones: the AR PDP pass returns Airbnb's
 * Arabic amenity labels, and for a listing whose English capture failed those
 * are the only amenity strings we have.
 *
 * Display is a separate concern — `Amenity` values are rendered through
 * `rental.property.amenities` in en.json/ar.json, and `scripts/dev-i18n-sync.ts`
 * fails the build if any enum member lacks a label in either locale. So these
 * rules only need to *recognise* Arabic, never to produce it.
 */

/** Mirrors the Prisma `Amenity` enum. Kept as a string union so this module
 *  stays importable from scripts that must not pull in @prisma/client. */
export type AmenityName =
  | 'WasherDryer' | 'AirConditioning' | 'Dishwasher' | 'HighSpeedInternet'
  | 'HardwoodFloors' | 'WalkInClosets' | 'Microwave' | 'Refrigerator'
  | 'Pool' | 'Gym' | 'Parking' | 'PetsAllowed' | 'WiFi';

export const AMENITY_RULES: Array<[RegExp, AmenityName]> = [
  // Order matters: HighSpeedInternet is a refinement of WiFi, so the specific
  // pattern is listed after and both may match — the result is a set.
  [/wi-?fi|واي\s*فاي|وايفاي|إنترنت|انترنت|نت\b/i, 'WiFi'],
  [/fast wifi|\d+\s*mbps|إنترنت\s*سريع|انترنت\s*سريع|واي\s*فاي\s*سريع/i, 'HighSpeedInternet'],
  [/air ?condition|\ba\/?c\b|تكييف|مكيف|مكيّف/i, 'AirConditioning'],
  [/washer|dryer|washing machine|غسالة|غسّالة|مجفف|نشافة/i, 'WasherDryer'],
  [/dishwasher|غسالة\s*صحون|جلاية/i, 'Dishwasher'],
  [/microwave|مايكروويف|ميكروويف|ميكرويف/i, 'Microwave'],
  [/fridge|refrigerator|ثلاجة|براد/i, 'Refrigerator'],
  [/pool|مسبح|حمام\s*سباحة|بركة\s*سباحة/i, 'Pool'],
  [/gym|exercise equipment|صالة\s*رياضية|نادي\s*رياضي|جيم|صالة\s*ألعاب/i, 'Gym'],
  [/parking|موقف|مواقف|جراج|كراج|مرآب/i, 'Parking'],
  [/pets? allowed|يسمح\s*بالحيوانات|الحيوانات\s*الأليفة\s*مسموح/i, 'PetsAllowed'],
  [/walk-?in closet|خزانة\s*ملابس|دولاب\s*ملابس/i, 'WalkInClosets'],
  [/hardwood|أرضيات\s*خشبية|باركيه/i, 'HardwoodFloors'],
];

/**
 * Map raw amenity strings onto the enum. Accepts several capture passes (EN and
 * AR) at once, because a listing's Arabic labels can name amenities its English
 * ones omitted, and vice versa.
 */
export function mapAmenities(...rawGroups: Array<string[] | null | undefined>): AmenityName[] {
  const set = new Set<AmenityName>();
  for (const group of rawGroups) {
    for (const raw of group ?? []) {
      for (const [re, name] of AMENITY_RULES) if (re.test(raw)) set.add(name);
    }
  }
  return [...set];
}

/**
 * Amenity strings no rule recognised. Surfacing these is the point: an
 * unmapped label is either a gap in the table or a gap in the `Amenity` enum,
 * and silently dropping it hides both.
 */
export function unmappedAmenities(...rawGroups: Array<string[] | null | undefined>): string[] {
  const out = new Set<string>();
  for (const group of rawGroups) {
    for (const raw of group ?? []) {
      if (!AMENITY_RULES.some(([re]) => re.test(raw))) out.add(raw.trim());
    }
  }
  return [...out].filter(Boolean);
}
