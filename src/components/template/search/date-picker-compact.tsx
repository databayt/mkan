"use client";

import { Calendar } from "@/components/ui/calendar";
import { addDays, startOfToday } from "date-fns";
import { type DateRange } from "react-day-picker";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { SEARCH_CONFIG } from "@/lib/schemas/search-schema";
import { cn } from "@/lib/utils";

interface DatePickerCompactProps {
  dateRange: {
    from: Date | undefined;
    to: Date | undefined;
  };
  onDateChange: (from: Date | undefined, to: Date | undefined) => void;
}

export default function DatePickerCompact({
  dateRange,
  onDateChange,
}: DatePickerCompactProps) {
  const { isValid, errors } = useSearchValidation(dateRange);
  const today = startOfToday();

  const handleSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateChange(range.from, range.to);
    } else {
      onDateChange(undefined, undefined);
    }
  };

  const maxDate = dateRange.from
    ? addDays(dateRange.from, SEARCH_CONFIG.DEFAULT_MAX_NIGHTS)
    : undefined;

  return (
    <div className="flex flex-col items-center w-full">
      {!isValid && (
        <div
          className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg w-full text-xs"
          role="alert"
        >
          {errors.checkIn && (
            <p className="text-red-600">{errors.checkIn}</p>
          )}
          {errors.checkOut && (
            <p className="text-red-600">{errors.checkOut}</p>
          )}
          {errors.dateRange && (
            <p className="text-red-600">{errors.dateRange}</p>
          )}
        </div>
      )}

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
          "rounded-lg border-0 p-0 [--cell-size:1.5rem]",
          "[&_.rdp-months]:flex-col [&_.rdp-months]:gap-2",
          "[&_.rdp-month_caption]:h-6 [&_.rdp-month_caption]:text-xs",
          "[&_.rdp-weekday]:text-[0.65rem]",
          "[&_.rdp-nav]:h-6",
          "[&_.rdp-button_previous]:size-6 [&_.rdp-button_next]:size-6",
          "[&_button]:text-xs",
          !isValid && "ring-2 ring-red-200"
        )}
      />
    </div>
  );
}
