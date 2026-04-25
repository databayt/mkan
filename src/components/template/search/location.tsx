"use client";

import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { type LocationSuggestion } from "@/lib/schemas/search-schema";
import { FALLBACK_RECOMMENDATIONS } from "./constant";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface LocationProps {
  searchQuery: string;
  suggestions: LocationSuggestion[];
  popularLocations: LocationSuggestion[];
  isLoading: boolean;
  error: string | null;
  onSearchQueryChange: (query: string) => void;
  onLocationSelect: (location: LocationSuggestion | null) => void;
}

export default function LocationDropdown({
  searchQuery,
  suggestions,
  popularLocations,
  isLoading,
  error,
  onSearchQueryChange,
  onLocationSelect,
}: LocationProps) {
  const dict = useDictionary();

  const displayLocations = searchQuery.trim()
    ? suggestions
    : popularLocations.length > 0
      ? popularLocations
      : FALLBACK_RECOMMENDATIONS;

  const title = searchQuery.trim()
    ? (dict.search?.searchResults ?? "Search results")
    : popularLocations.length > 0
      ? (dict.search?.popularDestinations ?? "Popular destinations")
      : (dict.search?.recommendedDestinations ?? "Recommended destinations");

  const handleKeyDown = (
    e: React.KeyboardEvent,
    location: LocationSuggestion
  ) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onLocationSelect(location);
    }
  };

  return (
    <div role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-controls="location-listbox">
      <h3 className="text-lg font-semibold mb-4">{dict.search?.whereTo ?? "Where to?"}</h3>

      {/* Search input */}
      <div className="mb-4 relative">
        <Input
          placeholder={dict.search?.searchDestinations ?? "Search destinations..."}
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="w-full h-10 border-0 border-none rounded-lg focus:outline-none focus:border-0 shadow-none text-black caret-black pe-10"
          autoFocus
          aria-label={dict.search?.searchLocation ?? "Search for a location"}
          aria-autocomplete="list"
          aria-controls="location-listbox"
        />
        {isLoading && (
          <Loader2 className="absolute right-3 top-2.5 h-5 w-5 animate-spin text-gray-400" />
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          className="text-red-500 text-sm mb-4 p-2 bg-red-50 rounded"
          role="alert"
        >
          {error}
        </div>
      )}

      {/* Results */}
      <div
        className="space-y-1 max-h-80 overflow-y-auto no-scrollbar"
        role="listbox"
        id="location-listbox"
        aria-label={title}
      >
        {displayLocations.length > 0 ? (
          <>
            <p className="text-xs text-gray-500 uppercase tracking-wide px-3 mb-2">
              {title}
            </p>
            {displayLocations.map((location, index) => (
              <div
                key={`${location.city}-${location.state}-${index}`}
                className="py-1 rounded-lg hover:bg-gray-50 cursor-pointer flex items-center gap-3 transition-colors"
                onClick={() => onLocationSelect(location)}
                role="option"
                aria-selected="false"
                tabIndex={0}
                onKeyDown={(e) => handleKeyDown(e, location)}
              >
                <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {location.city}
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : searchQuery && !isLoading ? (
          <div className="text-center text-gray-500 py-4">
            {(dict.search?.noDestinationsFound ?? "No destinations found for \"{query}\"").replace("{query}", searchQuery)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
