import {
  Wifi,
  Wind,
  WashingMachine,
  SquareParking,
  Waves,
  Dumbbell,
  Utensils,
  Microwave,
  Refrigerator,
  Sofa,
  DoorOpen,
  PawPrint,
  Flame,
  CigaretteOff,
  Cable,
  SatelliteDish,
  Bath,
  ShowerHead,
  Bell,
  Droplets,
  Sparkles,
  Bus,
  Mountain,
  TreePine,
  Check,
  type LucideIcon,
} from "lucide-react";

/**
 * Maps the Prisma `Amenity` / `Highlight` enum values to lucide icons for the
 * listing-detail feature lists. Labels come from the dictionary
 * (`rental.property.amenities.*` / `rental.property.highlights.*`); this file
 * owns only the icon mapping so it stays the single source of truth for both
 * the desktop and mobile detail trees. Unmapped values fall back to a check.
 */
export const AMENITY_ICONS: Record<string, LucideIcon> = {
  WiFi: Wifi,
  HighSpeedInternet: Wifi,
  AirConditioning: Wind,
  WasherDryer: WashingMachine,
  Parking: SquareParking,
  Pool: Waves,
  Gym: Dumbbell,
  Dishwasher: Utensils,
  Microwave: Microwave,
  Refrigerator: Refrigerator,
  HardwoodFloors: Sofa,
  WalkInClosets: DoorOpen,
  PetsAllowed: PawPrint,
};

export const HIGHLIGHT_ICONS: Record<string, LucideIcon> = {
  HighSpeedInternetAccess: Wifi,
  WasherDryer: WashingMachine,
  AirConditioning: Wind,
  Heating: Flame,
  SmokeFree: CigaretteOff,
  CableReady: Cable,
  SatelliteTV: SatelliteDish,
  DoubleVanities: Bath,
  TubShower: ShowerHead,
  Intercom: Bell,
  SprinklerSystem: Droplets,
  RecentlyRenovated: Sparkles,
  CloseToTransit: Bus,
  GreatView: Mountain,
  QuietNeighborhood: TreePine,
};

export const FEATURE_FALLBACK_ICON: LucideIcon = Check;

/**
 * Canonical subtitle for each `Highlight` enum value — the live Airbnb PDP pairs
 * every listing highlight with a fixed, type-level description
 * (`HIGHLIGHTS_DEFAULT`: "Designed for staying cool" → "Beat the heat with the AC
 * and ceiling fan."). These describe what the highlight *means*, so they're
 * standard copy, not per-listing fabrication. Kept here (not the shared en/ar
 * dictionary) so the listing components own their copy in one committable place.
 */
export const HIGHLIGHT_DESCRIPTIONS: Record<string, { en: string; ar: string }> = {
  HighSpeedInternetAccess: { en: "Stay connected with fast, reliable wifi.", ar: "ابقَ متصلاً بواي فاي سريع وموثوق." },
  WasherDryer: { en: "In-unit washer and dryer for longer stays.", ar: "غسالة ومجفف داخل الوحدة للإقامات الطويلة." },
  AirConditioning: { en: "Beat the heat with cooling throughout.", ar: "تغلّب على الحر بتكييف في كامل المكان." },
  Heating: { en: "Stay cozy and warm on cooler nights.", ar: "ابقَ دافئاً في الليالي الباردة." },
  SmokeFree: { en: "A fresh, smoke-free space throughout.", ar: "مساحة خالية من التدخين بالكامل." },
  CableReady: { en: "Cable-ready for your favorite channels.", ar: "جاهز للكابل لمشاهدة قنواتك المفضلة." },
  SatelliteTV: { en: "Satellite TV with a wide channel lineup.", ar: "تلفزيون عبر القمر الصناعي بباقة قنوات واسعة." },
  DoubleVanities: { en: "Double vanities make busy mornings easy.", ar: "مغسلتان لتسهيل الصباحات المزدحمة." },
  TubShower: { en: "A full tub and shower to unwind.", ar: "حوض استحمام ودُش للاسترخاء." },
  Intercom: { en: "Secure intercom entry to the building.", ar: "دخول آمن إلى المبنى عبر الإنتركم." },
  SprinklerSystem: { en: "Fitted with a fire sprinkler system.", ar: "مزوّد بنظام رشاشات لإطفاء الحريق." },
  RecentlyRenovated: { en: "Freshly renovated and move-in ready.", ar: "مُجدّد حديثاً وجاهز للسكن." },
  CloseToTransit: { en: "Easy access to nearby public transit.", ar: "وصول سهل إلى وسائل النقل العام القريبة." },
  GreatView: { en: "Enjoy standout views from the property.", ar: "استمتع بإطلالات مميزة من العقار." },
  QuietNeighborhood: { en: "Set in a calm, quiet neighborhood.", ar: "يقع في حيّ هادئ ومريح." },
};

/** Icon for an enum value, with a safe fallback so a new enum never crashes. */
export function featureIcon(
  map: Record<string, LucideIcon>,
  value: string
): LucideIcon {
  return map[value] ?? FEATURE_FALLBACK_ICON;
}

/** Localized label for an enum value; falls back to the raw value. */
export function featureLabel(
  map: Record<string, string> | undefined | null,
  value: string
): string {
  return (map && map[value]) || value;
}

/** Canonical localized subtitle for a `Highlight` value; "" when none exists. */
export function featureDescription(value: string, locale: string): string {
  const entry = HIGHLIGHT_DESCRIPTIONS[value];
  if (!entry) return "";
  return locale === "ar" ? entry.ar : entry.en;
}
