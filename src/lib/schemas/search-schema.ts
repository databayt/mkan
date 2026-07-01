import * as z from "zod";
import { PropertyType, Amenity } from "@prisma/client";

// Centralized search configuration
export const SEARCH_CONFIG = {
  MIN_NIGHTS: 1,
  DEFAULT_MAX_NIGHTS: 365,
  MAX_GUESTS: 16,
  MAX_ADULTS: 16,
  MAX_CHILDREN: 10,
  MAX_INFANTS: 5,
  DEBOUNCE_MS: 300,
  MAX_LOCATION_RESULTS: 10,
  DEFAULT_POPULAR_LOCATIONS_COUNT: 3,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  MAX_PRICE: 100000,
  MAX_BEDS: 20,
  MAX_BATHS: 20,
} as const;

// Helper to get today's date at midnight
const getToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

// Search form validation schema
export const searchFormSchema = z
  .object({
    location: z.string().optional(),
    checkIn: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const date = new Date(val);
          const today = getToday();
          return date >= today;
        },
        { message: "Check-in date cannot be in the past" }
      ),
    checkOut: z.string().optional(),
    guests: z.number().min(0).max(SEARCH_CONFIG.MAX_GUESTS).optional(),
    adults: z.number().min(0).max(SEARCH_CONFIG.MAX_ADULTS).optional(),
    children: z.number().min(0).max(SEARCH_CONFIG.MAX_CHILDREN).optional(),
    infants: z.number().min(0).max(SEARCH_CONFIG.MAX_INFANTS).optional(),
  })
  .refine(
    (data) => {
      if (data.checkIn && data.checkOut) {
        const checkIn = new Date(data.checkIn);
        const checkOut = new Date(data.checkOut);
        return checkOut > checkIn;
      }
      return true;
    },
    { message: "Check-out must be after check-in", path: ["checkOut"] }
  )
  .refine(
    (data) => {
      if (data.checkIn && data.checkOut) {
        const checkIn = new Date(data.checkIn);
        const checkOut = new Date(data.checkOut);
        const nights = Math.ceil(
          (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
        );
        return nights >= SEARCH_CONFIG.MIN_NIGHTS;
      }
      return true;
    },
    {
      message: `Minimum stay is ${SEARCH_CONFIG.MIN_NIGHTS} night(s)`,
      path: ["checkOut"],
    }
  )
  .refine(
    (data) => {
      if (data.checkIn && data.checkOut) {
        const checkIn = new Date(data.checkIn);
        const checkOut = new Date(data.checkOut);
        const nights = Math.ceil(
          (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
        );
        return nights <= SEARCH_CONFIG.DEFAULT_MAX_NIGHTS;
      }
      return true;
    },
    {
      message: `Maximum stay is ${SEARCH_CONFIG.DEFAULT_MAX_NIGHTS} nights`,
      path: ["checkOut"],
    }
  );

export type SearchFormData = z.infer<typeof searchFormSchema>;

// Location query validation schema
export const locationQuerySchema = z.object({
  query: z.string().min(1).max(100),
  limit: z
    .number()
    .min(1)
    .max(20)
    .optional()
    .default(SEARCH_CONFIG.MAX_LOCATION_RESULTS),
});

export type LocationQueryData = z.infer<typeof locationQuerySchema>;

// Location suggestion type
export interface LocationSuggestion {
  city: string;
  state: string;
  country: string;
  displayName: string;
  listingCount: number;
  /**
   * Canonical (English) token to send as the `location` URL param, decoupled
   * from the localized `displayName` shown in the UI. Lets an Arabic label
   * like "بورتسودان" still query the English-stored city "Port Sudan", and
   * lets a district label ("Coral Coast") narrow to that part of town.
   * Consumers fall back to `city` → `displayName` when this is absent.
   */
  searchValue?: string;
}

// Search filters type for server action. Keep in sync with `listingFilterSchema`
// below — every field here needs a Zod parser or it'll bypass validation.
export interface SearchFilters {
  /**
   * Free-text query matched against listing title + description via
   * Postgres full-text search. The match is index-backed by the
   * `idx_listing_fulltext` GIN(to_tsvector(...)) index that lives on
   * the Listing table; an empty / undefined query short-circuits the
   * full-text branch entirely.
   */
  query?: string;
  location?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  adults?: number;
  children?: number;
  infants?: number;
  priceMin?: number;
  priceMax?: number;
  beds?: number;
  baths?: number;
  propertyType?: PropertyType;
  /**
   * Multi-select structure filter (Apartment, Villa, ...). When non-empty it
   * supersedes the single `propertyType` and is applied as an `IN (...)` set —
   * this is what backs the dialog's "Type of place" segmented control (room
   * vs. entire-home groups) and the multi-select "Property type" section.
   */
  propertyTypes?: PropertyType[];
  amenities?: Amenity[];
  /** Booking option — only listings with instant booking enabled. */
  instantBook?: boolean;
  /** Booking option — only listings whose host allows pets. */
  petsAllowed?: boolean;
  /**
   * Geographic viewport bounds from the search map. When all four are set,
   * results are constrained to listings whose location falls inside the box —
   * this is what powers "Search as I move the map".
   */
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
  take?: number;
  skip?: number;
}

// Zod schema used by `searchListings` to validate incoming filter objects.
// The `searchFormSchema` above is form-level (rejects past check-ins etc.);
// this one is query-level (rejects out-of-range numbers, unknown enum values).
export const listingFilterSchema = z.object({
  // Title/description search. Capped at 200 chars to keep
  // plainto_tsquery cheap and bound the cache key size.
  query: z.string().trim().min(1).max(200).optional(),
  location: z.string().max(200).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  guests: z.number().int().min(0).max(SEARCH_CONFIG.MAX_GUESTS).optional(),
  adults: z.number().int().min(0).max(SEARCH_CONFIG.MAX_ADULTS).optional(),
  children: z.number().int().min(0).max(SEARCH_CONFIG.MAX_CHILDREN).optional(),
  infants: z.number().int().min(0).max(SEARCH_CONFIG.MAX_INFANTS).optional(),
  priceMin: z.number().min(0).max(SEARCH_CONFIG.MAX_PRICE).optional(),
  priceMax: z.number().min(0).max(SEARCH_CONFIG.MAX_PRICE).optional(),
  beds: z.number().int().min(0).max(SEARCH_CONFIG.MAX_BEDS).optional(),
  baths: z.number().min(0).max(SEARCH_CONFIG.MAX_BATHS).optional(),
  propertyType: z.enum(PropertyType).optional(),
  propertyTypes: z.array(z.enum(PropertyType)).max(6).optional(),
  amenities: z.array(z.enum(Amenity)).max(30).optional(),
  instantBook: z.boolean().optional(),
  petsAllowed: z.boolean().optional(),
  // Map viewport bounds (decimal degrees). Latitudes ∈ [-90, 90],
  // longitudes ∈ [-180, 180]. Applied only when all four are present.
  minLat: z.number().min(-90).max(90).optional(),
  maxLat: z.number().min(-90).max(90).optional(),
  minLng: z.number().min(-180).max(180).optional(),
  maxLng: z.number().min(-180).max(180).optional(),
  take: z.number().int().min(1).max(SEARCH_CONFIG.MAX_PAGE_SIZE).optional(),
  skip: z.number().int().min(0).optional(),
});

// Search result type
export interface SearchResult<T> {
  success: boolean;
  error?: string;
  data: T;
  /** Number of rows in this page of results. */
  count?: number;
  /** Total number of rows matching the filter, across all pages. */
  total?: number;
}
