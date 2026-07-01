"use client";

import { DateRange, DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

/**
 * Inline availability calendar — the "{N} nights in {city}" section Airbnb shows
 * between amenities and reviews. It's a controlled dual-month picker bound to
 * the same booking range as the reserve card, so a selection here fills the
 * reserve box (and vice-versa). With no dates it reads "Select check-in date".
 */

interface AvailabilityCalendarProps {
  city?: string;
  range?: DateRange;
  onRangeChange: (range: DateRange | undefined) => void;
  blockedDates?: Date[];
  labels?: {
    selectCheckIn?: string;
    nights?: string; // "{n} nights in {city}"
    addDates?: string;
    clearDates?: string;
  };
}

function diffNights(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function fmt(d?: Date): string {
  return d
    ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";
}

export default function AvailabilityCalendar({
  city = "",
  range,
  onRangeChange,
  blockedDates = [],
  labels,
}: AvailabilityCalendarProps) {
  const nights = range?.from && range?.to ? diffNights(range.from, range.to) : 0;

  const heading =
    nights > 0
      ? (labels?.nights ?? "{n} nights in {city}")
          .replace("{n}", String(nights))
          .replace("{city}", city)
      : (labels?.selectCheckIn ?? "Select check-in date");

  const subtitle =
    range?.from && range?.to
      ? `${fmt(range.from)} – ${fmt(range.to)}`
      : (labels?.addDates ?? "Add your travel dates for exact pricing");

  return (
    <section className="border-b border-[#DDDDDD] py-12">
      <h2 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">{heading}</h2>
      <p className="mt-1 mb-6 text-base text-[#6A6A6A]">{subtitle}</p>

      <div className="flex justify-center md:justify-start">
        <DayPicker
          mode="range"
          numberOfMonths={2}
          selected={range}
          onSelect={onRangeChange}
          disabled={[{ before: new Date() }, ...blockedDates]}
        />
      </div>

      {(range?.from || range?.to) && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onRangeChange(undefined)}
            className="text-sm font-semibold text-[#222222] underline underline-offset-2 hover:opacity-80"
          >
            {labels?.clearDates ?? "Clear dates"}
          </button>
        </div>
      )}
    </section>
  );
}
