"use client";

import { Calendar } from "@/components/ui/calendar";

interface TransportDatePickerProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
}

export default function TransportDatePicker({
  date,
  onDateChange,
}: TransportDatePickerProps) {
  const handleDateSelect = (selectedDate: Date | undefined) => {
    onDateChange(selectedDate);
  };

  return (
    <div className="w-full flex justify-center">
      <Calendar
        mode="single"
        selected={date}
        onSelect={handleDateSelect}
        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
        className="w-full p-0 border-0"
        classNames={{
          root: "w-full border-0",
          months: "w-full flex justify-center border-0",
          month: "border-0",
          week: "flex w-full mt-0 border-0",
          caption: "py-0 text-sm border-0 mb-0",
          table: "w-full border-collapse border-0",
          day: "h-10 w-12 text-sm p-0 flex items-center justify-center border-0",
          weekday:
            "text-sm h-10 w-12 flex items-center justify-center p-0 border-0",
          head: "border-0",
          head_row: "border-0",
          head_cell: "border-0",
          row: "border-0",
          cell: "border-0",
          weekdays: "flex gap-0",
        }}
      />
    </div>
  );
}
