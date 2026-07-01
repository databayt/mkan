"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { ar, enUS } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import { useLocale } from "@/components/internationalization/use-locale"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"

export const pickerTranslations = {
  en: {
    dates: "Dates",
    flexible: "Flexible",
    exactDates: "Exact dates",
    plusMinus1Day: "± 1 day",
    plusMinus2Days: "± 2 days",
    plusMinus3Days: "± 3 days",
    plusMinus7Days: "± 7 days",
    plusMinus14Days: "± 14 days",
    howLongStay: "How long would you like to stay?",
    weekend: "Weekend",
    week: "Week",
    month: "Month",
    goAnytime: "Go anytime",
    goIn: "Go in",
    whenGo: "When do you want to go?",
    monthsName: {
      "0": "January", "1": "February", "2": "March", "3": "April", "4": "May", "5": "June",
      "6": "July", "7": "August", "8": "September", "9": "October", "10": "November", "11": "December"
    }
  },
  ar: {
    dates: "التواريخ",
    flexible: "مرن",
    exactDates: "التواريخ المحددة",
    plusMinus1Day: "± يوم واحد",
    plusMinus2Days: "± يومين",
    plusMinus3Days: "± 3 أيام",
    plusMinus7Days: "± 7 أيام",
    plusMinus14Days: "± 14 يوماً",
    howLongStay: "ما هي مدة إقامتك؟",
    weekend: "عطلة نهاية الأسبوع",
    week: "أسبوع",
    month: "شهر",
    goAnytime: "اذهب في أي وقت",
    goIn: "اذهب في",
    whenGo: "متى تريد الذهاب؟",
    monthsName: {
      "0": "يناير", "1": "فبراير", "2": "مارس", "3": "أبريل", "4": "مايو", "5": "يونيو",
      "6": "يوليو", "7": "أغسطس", "8": "سبتمبر", "9": "أكتوبر", "10": "نوفمبر", "11": "ديسمبر"
    }
  }
} as const;

interface BigSearchDatePickerProps {
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  onDateChange: (from: Date | undefined, to: Date | undefined) => void
  searchMode: "dates" | "flexible"
  setSearchMode: (mode: "dates" | "flexible") => void
  flexibleDuration: "weekend" | "week" | "month"
  setFlexibleDuration: (duration: "weekend" | "week" | "month") => void
  flexibleMonths: string[]
  setFlexibleMonths: (months: string[] | ((prev: string[]) => string[])) => void
  dateFlexibility: string
  setDateFlexibility: (flex: string) => void
  // Compact = the mobile variant: a single-month calendar at 44px cells with no
  // fixed 700px minimum, so the hero's mobile card can reuse this exact picker
  // (Dates / Flexible tabs, ± flexibility pills, month carousel) at phone width.
  compact?: boolean
}

