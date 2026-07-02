/**
 * BusAmenity enum → lucide icon map — single source for every transport
 * surface (trip cards, filters, trip detail, office fleet). Labels stay in
 * the dictionary (`transport.host.amenityLabels.*`); this file owns icons
 * only. Mirrors the homes pattern in `src/components/listings/feature-icons.ts`.
 */
import {
  Armchair,
  Check,
  Coffee,
  Luggage,
  MonitorPlay,
  Plug,
  Snowflake,
  Toilet,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export const BUS_AMENITY_ICONS: Record<string, LucideIcon> = {
  AirConditioning: Snowflake,
  WiFi: Wifi,
  USB: Plug,
  LegRoom: Armchair,
  Toilet: Toilet,
  Refreshments: Coffee,
  Entertainment: MonitorPlay,
  Luggage: Luggage,
  Reclining: Armchair,
};

/** Icon for a BusAmenity value; a new enum value degrades to a checkmark, never a crash. */
export function busAmenityIcon(value: string): LucideIcon {
  return BUS_AMENITY_ICONS[value] ?? Check;
}

/** Label from the dictionary slice (`transport.host.amenityLabels`); falls back to the enum value. */
export function busAmenityLabel(
  labels: Partial<Record<string, string>> | undefined,
  value: string,
): string {
  return labels?.[value] || value;
}
