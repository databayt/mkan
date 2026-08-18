// Re-export centralized search configuration
export { SEARCH_CONFIG } from "@/lib/schemas/search-schema";
import type { LocationSuggestion } from "@/lib/schemas/search-schema";

// Guest type limits
export const GUEST_LIMITS = {
  adults: { min: 0, max: 16 },
  children: { min: 0, max: 10 },
  infants: { min: 0, max: 5 },
  pets: { min: 0, max: 5 },
} as const;

// Mobile breakpoint
export const MOBILE_BREAKPOINT = 768;

// Search UI constants (legacy support)
export const SEARCH_CONSTANTS = {
  MAX_AUTOCOMPLETE_RESULTS: 10,
  DEFAULT_POPULAR_LOCATIONS_COUNT: 5,
} as const;

// Fallback recommendations when database has no popular locations
// Used to provide a better UX during initial setup or empty states
export const FALLBACK_RECOMMENDATIONS = [
  {
    city: "Port Sudan",
    state: "Red Sea",
    country: "Sudan",
    displayName: "Port Sudan",
    searchValue: "Port Sudan",
    listingCount: 0,
  },
  {
    city: "Port Sudan",
    state: "East Locality",
    country: "Sudan",
    displayName: "Digna District",
    searchValue: "digna",
    listingCount: 0,
  },
  {
    city: "Port Sudan",
    state: "Central Locality",
    country: "Sudan",
    displayName: "City Centre",
    searchValue: "city-centre",
    listingCount: 0,
  },
  {
    city: "Port Sudan",
    state: "South Locality",
    country: "Sudan",
    displayName: "Airport District",
    searchValue: "airport-district",
    listingCount: 0,
  },
  {
    city: "Port Sudan",
    state: "Coastal Tourism",
    country: "Sudan",
    displayName: "Arous",
    searchValue: "arous",
    listingCount: 0,
  },
] as const satisfies readonly LocationSuggestion[];

// Note: Static LOCATIONS array has been removed.
// Location suggestions are now fetched dynamically from the database
// via the useLocationSuggestions hook and /api/search/locations endpoint.
// FALLBACK_RECOMMENDATIONS above provides a safety net for empty database states.
