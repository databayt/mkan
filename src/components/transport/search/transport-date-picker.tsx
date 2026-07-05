"use client";

import { type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { ar, enUS } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";

interface TransportDatePickerProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

// Single-date picker styled like the homepage hero calendar (rounded day
// cells, black selected day via the --primary override, narrow weekday
// labels) — the only difference from the homepage is mode="single" (a bus
// trip is one date, not a stay range).
export default function TransportDatePicker({
  date,
  onDateChange,
}: TransportDatePickerProps) {
  const params = useParams();
  const isAr = ((params?.lang as string) ?? "en") === "ar";

  return (
    <div
      className="flex justify-center"
      // Override the theme --primary to black so the selected day renders
      // foreground/black instead of brand red (same trick as the homepage).
      style={
        {
          "--primary": "#222222",
          "--color-primary": "#222222",
          "--primary-foreground": "#ffffff",
          "--color-primary-foreground": "#ffffff",
        } as CSSProperties
      }
    >
      <Calendar
        mode="single"
        numberOfMonths={1}
        defaultMonth={date ?? new Date()}
        locale={isAr ? ar : enUS}
        selected={date}
        onSelect={onDateChange}
        disabled={(d) => {
          const t0 = new Date();
          t0.setHours(0, 0, 0, 0);
          return d < t0;
        }}
        showOutsideDays={false}
        // Cell size via inline style (lands on the day-picker root, beating the
        // base className default) so it fits the panel without a brand-new
        // arbitrary utility.
        style={
          {
            "--cell-size": "42px",
            "--cell-radius": "21px",
          } as CSSProperties
        }
        className="p-0"
        classNames={{
          root: "p-0",
          months: "relative flex flex-row",
          month: "flex flex-col gap-1.5",
          month_grid: "w-auto",
          week: "mt-0",
          month_caption:
            "h-9 mb-1 flex w-full items-center justify-center px-(--cell-size)",
          caption_label: "text-base font-medium text-[#222222]",
          button_previous: "size-9 text-[#222222]",
          button_next: "size-9 text-[#222222]",
          weekday:
            "w-(--cell-size) h-7 flex items-center justify-center text-xs font-normal text-[#6a6a6a] select-none",
          day: "size-(--cell-size) p-0 relative focus-within:relative focus-within:z-20 rounded-full hover:bg-gray-100 transition-all duration-150",
          today: "bg-transparent",
        }}
        formatters={{
          formatWeekdayName: (d, options) =>
            d.toLocaleDateString(options?.locale?.code ?? "default", {
              weekday: "narrow",
            }),
        }}
      />
    </div>
  );
}