export default function BigSearchDatePicker({
  dateRange,
  onDateChange,
  searchMode,
  setSearchMode,
  flexibleDuration,
  setFlexibleDuration,
  flexibleMonths,
  setFlexibleMonths,
  dateFlexibility,
  setDateFlexibility,
  compact = false,
}: BigSearchDatePickerProps) {
  const { locale } = useLocale()
  const isAr = locale === "ar"
  const t = pickerTranslations[isAr ? "ar" : "en"]

  const handleDateSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateChange(range.from, range.to)
    }
  }

  // Generate 12 months from the current month forward — Airbnb's Flexible tab
  // shows a full year of month chips in one horizontally-scrollable row.
  const generateMonths = () => {
    const months = []
    const start = new Date()
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
      const year = d.getFullYear()
      const monthNum = String(d.getMonth() + 1).padStart(2, "0")
      const key = `${year}-${monthNum}`
      const monthIdx = d.getMonth()
      const name = t.monthsName[monthIdx.toString() as keyof typeof t.monthsName]
      months.push({ key, name, year })
    }
    return months
  }

  const monthsList = generateMonths()

  const toggleMonth = (monthKey: string) => {
    setFlexibleMonths((prev) => {
      if (prev.includes(monthKey)) {
        return prev.filter((m) => m !== monthKey)
      } else {
        return [...prev, monthKey]
      }
    })
  }

  // Dynamic month-section heading: "Go anytime" with nothing picked, else
  // "Go in July" / "Go in July & August" — mirrors airbnb.com.
  const selectedMonthNames = () => {
    const sorted = [...flexibleMonths].sort()
    const names = sorted.map((k) => {
      const monthStr = k.split("-")[1] ?? "1"
      const idx = (parseInt(monthStr, 10) - 1).toString()
      return t.monthsName[idx as keyof typeof t.monthsName]
    })
    if (names.length === 0) return ""
    if (names.length === 1) return names[0]
    if (isAr) return names.join(" و ")
    if (names.length === 2) return `${names[0]} & ${names[1]}`
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`
  }
  const monthHeading =
    flexibleMonths.length === 0 ? t.goAnytime : `${t.goIn} ${selectedMonthNames()}`

  const dateAdjustmentPills = [
    { value: "exact", label: t.exactDates },
    { value: "1", label: t.plusMinus1Day },
    { value: "2", label: t.plusMinus2Days },
    { value: "3", label: t.plusMinus3Days },
    { value: "7", label: t.plusMinus7Days },
    { value: "14", label: t.plusMinus14Days },
  ]

  // ---- Month-chip carousel scrolling (Flexible tab) ----
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    const pos = Math.abs(el.scrollLeft) // abs handles RTL (negative in Chrome)
    setCanPrev(pos > 4)
    setCanNext(pos < max - 4)
  }, [])

  useEffect(() => {
    if (searchMode !== "flexible") return undefined
    // measure after the row paints
    const id = requestAnimationFrame(updateArrows)
    return () => cancelAnimationFrame(id)
  }, [searchMode, updateArrows])

  const step = (dir: -1 | 1) => {
    const el = scrollRef.current
    if (!el) return
    const delta = (isAr ? -1 : 1) * dir * 280
    el.scrollBy({ left: delta, behavior: "smooth" })
  }

  return (
    <div
      className={`flex flex-col w-full select-none text-[#222222] ${
        compact ? "" : "min-w-[700px]"
      }`}
    >
      {/* Segmented Control Header */}
      <div className={`flex justify-center ${compact ? "mb-4" : "mb-5"}`}>
        <div className="inline-flex bg-[#ebebeb] p-1 rounded-full border border-gray-200/55">
          <button
            type="button"
            onClick={() => setSearchMode("dates")}
            className={`${
              compact ? "px-8" : "px-10"
            } py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
              searchMode === "dates"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#DDDDDD]"
                : "text-[#717171] hover:text-[#222222] rounded-full"
            }`}
          >
            {t.dates}
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("flexible")}
            className={`${
              compact ? "px-8" : "px-10"
            } py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
              searchMode === "flexible"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#DDDDDD]"
                : "text-[#717171] hover:text-[#222222] rounded-full"
            }`}
          >
            {t.flexible}
          </button>
        </div>
      </div>

      {searchMode === "dates" ? (
        <div className="flex flex-col">
          {/* Calendar — two-month full-width on desktop; a single centred month
              at 44px cells on mobile (compact). Both share the same black
              range styling and select check-in first, then check-out (min=1 so
              the first click leaves `to` undefined and the panel stays open).
              p-0 kills the shadcn Calendar's default padding so the panel
              height stays tight. */}
          <div className={compact ? "w-full flex justify-center" : "w-full"}>
            <Calendar
              mode="range"
              min={1}
              defaultMonth={dateRange?.from ?? new Date()}
              locale={isAr ? ar : enUS}
              selected={dateRange}
              onSelect={handleDateSelect}
              numberOfMonths={compact ? 1 : 2}
              disabled={{ before: new Date() }}
              showOutsideDays={false}
              className={
                compact
                  ? "[--cell-size:44px] [--cell-radius:22px] p-0"
                  : "[--cell-size:52px] [--cell-radius:26px] w-full p-0"
              }
              classNames={
                compact
                  ? {
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
                    }
                  : {
                      root: "w-full p-0",
                      months: "relative flex w-full flex-row",
                      month: "flex-1 flex flex-col items-center gap-1.5",
                      month_grid: "w-auto",
                      week: "mt-0",
                      // Caption row shrunk from h-(--cell-size)=52px to h-9 (36px),
                      // and the nav buttons matched to size-9 so the arrows stay
                      // on the same line as the month label.
                      month_caption:
                        "h-9 mb-1 flex w-full items-center justify-center px-(--cell-size)",
                      caption_label: "text-base font-medium text-[#222222]",
                      button_previous: "size-9 text-[#222222]",
                      button_next: "size-9 text-[#222222]",
                      // Weekday band shrunk from 52px to 28px (h-7); width kept
                      // at --cell-size so columns stay aligned with the day grid.
                      weekday:
                        "w-(--cell-size) h-7 flex items-center justify-center text-xs font-normal text-[#6a6a6a] uppercase select-none",
                      day: "size-(--cell-size) p-0 relative focus-within:relative focus-within:z-20 data-[selected-single=true]:bg-[#222222] data-[selected-single=true]:text-white data-[range-start=true]:bg-[#222222] data-[range-start=true]:text-white data-[range-end=true]:bg-[#222222] data-[range-end=true]:text-white data-[range-middle=true]:bg-[#f7f7f7] data-[range-middle=true]:text-[#222222] rounded-full hover:bg-gray-100 transition-all duration-150",
                      range_start: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-s-full",
                      range_middle: "bg-[#f7f7f7] rounded-none",
                      range_end: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-e-full",
                      today: "bg-transparent",
                    }
              }
              formatters={{
                formatWeekdayName: (date, options) => {
                  return date.toLocaleDateString(options?.locale?.code ?? "default", { weekday: "narrow" })
                }
              }}
            />
          </div>

          {/* Date Flexibility Pills — wrap to multiple rows on desktop; on
              mobile (compact) stay in a single horizontally-scrollable row so
              the panel height never grows. */}
          <div
            className={`w-full border-t border-gray-100 gap-2.5 ${
              compact
                ? "mt-4 pt-4 flex flex-nowrap overflow-x-auto pb-1"
                : "mt-5 pt-5 flex flex-wrap justify-start"
            }`}
            style={compact ? { scrollbarWidth: "none", msOverflowStyle: "none" } : undefined}
          >
            {dateAdjustmentPills.map((pill) => {
              const isActive = dateFlexibility === pill.value
              return (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => setDateFlexibility(pill.value)}
                  className={`shrink-0 whitespace-nowrap py-2 px-5 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "border-[#222222] border-2 bg-white text-[#222222]"
                      : "border-gray-200 text-[#222222] bg-white hover:border-[#222222]"
                  }`}
                >
                  {pill.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className={`flex flex-col items-center ${compact ? "pt-3 pb-4" : "pt-7 pb-8"}`}>
          {/* Duration Selector */}
          <div
            className={`text-center font-medium text-[#222222] ${compact ? "mb-3" : "mb-4"}`}
            style={{ fontSize: 18, lineHeight: "24px" }}
          >
            {t.howLongStay}
          </div>
          <div className={`flex justify-center gap-3 ${compact ? "mb-7" : "mb-12"}`}>
            {(["weekend", "week", "month"] as const).map((duration) => {
              const label = duration === "weekend" ? t.weekend : duration === "week" ? t.week : t.month
              const isActive = flexibleDuration === duration
              return (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setFlexibleDuration(duration)}
                  className={`py-2.5 px-6 rounded-full text-sm font-medium border transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "border-[#222222] border-2 bg-white text-[#222222]"
                      : "border-gray-200 text-[#222222] bg-white hover:border-[#222222]"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Month Selector heading — "Go anytime" / "Go in July" */}
          <div
            className={`text-center font-medium text-[#222222] ${compact ? "mb-4" : "mb-6"}`}
            style={{ fontSize: 18, lineHeight: "24px" }}
          >
            {monthHeading}
          </div>

          {/* Month chip carousel — horizontally scrollable row of 12 chips,
              each 122×136 like airbnb.com, with prev/next chevrons. */}
          <div className="relative w-full">
            <div
              ref={scrollRef}
              onScroll={updateArrows}
              className="flex gap-2 overflow-x-auto pb-1 px-px"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {monthsList.map((month) => {
                const isSelected = flexibleMonths.includes(month.key)
                return (
                  <button
                    key={month.key}
                    type="button"
                    onClick={() => toggleMonth(month.key)}
                    style={{ width: 122, height: 136 }}
                    className={`shrink-0 flex flex-col items-center justify-center gap-2 rounded-2xl border transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? "border-[#222222] border-2 bg-[#f7f7f7]"
                        : "border-gray-200 bg-white hover:border-[#222222]"
                    }`}
                  >
                    <CalendarIcon
                      className={`w-7 h-7 transition-colors ${
                        isSelected ? "text-[#222222]" : "text-[#6a6a6a]"
                      }`}
                      strokeWidth={1.5}
                    />
                    <div className="font-medium leading-tight" style={{ fontSize: 15 }}>{month.name}</div>
                    <div className="text-[#6a6a6a] leading-tight" style={{ fontSize: 13 }}>{month.year}</div>
                  </button>
                )
              })}
            </div>

            {/* Prev / Next chevrons (Airbnb-style circular buttons) */}
            {canPrev && (
              <button
                type="button"
                aria-label="Previous months"
                onClick={() => step(-1)}
                className="absolute start-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-300 shadow-[0_2px_6px_rgba(0,0,0,0.18)] hover:scale-105 transition-transform"
              >
                <ChevronLeft className="w-4 h-4 text-[#222222] rtl:rotate-180" />
              </button>
            )}
            {canNext && (
              <button
                type="button"
                aria-label="Next months"
                onClick={() => step(1)}
                className="absolute end-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-300 shadow-[0_2px_6px_rgba(0,0,0,0.18)] hover:scale-105 transition-transform"
              >
                <ChevronRight className="w-4 h-4 text-[#222222] rtl:rotate-180" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
