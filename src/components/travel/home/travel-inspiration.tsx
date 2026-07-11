import Image from "next/image";
import Link from "next/link";
import { cdn } from "@/lib/cdn";
import { cityLabel } from "@/components/travel/city-names";
import { routeSearchHref, type PopularRoute } from "./route-utils";
import type { Locale } from "@/components/internationalization/config";

/**
 * "Inspiration for your next trip" — the original Airbnb destination-tile
 * section (illustration on top, saturated brand-palette block below) reused
 * from the homes landing (`site/inspiration.tsx`), but wired to REAL popular
 * routes so every tile lands on a live trip search.
 */

// Airbnb's inspiration palette, in the order the homes landing uses it.
const PALETTE = ["#CC2D4A", "#BC1A6E", "#DE3151", "#D93B30"] as const;

// Original Airbnb inspiration artwork mirrored on the CDN. Only three
// illustrations exist; cities without their own cycle through them — the
// homes landing does the same (its Juba tile reuses the Khartoum art).
const CITY_ART: Record<string, string> = {
  Khartoum: cdn.product("destinations/khartoum.jpg"),
  "Port Sudan": cdn.product("destinations/port-sudan.jpg"),
  Omdurman: cdn.product("destinations/omdurman.jpg"),
};
const ART_CYCLE = [
  cdn.product("destinations/port-sudan.jpg"),
  cdn.product("destinations/khartoum.jpg"),
  cdn.product("destinations/omdurman.jpg"),
];

interface TransportInspirationProps {
  routes: PopularRoute[];
  lang: Locale;
  dateIso: string;
  title: string;
  /** e.g. "{hours}h from {city}" */
  hoursFrom: string;
}

export function TransportInspiration({
  routes,
  lang,
  dateIso,
  title,
  hoursFrom,
}: TransportInspirationProps) {
  // First four routes with distinct destination cities.
  const tiles: PopularRoute[] = [];
  for (const route of routes) {
    if (tiles.some((t) => t.destination.city === route.destination.city)) continue;
    tiles.push(route);
    if (tiles.length === 4) break;
  }

  if (tiles.length === 0) return null;

  // Spread the three illustrations across the tiles: cities with their own
  // art keep it, the rest draw from the arts no tile owns before any repeats
  // — so a repeat only happens when tiles outnumber illustrations.
  const ownedArts = new Set(
    tiles.map((t) => CITY_ART[t.destination.city]).filter(Boolean),
  );
  const pool = ART_CYCLE.filter((a) => !ownedArts.has(a));
  let poolIdx = 0;
  const tileArt = tiles.map(
    (t) =>
      CITY_ART[t.destination.city] ??
      (pool.length > 0
        ? pool[poolIdx++ % pool.length]!
        : ART_CYCLE[poolIdx++ % ART_CYCLE.length]!),
  );

  return (
    <div className="w-full">
      <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-6">
        {title}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {tiles.map((route, i) => {
          const city = route.destination.city;
          const hours = Math.max(1, Math.round(route.duration / 60));
          const caption = hoursFrom
            .replace("{hours}", String(hours))
            .replace("{city}", cityLabel(route.origin.city, lang));
          return (
            <Link
              key={route.id}
              href={routeSearchHref(route, lang, dateIso)}
              className="cursor-pointer rounded-sm overflow-hidden flex flex-col h-80 group"
            >
              <div className="relative h-40 overflow-hidden">
                <Image
                  src={tileArt[i]!}
                  alt={cityLabel(city, lang)}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                />
              </div>
              <div
                className="h-40 p-4 text-white flex flex-col"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              >
                <h3 className="text-lg font-semibold mb-1">
                  {cityLabel(city, lang)}
                </h3>
                <p className="text-sm opacity-90 text-white">{caption}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
