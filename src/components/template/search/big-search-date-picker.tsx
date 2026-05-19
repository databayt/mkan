"use client"

import { ar, enUS } from "date-fns/locale"
import { type DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"
import { useLocale } from "@/components/internationalization/use-locale"

type ActiveDateField = "checkin" | "checkout"

interface BigSearchDatePickerProps {
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  /** Which endpoint the user is currently editing. */
  activeField: ActiveDateField
  /** Called with the *full* new range after applying field-aware logic. */
  onDateChange: (from: Date | undefined, to: Date | undefined) => void
  /**
   * Called when the picker has produced a value that warrants moving focus
   * (e.g. user picked check-in → auto-advance to check-out, or both set →
   * close). Parent decides what to do with focus.
   */
  onAdvance?: (next: ActiveDateField | null) => void
}

export default function BigSearchDatePicker({
  dateRange,
  activeField,
  onDateChange,
  onAdvance,
}: BigSearchDatePickerProps) {
  const { locale } = useLocale()

  /**
   * Field-aware select handler — mirrors VerticalSearch.
   * See vertical-search.tsx for the rationale; in short, we override
   * react-day-picker's range heuristic so the user's clicked field decides
   * which endpoint moves.
   */
  const handleSelect = (
    _range: DateRange | undefined,
    triggerDate: Date | undefined,
  ) => {
    if (!triggerDate) return
    const clicked = triggerDate

    if (activeField === "checkout") {
      if (!dateRange.from) {
        onDateChange(clicked, undefined)
        return
      }
      if (clicked.getTime() <= dateRange.from.getTime()) {
        onDateChange(clicked, dateRange.from)
      } else {
        onDateChange(dateRange.from, clicked)
      }
      onAdvance?.(null)
      return
    }

    // activeField === "checkin"
    if (dateRange.to && clicked.getTime() >= dateRange.to.getTime()) {
      onDateChange(clicked, undefined)
      onAdvance?.("checkout")
    } else {
      onDateChange(clicked, dateRange.to)
      onAdvance?.(dateRange.to ? null : "checkout")
    }
  }

  return (
    <div className="flex w-full justify-center">
      <Calendar
        mode="range"
        defaultMonth={dateRange?.from ?? new Date()}
        locale={locale === "ar" ? ar : enUS}
        selected={dateRange}
        onSelect={handleSelect}
        numberOfMonths={2}
        classNames={{
          // Force a natural per-month width so day cells stay square and the
          // range-middle accent doesn't stretch into a horizontal stripe.
          month: "flex flex-col gap-4 w-[calc(var(--cell-size)*7)]",
        }}
      />
    </div>
  )
}
