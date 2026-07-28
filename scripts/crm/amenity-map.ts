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
  | 'Pool' | 'Gym' | 'Parking' | 'PetsAllowed' | 'WiFi'
  | 'Kitchen' | 'TV' | 'DedicatedWorkspace' | 'Elevator' | 'PatioOrBalcony'
  | 'Backyard' | 'HotTub' | 'Bathtub' | 'BbqGrill' | 'OutdoorDining'
  | 'OutdoorShower' | 'FirePit' | 'IndoorFireplace' | 'PoolTable' | 'Piano'
  | 'BeachAccess' | 'LakeAccess' | 'EVCharger' | 'Crib' | 'Breakfast'
  | 'HairDryer' | 'LuggageDropoff' | 'BedroomLock' | 'SmokeAlarm'
  | 'CarbonMonoxideAlarm' | 'FireExtinguisher' | 'FirstAidKit' | 'SecurityCameras';

/**
 * Every rule is tested against every string and the result is a *set*, so
 * order here is presentation only — it is the patterns themselves that have to
 * be mutually exclusive. Three pairs genuinely overlap and each is handled by
 * excluding the other rather than by relying on order:
 *
 *   "Hair dryer"  vs  "Dryer"      — /dryer/ recorded a washer on 2 homes
 *   "Pool table"  vs  "Pool"       — /pool/ would claim a swimming pool
 *   "Hot tub"     vs  "Bathtub"    — حوض استحمام is a prefix of حوض استحمام ساخن
 */
