"use client"

import { ar, enUS } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import { useLocale } from "@/components/internationalization/use-locale"
import { useDictionary } from "@/components/internationalization/dictionary-context"

// The "When" picker shown on the Experiences and Services tabs — a clone of
// airbnb.com/experiences and /services. Unlike the Homes picker (two months +
// Dates/Flexible toggle), this is a SINGLE-month calendar paired with a column
// of quick-date shortcut cards (Today / Tomorrow / This weekend). Experiences
// and services are point-in-time activities, so the shortcuts and the smaller
// 48px calendar mirror the live site exactly.

interface ExperiencesDatePickerProps {
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  // Same contract as the Homes picker: the parent closes the dropdown once both
  // ends are set. The quick cards pass from===to (a single day) which still
  // satisfies that, so a shortcut click selects and closes in one tap.
  onDateChange: (from: Date | undefined, to: Date | undefined) => void
}

// Midnight-anchored copy so day math never mutates a shared Date and the
// comparison with calendar cells is day-accurate.
function startOfDay(d: Date): Date {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function sameDay(a: Date | undefined, b: Date | undefined): boolean {
  if (!a || !b) return false
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function ExperiencesDatePicker({
  dateRange,
  onDateChange,
}: ExperiencesDatePickerProps) {
  const { locale } = useLocale()
  const isAr = locale === "ar"
  const dict = useDictionary()

  // Quick-date anchors, computed once per render from the local clock.
  const today = startOfDay(new Date())
  const tomorrow = startOfDay(new Date())
  tomorrow.setDate(today.getDate() + 1)

  // "This weekend" = the current week's Friday→Sunday once it's Fri/Sat/Sun,
  // otherwise the upcoming Friday→Sunday. Matches Airbnb's "Jul 3 – 5".
  const dow = today.getDay() // 0 Sun … 6 Sat
  const friday = startOfDay(new Date())
  if (dow === 0) {
    friday.setDate(today.getDate() - 2) // Sunday → back to Friday
  } else if (dow === 6) {
    friday.setDate(today.getDate() - 1) // Saturday → back to Friday
  } else {
    friday.setDate(today.getDate() + ((5 - dow + 7) % 7)) // Mon–Fri → next Friday
  }
  const sunday = new Date(friday)
  sunday.setDate(friday.getDate() + 2)

  const fmtDay = (d: Date) =>
    d.toLocaleDateString(isAr ? "ar" : "en-US", { month: "short", day: "numeric" })

  // "Jul 3 – 5" when same month, else "Jul 30 – Aug 1".
  const fmtWeekend = (from: Date, to: Date) => {
    if (from.getMonth() === to.getMonth()) {
      return `${fmtDay(from)} – ${to.getDate()}`
    }
    return `${fmtDay(from)} – ${fmtDay(to)}`
  }

  const cards = [
    {
      id: "today",
      title: dict.search?.today ?? "Today",
      subtitle: fmtDay(today),
      from: today,
      to: today,
    },
    {
      id: "tomorrow",
      title: dict.search?.tomorrow ?? "Tomorrow",
      subtitle: fmtDay(tomorrow),
      from: tomorrow,
      to: tomorrow,
    },
    {
      id: "weekend",
      title: dict.search?.thisWeekend ?? "This weekend",
      subtitle: fmtWeekend(friday, sunday),
      from: friday,
      to: sunday,
    },
  ] as const

  const isCardActive = (from: Date, to: Date) =>
    sameDay(dateRange.from, from) && sameDay(dateRange.to, to)

  const handleDateSelect = (range: DateRange | undefined) => {
    if (range) onDateChange(range.from, range.to)
  }

  return (
    <div className="flex w-full gap-6 select-none text-[#222222]">
      {/* Quick-date shortcut cards (left column) — 181×104, 12px radius,
          1px #DDDDDD border, a 16px/500 title over a muted 14px date, matching
          the live airbnb.com/experiences capture (card padding 30px 16px →
          104px tall, so the card column is the panel's tallest element exactly
          as on the live site). Selecting one sets a single-day (or weekend)
          range and the parent closes the panel. */}
      <div className="flex w-[181px] shrink-0 flex-col gap-3">
        {cards.map((c) => {
          const active = isCardActive(c.from, c.to)
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onDateChange(c.from, c.to)}
              style={{
                borderWidth: active ? 2 : 1,
                borderStyle: "solid",
                borderColor: active ? "#222222" : "#DDDDDD",
                borderRadius: 12,
                padding: "30px 16px",
              }}
              className="flex flex-col items-start justify-center text-start transition-colors hover:border-[#222222]"
            >
              <span style={{ fontSize: 16, fontWeight: 500, lineHeight: "20px" }}>
                {c.title}
              </span>
              <span
                style={{ fontSize: 14, lineHeight: "18px", marginTop: 4 }}
                className="text-[#6a6a6a]"
              >
                {c.subtitle}
              </span>
            </button>
          )
        })}
      </div>

      {/* Single-month calendar (right). 48px cells, centred 16px/500 caption
          with the nav chevrons flanking it at the month edges — the airbnb.com
          experiences/services layout. Range-capable so "This weekend" and any
          multi-day pick highlight correctly. */}
      <div className="flex flex-1 justify-center">
        <Calendar
          mode="range"
          // First click sets only check-in; the panel stays open for check-out.
          min={1}
          defaultMonth={dateRange?.from ?? today}
          locale={isAr ? ar : enUS}
          selected={dateRange}
          onSelect={handleDateSelect}
          numberOfMonths={1}
          disabled={{ before: today }}
          showOutsideDays={false}
          className="[--cell-size:48px] [--cell-radius:24px] p-0"
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
            day: "size-(--cell-size) p-0 relative focus-within:relative focus-within:z-20 data-[selected-single=true]:bg-[#222222] data-[selected-single=true]:text-white data-[range-start=true]:bg-[#222222] data-[range-start=true]:text-white data-[range-end=true]:bg-[#222222] data-[range-end=true]:text-white data-[range-middle=true]:bg-[#f7f7f7] data-[range-middle=true]:text-[#222222] rounded-full hover:bg-gray-100 transition-all duration-150",
            range_start: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-s-full",
            range_middle: "bg-[#f7f7f7] rounded-none",
            range_end: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-e-full",
            today: "bg-transparent",
          }}
          formatters={{
            formatWeekdayName: (date, options) =>
              date.toLocaleDateString(options?.locale?.code ?? "default", {
                weekday: "narrow",
              }),
          }}
        />
      </div>
    </div>
  )
}
