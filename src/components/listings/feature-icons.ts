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