export const AMENITY_RULES: Array<[RegExp, AmenityName]> = [
  // HighSpeedInternet is a refinement of WiFi, not an alternative to it: a
  // listing with fast wifi has both, which the set result expresses correctly.
  [/wi-?fi|واي\s*فاي|وايفاي|إنترنت|انترنت|نت\b/i, 'WiFi'],
  [/fast wifi|\d+\s*mbps|إنترنت\s*سريع|انترنت\s*سريع|واي\s*فاي\s*سريع/i, 'HighSpeedInternet'],
  [/air ?condition|\ba\/?c\b|تكييف|مكيف|مكيّف/i, 'AirConditioning'],
  [/(?<!hair )(?:washer|dryer)|washing machine|غسالة|غسّالة|مجفف(?!\s*شعر)|مجففة|نشافة/i, 'WasherDryer'],
  [/hair ?dryer|مجفف\s*شعر|سشوار/i, 'HairDryer'],
  [/dishwasher|غسالة\s*صحون|جلاية/i, 'Dishwasher'],
  [/microwave|مايكروويف|ميكروويف|ميكرويف/i, 'Microwave'],
  [/fridge|refrigerator|ثلاجة|براد/i, 'Refrigerator'],
  [/pool(?!\s*table)|مسبح|حمام\s*سباحة|بركة\s*سباحة/i, 'Pool'],
  [/pool table|طاولة\s*بلياردو|بلياردو/i, 'PoolTable'],
  [/gym|exercise equipment|صالة\s*رياضية|نادي\s*رياضي|جيم|صالة\s*ألعاب/i, 'Gym'],
  [/parking|موقف|مواقف|جراج|كراج|مرآب/i, 'Parking'],
  [/pets? allowed|يسمح\s*بالحيوانات|يُسمح\s*باصطحاب\s*الحيوانات|الحيوانات\s*الأليفة\s*مسموح/i, 'PetsAllowed'],
  [/walk-?in closet|خزانة\s*ملابس|دولاب\s*ملابس/i, 'WalkInClosets'],
  [/hardwood|أرضيات\s*خشبية|باركيه/i, 'HardwoodFloors'],

  // ── Added once the enum could hold them (docs/growth.md §4.4). Before this,
  // the four most common facts in the dataset — kitchen, CO alarm, smoke
  // alarm, TV — had nowhere to go and were dropped on every listing.
  [/kitchen|مطبخ/i, 'Kitchen'],
  // Airbnb spells TVs out in full: "42 inch HDTV with standard cable".
  [/\btv\b|\bhdtv\b|television|تلفزيون|تلفاز/i, 'TV'],
  [/dedicated workspace|مساحة\s*مخصصة\s*للعمل|مكتب\s*عمل/i, 'DedicatedWorkspace'],
  [/elevator|lift\b|مصعد|أسانسير/i, 'Elevator'],
  // `(?<!على\s)` keeps "إطلالة على فناء" (a courtyard *view*) from claiming a patio.
  [/patio|balcony|شرفة|بلكونة|(?<!على\s)فناء(?!\s*خلفي)/i, 'PatioOrBalcony'],
  [/backyard|back yard|garden\b|فناء\s*خلفي|حديقة/i, 'Backyard'],
  [/hot tub|jacuzzi|حوض\s*استحمام\s*ساخن|جاكوزي/i, 'HotTub'],
  [/bathtub|حوض\s*استحمام(?!\s*ساخن)/i, 'Bathtub'],
  [/bbq|barbecue|barbeque|grill\b|شواية|منقل/i, 'BbqGrill'],
  [/outdoor dining|منطقة\s*طعام\s*خارجية|طاولة\s*طعام\s*خارجية/i, 'OutdoorDining'],
  [/outdoor shower|دش\s*خارجي/i, 'OutdoorShower'],
  [/fire pit|موقد\s*نار|حفرة\s*نار/i, 'FirePit'],
  [/indoor fireplace|fireplace|مدفأة/i, 'IndoorFireplace'],
  [/piano|بيانو/i, 'Piano'],
  [/beach access|beachfront|الوصول\s*إلى\s*الشاطئ/i, 'BeachAccess'],
  [/lake access|lakefront|الوصول\s*إلى\s*البحيرة/i, 'LakeAccess'],
  [/ev charger|electric vehicle charger|شاحن\s*سيارة\s*كهربائية/i, 'EVCharger'],
  [/\bcrib\b|pack ?'?n ?play|سرير\s*أطفال|سرير\s*رضيع/i, 'Crib'],
  [/breakfast|الإفطار|إفطار/i, 'Breakfast'],
  [/luggage drop-?off|إيداع\s*الحقائب|تخزين\s*الأمتعة/i, 'LuggageDropoff'],
  [/lock on bedroom door|قفل\s*لباب\s*غرفة\s*النوم|قفل\s*على\s*باب\s*غرفة\s*النوم/i, 'BedroomLock'],
  [/smoke alarm|smoke detector|جهاز\s*الكشف\s*عن\s*الدخان|كاشف\s*دخان|إنذار\s*حريق/i, 'SmokeAlarm'],
  [/carbon monoxide|أول\s*أكسيد\s*الكربون/i, 'CarbonMonoxideAlarm'],
  [/fire extinguisher|طفاية\s*حريق|مطفأة\s*حريق/i, 'FireExtinguisher'],
  [/first aid kit|حقيبة\s*إسعافات|إسعافات\s*أولية/i, 'FirstAidKit'],
  [/security camera|كاميرات?\s*المراقبة|كاميرات?\s*مراقبة/i, 'SecurityCameras'],
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
 * Airbnb lists "Smoking allowed" among the amenities, but mkan already owns
 * smoking in `Listing.houseRules`. Recording it in both places is how a listing
 * ends up saying "No smoking" in its rules and "Smoking allowed" in its
 * amenities — the same two-sources-of-truth bug that made a pet-friendly
 * listing display "No pets". So it is deliberately not an `Amenity` value, and
 * the import folds it into the rules instead.
 *
 * Returns null when Airbnb said nothing, which is not the same as "no".
 */
export function smokingFromAmenities(...rawGroups: Array<string[] | null | undefined>): boolean | null {
  for (const group of rawGroups) {
    for (const raw of group ?? []) {
      if (/smoking allowed|التدخين\s*مسموح|يسمح\s*بالتدخين/i.test(raw)) return true;
      if (/no smoking|smoking is not allowed|ممنوع\s*التدخين|التدخين\s*غير\s*مسموح/i.test(raw)) return false;
    }
  }
  return null;
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
