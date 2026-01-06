"use client";

import { useMemo } from "react";
import { SEARCH_CONFIG } from "@/lib/schemas/search-schema";

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface ValidationErrors {
  checkIn?: string;
  checkOut?: string;
  dateRange?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationErrors;
  nights: number | null;
}

/**
 * Hook to validate search date range
 * - Checks if check-in is not in the past
 * - Checks if check-out is after check-in
 * - Enforces minimum and maximum night stays
 */
export function useSearchValidation(dateRange: DateRange): ValidationResult {
  return useMemo(() => {
    const errors: ValidationErrors = {};
    let nights: number | null = null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check-in validation - must not be in the past
    if (dateRange.from) {
      const checkIn = new Date(dateRange.from);
      checkIn.setHours(0, 0, 0, 0);

      if (checkIn < today) {
        errors.checkIn = "Check-in date cannot be in the past";
      }
    }

    // Check-out validation - must be after check-in and within limits
    if (dateRange.from && dateRange.to) {
      const checkIn = new Date(dateRange.from);
      const checkOut = new Date(dateRange.to);
      checkIn.setHours(0, 0, 0, 0);
      checkOut.setHours(0, 0, 0, 0);

      // Calculate nights
      nights = Math.ceil(
        (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (checkOut <= checkIn) {
        errors.checkOut = "Check-out must be after check-in";
      } else if (nights < SEARCH_CONFIG.MIN_NIGHTS) {
        errors.dateRange = `Minimum stay is ${SEARCH_CONFIG.MIN_NIGHTS} night${SEARCH_CONFIG.MIN_NIGHTS > 1 ? "s" : ""}`;
      } else if (nights > SEARCH_CONFIG.DEFAULT_MAX_NIGHTS) {
        errors.dateRange = `Maximum stay is ${SEARCH_CONFIG.DEFAULT_MAX_NIGHTS} nights`;
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      nights,
    };
  }, [dateRange.from, dateRange.to]);
}
