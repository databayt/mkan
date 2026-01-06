"use client";

import { Calendar } from "@/components/ui/calendar";
import { addDays, startOfToday } from "date-fns";
import { type DateRange } from "react-day-picker";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { SEARCH_CONFIG } from "@/lib/schemas/search-schema";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
  onDateChange: (from: Date | undefined, to: Date | undefined) => void;
}

export default function DatePickerDropdown({
  dateRange,
  onDateChange,
}: DatePickerProps) {
  const { isValid, errors, nights } = useSearchValidation(dateRange);
  const today = startOfToday();

  const handleSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateChange(range.from, range.to);
    } else {
      onDateChange(undefined, undefined);
    }
  };

  // Calculate max date based on check-in selection
  const maxDate = dateRange.from
    ? addDays(dateRange.from, SEARCH_CONFIG.DEFAULT_MAX_NIGHTS)
    : undefined;

  return (
    <div className="flex flex-col items-center">
      {/* Validation Errors */}
      {!isValid && (
        <div
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg w-full"
          role="alert"
        >
          {errors.checkIn && (
            <p className="text-red-600 text-sm">{errors.checkIn}</p>
          )}
          {errors.checkOut && (
            <p className="text-red-600 text-sm">{errors.checkOut}</p>
          )}
          {errors.dateRange && (
            <p className="text-red-600 text-sm">{errors.dateRange}</p>
          )}
        </div>
      )}

      {/* Stay Duration Info */}
      <div className="text-sm text-gray-500 mb-2 text-center">
        {nights !== null && nights > 0 ? (
          <span className="font-medium text-gray-700">
            {nights} night{nights > 1 ? "s" : ""} selected
          </span>
        ) : (
          <span>
            Min {SEARCH_CONFIG.MIN_NIGHTS} night, max{" "}
            {SEARCH_CONFIG.DEFAULT_MAX_NIGHTS} nights
          </span>
        )}
      </div>

      <Calendar
        mode="range"
        defaultMonth={dateRange.from || today}
        selected={dateRange}
        onSelect={handleSelect}
        numberOfMonths={2}
        disabled={{ before: today }}
        fromDate={today}
        toDate={maxDate}
        className={cn(
          "rounded-lg border-0",
          !isValid && "ring-2 ring-red-200"
        )}
      />
    </div>
  );
}
