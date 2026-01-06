"use client"

import { Calendar } from "@/components/ui/calendar"
import { type DateRange } from "react-day-picker"

interface BigSearchDatePickerProps {
  dateRange: {
    from: Date | undefined
    to: Date | undefined
  }
  onDateChange: (from: Date | undefined, to: Date | undefined) => void
}

export default function BigSearchDatePicker({
  dateRange,
  onDateChange
}: BigSearchDatePickerProps) {
  const handleDateSelect = (range: DateRange | undefined) => {
    if (range) {
      onDateChange(range.from, range.to)
    }
  }

  return (
    <div className="w-full flex justify-center">
      <Calendar
        mode="range"
        defaultMonth={dateRange?.from}
        selected={dateRange}
        onSelect={handleDateSelect}
        numberOfMonths={2}
        className="w-full p-0 [--cell-size:3rem] border-0"
        classNames={{
          root: "w-full border-0",
          months: "w-full flex gap-8 border-0",
          month: "flex-1 min-w-0 border-0",
          week: "flex w-full mt-0 border-0",
          caption: "py-0 text-sm border-0 mb-0",
          table: "w-full border-collapse border-0",
          day: "h-10 w-12 text-sm p-0 flex items-center justify-center border-0",
          weekday: "text-sm h-10 w-12 flex items-center justify-center p-0 border-0",
          head: "border-0",
          head_row: "border-0",
          head_cell: "border-0",
          row: "border-0",
          cell: "border-0",
          weekdays: "flex gap-0"
        }}
      />
    </div>
  )
} 