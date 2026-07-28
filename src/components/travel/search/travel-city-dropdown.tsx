"use client";

import { useState, useMemo, useDeferredValue, useCallback } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Command, CommandInput } from "@/components/ui/command";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { CITY_AR, cityLabel } from "@/components/travel/city-names";
import { cityCoords } from "@/components/travel/city-coords";
import { useNearby, nearbyErrorMessage } from "@/hooks/use-nearby";
import { nearestBy } from "@/lib/distance";
import { cdn } from "@/lib/cdn";

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  city: string;
}

interface TransportCityDropdownProps {
  value: string;
  onChange: (value: string) => void;
  assemblyPoints?: AssemblyPoint[];
  placeholder?: string;
  // fillHeight = stretch the list to fill the parent's height (with bottom
  // clearance for the floating Search pill), keeping the search command fixed
  // at the top — used by the mobile step. Off = the fixed max-height list for
  // the desktop side panel.
  fillHeight?: boolean;
}

// Sudan cities as fallback
const defaultCities = [
  "Khartoum",
  "Omdurman",
  "Khartoum North",
  "Port Sudan",
  "Kassala",
  "Nyala",
  "El Obeid",
  "Wad Madani",
  "El Fasher",
  "Atbara",
  "Gedaref",
  "Dongola",
  "Sennar",
  "Rabak",
  "El Daein",
  "Kadugli",
  "Ed Damazin",
  "Kosti",
  "Shendi",
  "Berber",
];

// Reuse the homepage "Where" destination arts (the colorful Airbnb
// illustrations on the CDN) for the city rows, so the transport picker matches
// the homes-search visual pattern instead of a flat pin icon.
const CITY_ARTS = [
  { src: cdn.vendor("airbnb", "destinations/port-sudan.png"), bg: "#eaf7ec" },
  { src: cdn.vendor("airbnb", "destinations/coral-coast.png"), bg: "#fdf2e9" },
  { src: cdn.vendor("airbnb", "destinations/marina.png"), bg: "#fef5e7" },
  { src: cdn.vendor("airbnb", "destinations/suakin.png"), bg: "#f3e8ff" },
  { src: cdn.vendor("airbnb", "destinations/airport.png"), bg: "#fdedec" },
  { src: cdn.vendor("airbnb", "destinations/red-sea-university.png"), bg: "#e8f8f5" },
  { src: cdn.vendor("airbnb", "destinations/nearby.png"), bg: "#e8f4fd" },
];

// Stable per-city art so a given city always shows the same illustration.
function cityArt(city: string): (typeof CITY_ARTS)[number] {
  let hash = 0;
  for (let i = 0; i < city.length; i++) hash = (hash * 31 + city.charCodeAt(i)) >>> 0;
  return CITY_ARTS[hash % CITY_ARTS.length]!;
}

