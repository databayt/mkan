// Re-export centralized search configuration
export { SEARCH_CONFIG } from "@/lib/schemas/search-schema";

// Guest type limits
export const GUEST_LIMITS = {
  adults: { min: 0, max: 16 },
  children: { min: 0, max: 10 },
  infants: { min: 0, max: 5 },
} as const;

// Mobile breakpoint
export const MOBILE_BREAKPOINT = 768;

// Search UI constants (legacy support)
export const SEARCH_CONSTANTS = {
  MAX_AUTOCOMPLETE_RESULTS: 10,
  DEFAULT_POPULAR_LOCATIONS_COUNT: 5,
} as const;

// Note: Static LOCATIONS array has been removed.
// Location suggestions are now fetched dynamically from the database
// via the useLocationSuggestions hook and /api/search/locations endpoint.
