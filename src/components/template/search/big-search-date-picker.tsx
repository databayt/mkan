"use client"

import { ar, enUS } from "date-fns/locale"
import { type DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import { useLocale } from "@/components/internationalization/use-locale"
import { CalendarDays } from "lucide-react"

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
}: BigSearchDatePickerProps) {
  const { locale } = useLocale()
  const t = pickerTranslations[locale === "ar" ? "ar" : "en"]

  const handleDateSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateChange(range.from, range.to)
    }
  }

  // Generate the next 6 months from the current date
  const generateMonths = () => {
    const months = []
    const start = new Date()
    for (let i = 0; i < 6; i++) {
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

  const dateAdjustmentPills = [
    { value: "exact", label: t.exactDates },
    { value: "1", label: t.plusMinus1Day },
    { value: "2", label: t.plusMinus2Days },
    { value: "3", label: t.plusMinus3Days },
    { value: "7", label: t.plusMinus7Days },
    { value: "14", label: t.plusMinus14Days },
  ]

  return (
    <div className="flex flex-col w-full min-w-[700px] select-none text-[#222222]">
      {/* Segmented Control Header */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-[#ebebeb] p-1 rounded-full border border-gray-200/55">
          <button
            type="button"
            onClick={() => setSearchMode("dates")}
            className={`px-8 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
              searchMode === "dates"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                : "text-[#717171] hover:text-[#222222] hover:bg-gray-200/50 rounded-full"
            }`}
          >
            {t.dates}
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("flexible")}
            className={`px-8 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer ${
              searchMode === "flexible"
                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                : "text-[#717171] hover:text-[#222222] hover:bg-gray-200/50 rounded-full"
            }`}
          >
            {t.flexible}
          </button>
        </div>
      </div>

      {searchMode === "dates" ? (
        <div className="flex flex-col items-center">
          {/* Calendars Container */}
          <div className="w-full flex justify-center py-2">
            <Calendar
              mode="range"
              defaultMonth={dateRange?.from ?? new Date()}
              locale={locale === "ar" ? ar : enUS}
              selected={dateRange}
              onSelect={handleDateSelect}
              numberOfMonths={2}
              disabled={{ before: new Date() }}
              showOutsideDays={false}
              className="[--cell-size:40px] [--cell-radius:20px]"
              classNames={{
                month_caption: "font-semibold text-[16px] text-[#222222] mb-3 text-center",
                weekday: "text-[12px] font-semibold text-[#717171] uppercase select-none w-10 h-10 flex items-center justify-center",
                day: "w-10 h-10 p-0 relative focus-within:relative focus-within:z-20 data-[selected-single=true]:bg-[#222222] data-[selected-single=true]:text-white data-[range-start=true]:bg-[#222222] data-[range-start=true]:text-white data-[range-end=true]:bg-[#222222] data-[range-end=true]:text-white data-[range-middle=true]:bg-[#f7f7f7] data-[range-middle=true]:text-[#222222] rounded-full hover:bg-gray-100 transition-all duration-150",
                range_start: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-s-full",
                range_middle: "bg-[#f7f7f7] rounded-none",
                range_end: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-e-full",
              }}
              formatters={{
                formatWeekdayName: (date, options) => {
                  return date.toLocaleDateString(options?.locale?.code ?? "default", { weekday: "narrow" })
                }
              }}
            />
          </div>

          {/* Date Flexibility Pills */}
          <div className="w-full border-t border-gray-100 mt-6 pt-6 flex flex-wrap justify-center gap-2.5">
            {dateAdjustmentPills.map((pill) => {
              const isActive = dateFlexibility === pill.value
              return (
                <button
                  key={pill.value}
                  type="button"
                  onClick={() => setDateFlexibility(pill.value)}
                  className={`py-2 px-5 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${
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
        <div className="flex flex-col items-center py-4 px-2">
          {/* Duration Selector */}
          <div className="text-center font-medium text-base text-[#222222] mb-4">
            {t.howLongStay}
          </div>
          <div className="flex justify-center gap-3 mb-8">
            {(["weekend", "week", "month"] as const).map((duration) => {
              const label = duration === "weekend" ? t.weekend : duration === "week" ? t.week : t.month
              const isActive = flexibleDuration === duration
              return (
                <button
                  key={duration}
                  type="button"
                  onClick={() => setFlexibleDuration(duration)}
                  className={`py-2.5 px-6 rounded-full text-sm font-semibold border transition-all duration-150 cursor-pointer ${
                    isActive
                      ? "border-[#222222] border-2 bg-[#f7f7f7] text-[#222222]"
                      : "border-gray-200 text-[#222222] bg-white hover:border-[#222222]"
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Month Selector */}
          <div className="text-center font-medium text-base text-[#222222] mb-5">
            {t.whenGo}
          </div>
          <div className="grid grid-cols-6 gap-3 w-full">
            {monthsList.map((month) => {
              const isSelected = flexibleMonths.includes(month.key)
              return (
                <button
                  key={month.key}
                  type="button"
                  onClick={() => toggleMonth(month.key)}
                  className={`flex flex-col items-center justify-center p-4 border rounded-2xl aspect-[4/5] transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "border-[#222222] border-2 bg-[#f7f7f7] shadow-sm font-semibold"
                      : "border-gray-200 bg-white hover:border-[#222222]"
                  }`}
                >
                  <CalendarDays className={`w-6 h-6 mb-3 transition-colors ${
                    isSelected ? "text-[#222222]" : "text-gray-400"
                  }`} />
                  <div className="text-xs font-semibold">{month.name}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{month.year}</div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
