import * as z from "zod";

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
  DEFAULT_POPULAR_LOCATIONS_COUNT: 5,
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
}

// Search filters type for server action
export interface SearchFilters {
  location?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  adults?: number;
  children?: number;
  infants?: number;
}

// Search result type
export interface SearchResult<T> {
  success: boolean;
  error?: string;
  data: T;
  count?: number;
}
