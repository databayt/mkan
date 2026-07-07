"use client";

import { useState, useEffect, useRef, useMemo, useDeferredValue, useCallback } from "react";
import { useParams } from "next/navigation";
import { Search } from "lucide-react";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { CITY_AR, cityLabel } from "@/components/transport/city-names";
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

// Mirrors the homepage "Where" step (LocationDropdown): a search input above a
// scrolling list whose rows are a rounded-square destination art + city name +
// a light subtitle. Data comes from the transport assembly points.
export default function TransportCityDropdown({
  value,
  onChange,
  assemblyPoints = [],
  placeholder,
}: TransportCityDropdownProps) {
  const params = useParams();
  const lang = (params?.lang as string) ?? "en";
  const dict = useDictionary();
  const tc = dict?.transport?.citySelect;
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
        (CITY_AR[city] ?? "").includes(deferredSearchQuery.trim())
    );
    return filtered.slice(0, 8); // Max 8 results
  }, [deferredSearchQuery, allCities]);

  // Autofocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Memoize city select handler
  const handleCitySelect = useCallback((city: string) => {
    onChange(city);
  }, [onChange]);

  // Memoize search change handler
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, []);

  // Check if showing popular or search results
  const isShowingPopular = deferredSearchQuery.trim() === "";

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={placeholder ?? tc?.searchCity ?? "Search city..."}
          className="w-full ps-10 pe-4 h-11 text-sm border border-[#dddddd] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* City List — Where-step row style (icon + name + subtitle) */}
      <div className="max-h-[320px] overflow-y-auto no-scrollbar scroll-smooth" role="listbox">
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
