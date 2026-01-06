"use client";

import { useState, useEffect, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  type LocationSuggestion,
  SEARCH_CONFIG,
} from "@/lib/schemas/search-schema";

interface UseLocationSuggestionsOptions {
  debounceMs?: number;
  limit?: number;
}

interface UseLocationSuggestionsReturn {
  suggestions: LocationSuggestion[];
  popularLocations: LocationSuggestion[];
  isLoading: boolean;
  error: string | null;
  search: (query: string) => void;
  clearSuggestions: () => void;
  query: string;
}

export function useLocationSuggestions(
  options: UseLocationSuggestionsOptions = {}
): UseLocationSuggestionsReturn {
  const {
    debounceMs = SEARCH_CONFIG.DEBOUNCE_MS,
    limit = SEARCH_CONFIG.MAX_LOCATION_RESULTS,
  } = options;

  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [popularLocations, setPopularLocations] = useState<LocationSuggestion[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedQuery = useDebounce(query, debounceMs);

  // Fetch popular locations on mount
  useEffect(() => {
    const fetchPopular = async () => {
      try {
        const response = await fetch(
          `/api/search/locations?limit=${SEARCH_CONFIG.DEFAULT_POPULAR_LOCATIONS_COUNT}`
        );
        const data = await response.json();

        if (data.success) {
          setPopularLocations(data.data);
        }
      } catch (err) {
        console.error("Failed to fetch popular locations:", err);
      }
    };

    fetchPopular();
  }, []);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([]);
      setError(null);
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/search/locations?q=${encodeURIComponent(debouncedQuery)}&limit=${limit}`
        );
        const data = await response.json();

        if (data.success) {
          setSuggestions(data.data);
        } else {
          setError(data.error || "Failed to fetch suggestions");
          setSuggestions([]);
        }
      } catch (err) {
        setError("Network error. Please try again.");
        setSuggestions([]);
        console.error("Location suggestions error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery, limit]);

  const search = useCallback((newQuery: string) => {
    setQuery(newQuery);
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setQuery("");
    setError(null);
  }, []);

  return {
    suggestions,
    popularLocations,
    isLoading,
    error,
    search,
    clearSuggestions,
    query,
  };
}