// Mirrors the homepage "Where" step: a cmdk search command fixed at the top,
// above a scrolling list whose rows are a rounded-square destination art +
// city name + a light subtitle. Data comes from the transport assembly points.
export default function TransportCityDropdown({
  value,
  onChange,
  assemblyPoints = [],
  placeholder,
  fillHeight = false,
}: TransportCityDropdownProps) {
  const params = useParams();
  const lang = (params?.lang as string) ?? "en";
  const dict = useDictionary();
  const tc = dict?.travel?.citySelect;

  const anywhereLabel = dict?.travel?.search?.anywhere ?? (lang === "ar" ? "أي مكان" : "Anywhere");
  const isAnywhere = (val?: string) => {
    if (!val) return true;
    const lower = val.trim().toLowerCase();
    return lower === "anywhere" || lower === "أي مكان" || val === anywhereLabel;
  };

  // Seed the search command with the already-selected city so reopening the
  // field shows the current From/To value.
  const [searchQuery, setSearchQuery] = useState(() =>
    value && !isAnywhere(value) ? cityLabel(value, lang) : ""
  );

  // Debounce search query using useDeferredValue
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Memoize cities map - only recalculate when assembly points change
  const citiesMap = useMemo(() => {
    return assemblyPoints.reduce(
      (acc, point) => {
        const city = acc[point.city];
        if (!city) {
          acc[point.city] = [point];
        } else {
          city.push(point);
        }
        return acc;
      },
      {} as Record<string, AssemblyPoint[]>
    );
  }, [assemblyPoints]);

  // Memoize all cities list
  const allCities = useMemo(() => {
    return Object.keys(citiesMap).length > 0
      ? Object.keys(citiesMap).sort()
      : defaultCities;
  }, [citiesMap]);

  // Memoize filtered cities - uses deferred search query for debouncing.
  // Matches the English name and, for Arabic users, the Arabic label too.
  const filteredCities = useMemo(() => {
    if (deferredSearchQuery.trim() === "") {
      return allCities.slice(0, 6); // Show first 6 cities
    }

    const searchLower = deferredSearchQuery.toLowerCase();
    const filtered = allCities.filter(
      (city) =>
        city.toLowerCase().includes(searchLower) ||
        cityLabel(city, lang).toLowerCase().includes(searchLower) ||
        (CITY_AR[city] ?? "").includes(deferredSearchQuery.trim())
    );
    return filtered.slice(0, 8); // Max 8 results
  }, [deferredSearchQuery, allCities, lang]);

  // Memoize city select handler
  const handleCitySelect = useCallback((city: string) => {
    onChange(city);
  }, [onChange]);

  // "Near me" — resolve a device position to the closest city we actually run
  // buses from. Travel search is city-to-city, so unlike the homes search there
  // is nothing sensible to do with a raw coordinate: the nearest served origin
  // IS the answer. Distance is computed locally against CITY_COORDS, so this
  // needs no reverse-geocoding service (and no third-party origin in the CSP).
  const { isLocating, errorCode, locate } = useNearby();
  const nearbyDict = dict?.search?.nearby;
  const geoError = errorCode ? nearbyErrorMessage(errorCode, nearbyDict, lang) : null;

  const handleNearMe = useCallback(async () => {
    const coords = await locate();
    if (!coords) return; // keep the panel open showing `geoError`

    const nearest = nearestBy(coords, allCities, (city) => cityCoords(city));
    // Only cities in CITY_COORDS can win; if an operator adds an assembly point
    // in a city we have no coordinate for, we simply don't offer it here rather
    // than guessing.
    if (nearest) handleCitySelect(nearest.item);
  }, [locate, allCities, handleCitySelect]);

  // Check if showing popular or search results
  const isShowingPopular = deferredSearchQuery.trim() === "";

  return (
    <div className={`flex flex-col ${fillHeight ? "h-full" : ""}`}>
      {/* Search command — cmdk input fixed at the top (same as the homepage
          "Where" step). */}
      <Command
        shouldFilter={false}
        className="h-auto shrink-0 overflow-visible bg-transparent mb-3"
      >
        <CommandInput
          value={searchQuery}
          onValueChange={setSearchQuery}
          placeholder={placeholder ?? (tc?.searchCity ?? "Search city...")}
          className="h-11"
          autoFocus
        />
      </Command>

      {/* Locating feedback — mirrors the homes "Where" step. */}
      {isLocating && (
        <div className="flex items-center gap-3 py-3 px-4 mb-3 bg-[#f0f7ff] rounded-2xl border border-[#d2e7ff] text-sm text-[#0066cc] animate-pulse">
          <Loader2 className="h-4.5 w-4.5 animate-spin flex-shrink-0" />
          <span>
            {nearbyDict?.locating ??
              (lang === "ar" ? "جاري تحديد موقعك الحالي..." : "Finding your current location...")}
          </span>
        </div>
      )}

      {geoError && (
        <div
          className="text-red-500 text-sm mb-3 p-3 bg-red-50 rounded-xl border border-red-100"
          role="alert"
        >
          {geoError}
        </div>
      )}

      {/* City List — Where-step row style (art + name + subtitle). */}
      <div
        className={
          fillHeight
            ? "flex-1 min-h-0 overflow-y-auto no-scrollbar pb-24"
            : "max-h-[320px] overflow-y-auto no-scrollbar scroll-smooth"
        }
        role="listbox"
      >
        {/* "Near me" sits above the list and only while browsing (a typed query
            means the user already knows where they're going). Same row shape as
            a city so it reads as one list, not a bolted-on control. */}
        {isShowingPopular && (
          <div
            role="option"
            aria-selected={false}
            aria-busy={isLocating}
            tabIndex={0}
            onClick={() => {
              if (!isLocating) void handleNearMe();
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              if (!isLocating) void handleNearMe();
            }}
            className={`py-2 px-2 mb-1 rounded-2xl transition-all flex items-center gap-3.5 ${
              isLocating
                ? "cursor-wait opacity-60"
                : "hover:bg-[#F7F7F7] active:scale-[0.99] cursor-pointer"
            }`}
          >
            <img
              src={cdn.vendor("airbnb", "destinations/nearby.png")}
              alt=""
              loading="lazy"
              style={{ backgroundColor: "#e8f4fd" }}
              className="w-12 h-12 flex-shrink-0 rounded-xl object-cover"
            />
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-medium text-[#222222] truncate">
                {tc?.nearMe ?? (lang === "ar" ? "قريب مني" : "Near me")}
              </div>
              <div className="text-sm text-[#6a6a6a] truncate mt-0.5">
                {tc?.nearMeDesc ??
                  (lang === "ar" ? "أقرب مدينة إلى موقعك" : "The closest city to you")}
              </div>
            </div>
            {isLocating && (
              <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-[#6a6a6a]" />
            )}
          </div>
        )}

        {filteredCities.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            {tc?.noCitiesFound ?? "No cities found"}
          </div>
        ) : (
          <>
            {isShowingPopular && (
              <p className="text-[13px] font-normal text-[#222222] px-2 mb-2">
                {tc?.popularDestinations ?? "Popular destinations"}
              </p>
            )}
            <div className="space-y-0.5">
              {filteredCities.map((city) => {
                const cityPoints = citiesMap[city];
                const count = cityPoints?.length ?? 0;
                const subtitle =
                  count > 0
                    ? `${count} ${count === 1 ? (tc?.point ?? "point") : (tc?.points ?? "points")}`
                    : null;
                const art = cityArt(city);

                return (
                  <div
                    key={city}
                    role="option"
                    aria-selected={value === city}
                    tabIndex={0}
                    onClick={() => handleCitySelect(city)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCitySelect(city);
                      }
                    }}
                    className="py-2 px-2 rounded-2xl hover:bg-[#F7F7F7] active:scale-[0.99] transition-all cursor-pointer flex items-center gap-3.5"
                  >
                    {/* Colored rounded square is baked into the original Airbnb
                        PNG — render it bare; the inline backgroundColor only
                        shows through while the image loads. */}
                    <img
                      src={art.src}
                      alt=""
                      loading="lazy"
                      style={{ backgroundColor: art.bg }}
                      className="w-12 h-12 flex-shrink-0 rounded-xl object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-[#222222] truncate">
                        {cityLabel(city, lang)}
                      </div>
                      {subtitle && (
                        <div className="text-sm text-[#6a6a6a] truncate mt-0.5">{subtitle}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
