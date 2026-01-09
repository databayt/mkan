"use client";

import { useState, useEffect, useRef, useMemo, useDeferredValue, useCallback } from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";

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

export default function TransportCityDropdown({
  value,
  onChange,
  assemblyPoints = [],
  placeholder = "Search city...",
}: TransportCityDropdownProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

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

  // Memoize filtered cities - uses deferred search query for debouncing
  const filteredCities = useMemo(() => {
    if (deferredSearchQuery.trim() === "") {
      return allCities.slice(0, 6); // Show first 6 cities
    }

    const searchLower = deferredSearchQuery.toLowerCase();
    const filtered = allCities.filter((city) =>
      city.toLowerCase().includes(searchLower)
    );
    return filtered.slice(0, 8); // Max 8 results
  }, [deferredSearchQuery, allCities]);

  // Autofocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Check scroll position to show/hide chevron buttons
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const checkScroll = () => {
      setCanScrollUp(container.scrollTop > 0);
      setCanScrollDown(
        container.scrollTop < container.scrollHeight - container.clientHeight - 1
      );
    };

    checkScroll();
    container.addEventListener("scroll", checkScroll);
    return () => container.removeEventListener("scroll", checkScroll);
  }, [filteredCities]);

  // Scroll handlers
  const scrollUp = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ top: -100, behavior: "smooth" });
  }, []);

  const scrollDown = useCallback(() => {
    scrollContainerRef.current?.scrollBy({ top: 100, behavior: "smooth" });
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
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* City List with Scroll Indicators */}
      <div className="relative">
        {/* Scroll Up Button */}
        {canScrollUp && (
          <button
            type="button"
            onClick={scrollUp}
            className="flex w-full items-center justify-center py-1 cursor-pointer hover:bg-accent/50 transition-colors rounded-t-lg"
          >
            <ChevronUp className="size-4 opacity-50" />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className="max-h-64 overflow-y-auto no-scrollbar"
        >
          {filteredCities.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No cities found
            </div>
          ) : (
            <div className="space-y-1">
              {isShowingPopular && (
                <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                  Popular destinations
                </div>
              )}
              {filteredCities.map((city) => {
                const cityPoints = citiesMap[city];
                const isSelected = value === city;

                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleCitySelect(city)}
                    className={`w-full flex items-center px-3 py-2.5 rounded-xl text-left transition-colors ${
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{city}</div>
                      {cityPoints && (
                        <div className="text-xs text-muted-foreground">
                          {cityPoints.length} assembly point
                          {cityPoints.length !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Scroll Down Button */}
        {canScrollDown && (
          <button
            type="button"
            onClick={scrollDown}
            className="flex w-full items-center justify-center py-1 cursor-pointer hover:bg-accent/50 transition-colors rounded-b-lg"
          >
            <ChevronDown className="size-4 opacity-50" />
          </button>
        )}
      </div>
    </div>
  );
}
