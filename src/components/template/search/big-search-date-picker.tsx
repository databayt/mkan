"use client"

import { ar, enUS } from "date-fns/locale"
import { type DateRange } from "react-day-picker"

import { Calendar } from "@/components/ui/calendar"
import { useLocale } from "@/components/internationalization/use-locale"

interface BigSearchDatePickerProps {
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  onDateChange: (from: Date | undefined, to: Date | undefined) => void
}

export default function BigSearchDatePicker({
  dateRange,
  onDateChange,
}: BigSearchDatePickerProps) {
  const { locale } = useLocale()

  const handleDateSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateChange(range.from, range.to)
    }
  }

  return (
    <div className="flex w-full justify-center">
      <Calendar
        mode="range"
        defaultMonth={dateRange?.from ?? new Date()}
        locale={locale === "ar" ? ar : enUS}
        selected={dateRange}
        onSelect={handleDateSelect}
        numberOfMonths={2}
      />
    </div>
  )
}
