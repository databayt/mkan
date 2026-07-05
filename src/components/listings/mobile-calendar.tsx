"use client";

import { useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { useLocale } from "@/components/internationalization/use-locale";

/**
 * Mobile PDP inline availability calendar — Airbnb's AVAILABILITY_CALENDAR_INLINE
 * section on the phone room page. Renders "{N} nights in {city}" (or "Select
 * dates") over a full-width single-month react-day-picker range picker, with a
 * "Clear dates" link once a range is set.
 *
 * The desktop sibling (availability-calendar.tsx) shows two months and is bound
 * to the reserve card; this one shows ONE month, spans the full width, and works
 * standalone — render `<MobileCalendar city={...} />` with no wiring and it keeps
 * its own range in state. Pass `onRangeChange` (+ `range`) to control it instead.
 *
 * Airbnb styling reuses react-day-picker's own variables (same stylesheet the
 * desktop calendar imports): the accent is retinted to #222 so range endpoints
 * become solid dark circles, the in-range band is a light grey (#f7f7f7), past
 * days are greyed + non-selectable, and blocked days get a strikethrough.
 */

interface MobileCalendarProps {
  /** Listing city, shown in the "{N} nights in {city}" heading. */
  city?: string;
  /** Dates that can't be booked — greyed, struck-through, non-selectable. */
  blockedDates?: Date[];
  /** Override template for the nights heading, e.g. "{n} nights in {city}". */
  nightsLabel?: string;
  /** Controlled range (pair with `onRangeChange`). Omit for standalone use. */
  range?: DateRange;
  /** Controlled change handler. When omitted, the range lives in local state. */
  onRangeChange?: (range: DateRange | undefined) => void;
}

// Scoped to `.mkan-mobile-cal` so it never bleeds into the desktop calendar,
// which shares the same react-day-picker stylesheet. `.mkan-mobile-cal .rdp-root`
// outspecifies the library's own `.rdp-root` variable declarations, so these win.
const CAL_STYLES = `
.mkan-mobile-cal { width: 100%; }
.mkan-mobile-cal .rdp-root {
  --rdp-accent-color: #222222;
  --rdp-accent-background-color: #f7f7f7;
  --rdp-range_start-color: #ffffff;
  --rdp-range_end-color: #ffffff;
  --rdp-range_middle-color: #222222;
  --rdp-today-color: #222222;
  --rdp-selected-border: 2px solid transparent;
  --rdp-day_button-width: 44px;
  --rdp-day_button-height: 44px;
  --rdp-day_button-border-radius: 100%;
  --rdp-nav-height: 2.5rem;
  width: 100%;
  margin: 0;
}
.mkan-mobile-cal .rdp-months,
.mkan-mobile-cal .rdp-month { width: 100%; max-width: 100%; }
.mkan-mobile-cal .rdp-month_grid {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0 2px;
}
.mkan-mobile-cal .rdp-day { width: auto; height: 48px; padding: 0; }
.mkan-mobile-cal .rdp-day_button {
  width: var(--rdp-day_button-width);
  height: var(--rdp-day_button-height);
  margin: 0 auto;
  font-size: 14px;
  font-weight: 500;
}
.mkan-mobile-cal .rdp-selected { font-weight: 600; font-size: inherit; }
.mkan-mobile-cal .rdp-month_caption {
  font-size: 18px;
  font-weight: 600;
  padding-inline-start: 2px;
  padding-bottom: 8px;
}
.mkan-mobile-cal .rdp-weekday {
  font-size: 12px;
  font-weight: 400;
  color: #6c6c6c;
  opacity: 1;
  text-transform: none;
  padding-bottom: 8px;
}
.mkan-mobile-cal .rdp-day.mkan-cal-blocked .rdp-day_button {
  text-decoration: line-through;
  color: #b0b0b0;
}
`;

function diffNights(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

export default function MobileCalendar({
  city = "",
  blockedDates = [],
  nightsLabel,
  range: rangeProp,
  onRangeChange,
}: MobileCalendarProps) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const intlLocale = isAr ? "ar" : "en-US";

  // Controlled when a change handler is supplied; otherwise self-managed so the
  // component works with zero wiring.
  const controlled = onRangeChange !== undefined;
  const [internalRange, setInternalRange] = useState<DateRange | undefined>(undefined);
  const range = controlled ? rangeProp : internalRange;

  const handleSelect = (next: DateRange | undefined) => {
    if (controlled) onRangeChange?.(next);
    else setInternalRange(next);
  };

  const from = range?.from;
  const to = range?.to;
  const nights = from && to ? diffNights(from, to) : 0;

  const heading =
    nights > 0
      ? nightsLabel
        ? nightsLabel.replace("{n}", String(nights)).replace("{city}", city)
        : isAr
          ? `${nights} ${nights === 1 ? "ليلة" : "ليالٍ"} في ${city}`
          : `${nights} ${nights === 1 ? "night" : "nights"} in ${city}`
      : isAr
        ? "اختر التواريخ"
        : "Select dates";

  const subtitle =
    from && to
      ? new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric" }).formatRange(from, to)
      : isAr
        ? "أضف تواريخ رحلتك للحصول على السعر الدقيق"
        : "Add your travel dates for exact pricing";

  const hasRange = Boolean(from || to);

  return (
    <section className="px-4 py-8 relative before:content-[''] before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-[#DDDDDD]">
      <h2 className="text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {heading}
      </h2>
      <p className="text-sm text-[#6C6C6C] mt-1">{subtitle}</p>

      <div className="mkan-mobile-cal mt-6">
        <style>{CAL_STYLES}</style>
        <DayPicker
          mode="range"
          numberOfMonths={1}
          weekStartsOn={0}
          showOutsideDays={false}
          selected={range}
          onSelect={handleSelect}
          disabled={[{ before: new Date() }, ...blockedDates]}
          modifiers={{ mkanBlocked: blockedDates }}
          modifiersClassNames={{ mkanBlocked: "mkan-cal-blocked" }}
          numerals={isAr ? "arab" : "latn"}
          dir={isAr ? "rtl" : "ltr"}
          formatters={{
            formatCaption: (date: Date) =>
              date.toLocaleDateString(intlLocale, { month: "long", year: "numeric" }),
            formatWeekdayName: (date: Date) =>
              date.toLocaleDateString(intlLocale, { weekday: "narrow" }),
          }}
        />
      </div>

      {hasRange && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => handleSelect(undefined)}
            className="text-sm font-medium text-[#222222] underline underline-offset-2"
          >
            {isAr ? "مسح التواريخ" : "Clear dates"}
          </button>
        </div>
      )}
    </section>
  );
}
