"use client";

import { DateRange, DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { useLocale } from "@/components/internationalization/use-locale";

/**
 * Inline availability calendar — the "{N} nights in {city}" section Airbnb shows
 * between amenities and reviews on the DESKTOP room page (AVAILABILITY_CALENDAR_INLINE).
 * A controlled dual-month range picker bound to the same booking range as the
 * reserve card, so a selection here fills the reserve box (and vice-versa). With
 * no dates it reads "Select dates".
 *
 * The mobile sibling (mobile-calendar.tsx) shows ONE full-width month; this one
 * shows TWO side-by-side months with floating prev/next arrows and centered
 * "June 2026" captions, matching Airbnb's desktop layout.
 *
 * Styling reuses react-day-picker's own CSS variables (same stylesheet the mobile
 * calendar imports), scoped to `.mkan-pdp-cal` so it never bleeds into other
 * pickers: the accent is retinted to #222 so range endpoints become solid dark
 * circles, the in-range band is light grey (#f7f7f7), past days are greyed +
 * non-selectable, and blocked days get a strikethrough. `.mkan-pdp-cal .rdp-root`
 * outspecifies the library's own `.rdp-root` variable declarations, so these win.
 */

interface AvailabilityCalendarProps {
  city?: string;
  range?: DateRange;
  onRangeChange: (range: DateRange | undefined) => void;
  blockedDates?: Date[];
  /** Override template for the nights heading, e.g. "{n} nights in {city}". */
  nightsLabel?: string;
}

const CAL_STYLES = `
.mkan-pdp-cal .rdp-root {
  --rdp-accent-color: #222222;
  --rdp-accent-background-color: #f7f7f7;
  --rdp-range_start-color: #ffffff;
  --rdp-range_end-color: #ffffff;
  --rdp-range_middle-color: #222222;
  --rdp-today-color: #222222;
  --rdp-selected-border: 2px solid transparent;
  --rdp-day_button-width: 43px;
  --rdp-day_button-height: 43px;
  --rdp-day_button-border-radius: 100%;
  --rdp-nav-height: 2.5rem;
  margin: 0;
}
.mkan-pdp-cal .rdp-months { gap: 48px; }
.mkan-pdp-cal .rdp-month { position: relative; }
.mkan-pdp-cal .rdp-month_grid {
  border-collapse: separate;
  border-spacing: 0 2px;
}
/* Airbnb nav layout: arrows flank the whole two-month spread — prev at the
   far start, next at the far end — while each month keeps its centered label. */
.mkan-pdp-cal .rdp-nav {
  position: absolute;
  inset-inline: 0;
  top: 0;
  width: 100%;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mkan-pdp-cal .rdp-month_caption {
  height: 2.5rem;
  justify-content: center;
  align-items: center;
  font-size: 16px;
  font-weight: 600;
  padding-bottom: 16px;
}
.mkan-pdp-cal .rdp-weekday {
  width: 43px;
  font-size: 12px;
  font-weight: 400;
  color: #6c6c6c;
  opacity: 1;
  text-transform: none;
  padding-bottom: 8px;
}
.mkan-pdp-cal .rdp-day { width: 43px; height: 43px; padding: 0; }
.mkan-pdp-cal .rdp-day_button {
  width: var(--rdp-day_button-width);
  height: var(--rdp-day_button-height);
  font-size: 14px;
  font-weight: 400;
}
.mkan-pdp-cal .rdp-selected .rdp-day_button { font-weight: 600; }
.mkan-pdp-cal .rdp-today:not(.rdp-selected) .rdp-day_button { font-weight: 600; }
.mkan-pdp-cal .rdp-nav { height: var(--rdp-nav-height); }
.mkan-pdp-cal .rdp-disabled:not(.mkan-cal-blocked) .rdp-day_button {
  color: #DDDDDD;
}
.mkan-pdp-cal .rdp-day.mkan-cal-blocked .rdp-day_button {
  text-decoration: line-through;
  color: #b0b0b0;
}
`;

function diffNights(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

export default function AvailabilityCalendar({
  city = "",
  range,
  onRangeChange,
  blockedDates = [],
  nightsLabel,
}: AvailabilityCalendarProps) {
  const { locale } = useLocale();
  const isAr = locale === "ar";
  const intlLocale = isAr ? "ar" : "en-US";

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

  // Airbnb spells both endpoints out with the year and a spaced hyphen —
  // "Jul 5, 2026 - Jul 10, 2026" — rather than collapsing the shared parts.
  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat(intlLocale, { month: "short", day: "numeric", year: "numeric" }).format(d);
  const subtitle =
    from && to
      ? `${fmtDate(from)} - ${fmtDate(to)}`
      : isAr
        ? "أضف تواريخ رحلتك للحصول على السعر الدقيق"
        : "Add your travel dates for exact pricing";

  const hasRange = Boolean(from || to);

  return (
    <section className="border-b border-[#DDDDDD] py-12">
      <h2 className="text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {heading}
      </h2>
      <p className="mt-1 mb-6 text-sm text-[#6C6C6C]">{subtitle}</p>

      <div className="mkan-pdp-cal flex justify-center md:justify-start">
        <style>{CAL_STYLES}</style>
        <DayPicker
          mode="range"
          numberOfMonths={2}
          weekStartsOn={0}
          showOutsideDays={false}
          startMonth={new Date()}
          selected={range}
          onSelect={onRangeChange}
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
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => onRangeChange(undefined)}
            className="text-sm font-medium text-[#222222] underline underline-offset-2 hover:opacity-80"
          >
            {isAr ? "مسح التواريخ" : "Clear dates"}
          </button>
        </div>
      )}
    </section>
  );
}
