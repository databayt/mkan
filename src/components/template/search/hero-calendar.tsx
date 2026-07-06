"use client";

import { Calendar } from "@/components/ui/calendar";
import { ar, enUS } from "date-fns/locale";

// Locale-aware wrapper around the shadcn Calendar. Loaded via next/dynamic from
// vertical-search so react-day-picker + the date-fns locale bundles download
// only when a date field is first opened, not with the hero's initial JS.
type HeroCalendarProps = React.ComponentProps<typeof Calendar> & {
  isAr: boolean;
};

export default function HeroCalendar({ isAr, ...props }: HeroCalendarProps) {
  return <Calendar {...props} locale={isAr ? ar : enUS} />;
}
