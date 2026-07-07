import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { cityLabel } from "@/components/transport/city-names";
import { formatCurrency } from "@/lib/i18n/formatters";
import type { Locale } from "@/components/internationalization/config";
import { PropertyImageFallback } from "@/components/atom/property-image-fallback";
import {
  routeMapThumbUrl,
  routeSearchHref,
  type PopularRoute,
} from "./route-utils";

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
 * (a static route map), pill badge over the image, then the three text rows
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
  const thumb = routeMapThumbUrl(route);
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
              className="object-cover transition-transform duration-300 group-hover:scale-105"
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
        <div className="flex items-center gap-1.5 text-sm text-gray-900">
          <span className="truncate font-normal">{fromLabel}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-500 rtl:rotate-180" />
          <span className="truncate font-normal">{toLabel}</span>
        </div>

        <div className="text-gray-500 text-xs truncate">
          {dictionary.from} {boardingPoint}
        </div>

        <div className="text-xs">
          <span className="font-medium text-gray-900">
            {dictionary.pricePrefix} {formatCurrency(route.basePrice, lang)}
          </span>
          <span className="text-gray-500"> {dictionary.perSeat}</span>
        </div>
      </div>
    </Link>
  );
}
