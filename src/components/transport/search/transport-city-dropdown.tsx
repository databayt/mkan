"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Search } from "lucide-react";

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
  const [filteredCities, setFilteredCities] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Group assembly points by city
  const citiesMap = assemblyPoints.reduce(
    (acc, point) => {
      if (!acc[point.city]) {
        acc[point.city] = [];
      }
      acc[point.city].push(point);
      return acc;
    },
    {} as Record<string, AssemblyPoint[]>
  );

  const allCities =
    Object.keys(citiesMap).length > 0
      ? Object.keys(citiesMap).sort()
      : defaultCities;

  // Filter cities based on search query
  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredCities(allCities.slice(0, 6)); // Show first 6 cities
    } else {
      const filtered = allCities.filter((city) =>
        city.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCities(filtered.slice(0, 8)); // Max 8 results
    }
  }, [searchQuery, allCities]);

  // Autofocus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleCitySelect = (city: string) => {
    onChange(city);
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-3 text-sm border border-[#e5e7eb] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      {/* City List */}
      <div className="max-h-64 overflow-y-auto">
        {filteredCities.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">
            No cities found
          </div>
        ) : (
          <div className="space-y-1">
            {searchQuery.trim() === "" && (
              <div className="text-xs font-medium text-muted-foreground px-2 py-1">
                Popular destinations
              </div>
            )}
            {filteredCities.map((city) => (
              <button
                key={city}
                onClick={() => handleCitySelect(city)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                  value === city
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{city}</div>
                  {citiesMap[city] && (
                    <div className="text-xs text-muted-foreground">
                      {citiesMap[city].length} assembly point
                      {citiesMap[city].length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
