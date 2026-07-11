import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { cityLabel } from "@/components/travel/city-names";
import { formatCurrency } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";
import { PropertyImageFallback } from "@/components/atom/property-image-fallback";
import {
  routeSearchHref,
  type PopularRoute,
} from "./route-utils";

export function getCityPhotoUrl(cityName: string): string {
  const normalized = cityName.trim();
  if (normalized === "Khartoum") return "/destinations/khartoum.jpg";
  if (normalized === "Omdurman") return "/destinations/omdurman.jpg";
  if (normalized === "Port Sudan" || normalized === "Portsudan") return "/destinations/port-sudan.jpg";
  if (normalized === "Atbara") return "/destinations/atbara.jpg";
  if (normalized === "Kassala") return "/destinations/kassala.jpg";
  if (normalized === "Wad Madani" || normalized === "Madani") return "/destinations/wad-madani.jpg";
  if (normalized === "Dongola") return "/destinations/dongola.jpg";
  if (normalized === "Gedaref") return "/destinations/gedaref.jpg";

  // Fallback cycle based on name hash
  const allPhotos = [
    "/destinations/port-sudan.jpg",
    "/destinations/khartoum.jpg",
    "/destinations/omdurman.jpg",
    "/destinations/atbara.jpg",
    "/destinations/kassala.jpg",
    "/destinations/wad-madani.jpg",
    "/destinations/dongola.jpg",
    "/destinations/gedaref.jpg",
  ];
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % allPhotos.length;
  return allPhotos[index]!;
}

export interface RouteCardDictionary {
  /** e.g. "From" — price prefix. */
  pricePrefix: string;
  /** e.g. "per seat". */
  perSeat: string;
  /** e.g. "{hours}h" — duration pill template. */
  hoursSuffix: string;
  /** e.g. "From" — boarding-point caption prefix. */
  from: string;
}

interface RouteCardProps {
  route: PopularRoute;
  lang: Locale;
  dateIso: string;
  dictionary: RouteCardDictionary;
  className?: string;
}

/**
 * Airbnb listing-card anatomy applied to an intercity bus route: 4/3 image
 * (a photo of the destination city), pill badge over the image, then the three text rows
 * — title, caption, price — mirroring `site/property/card.tsx` so the
 * transport landing reads as the same marketplace as homes.
 */
export function RouteCard({
  route,
  lang,
  dateIso,
  dictionary,
  className,
}: RouteCardProps) {
  const fromLabel = cityLabel(route.origin.city, lang);
  const toLabel = cityLabel(route.destination.city, lang);
  const hours = Math.max(1, Math.round(route.duration / 60));
  const thumb = getCityPhotoUrl(route.destination.city);
  const boardingPoint =
    lang === "ar" ? (route.origin.nameAr ?? route.origin.name) : route.origin.name;

  return (
    <Link
      href={routeSearchHref(route, lang, dateIso)}
      className={cn("block w-full cursor-pointer group", className)}
    >
      {/* Image container */}
      <div className="relative mb-3">
        <div className="relative w-full aspect-[4/3] bg-muted rounded-md overflow-hidden">
          {thumb ? (
            <Image
              src={thumb}
              alt={`${fromLabel} → ${toLabel}`}
              fill
              unoptimized
              className="object-cover"
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 85vw"
            />
          ) : (
            <PropertyImageFallback seed={`${route.id}`} alt={`${fromLabel} → ${toLabel}`} />
          )}

          {/* Duration pill — same slot as Airbnb's guest-favourite badge */}
          <span className="absolute top-3 start-3 bg-white/95 text-gray-900 rounded-full px-2.5 py-1 text-xs font-medium shadow-sm">
            {dictionary.hoursSuffix.replace("{hours}", String(hours))}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <span className="truncate">{toLabel}</span>
        </div>

        <div className="text-xs">
          <span className="font-medium text-gray-900">
            {dictionary.pricePrefix} {formatCurrency(route.basePrice, lang)}
          </span>
        </div>
      </div>
    </Link>
  );
}
