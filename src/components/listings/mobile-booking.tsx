"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DateRange } from "react-day-picker";
import MobileCalendar from "./mobile-calendar";
import { getBlockedDates } from "@/lib/actions/booking-actions";

/**
 * Shared booking state for the MOBILE listing page — Airbnb's phone PDP keeps
 * the inline availability calendar and the fixed BOOK_IT_FLOATING_FOOTER in
 * lockstep: completing a range inline re-prices the footer, and a range that
 * covers a blocked night flips the footer into its "Change dates" shape.
 * Server components (map, reviews, host) sit between the two in the page tree,
 * so the selection lives in this context rather than a common parent.
 *
 * The footer derives one of three shapes from here (see mobile-reserve.tsx):
 *   noDates — no complete range         → "Add dates for prices" + Check availability
 *   blocked — range spans a blocked day → dates + "Change dates" + error toast
 *   ready   — bookable range            → total price + dates + Call (phase-1 Reserve)
 */

export type MobileBookingState = "noDates" | "blocked" | "ready";

interface MobileBookingValue {
  range: DateRange | undefined;
  setRange: (range: DateRange | undefined) => void;
  blockedDates: Date[];
  state: MobileBookingState;
  nights: number;
  /** Stay total (nights × rate + cleaning fee) — the all-fees-included price. */
  total: number;
  pricePerNight: number;
  city: string;
  phone: string;
  rating: number;
  reviewsCount: number;
}

const MobileBookingContext = createContext<MobileBookingValue | null>(null);

export function useMobileBooking(): MobileBookingValue {
  const ctx = useContext(MobileBookingContext);
  if (!ctx) throw new Error("useMobileBooking must be used within MobileBookingProvider");
  return ctx;
}

/** Anchor the footer's "Check availability" / "Change dates" buttons scroll to. */
export const MOBILE_CALENDAR_ANCHOR = "mobile-availability-calendar";

const dayKey = (d: Date) => d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();

/** Parse a yyyy-mm-dd search param at LOCAL midnight (`new Date("2026-07-06")` is UTC). */
function parseDateParam(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

interface MobileBookingProviderProps {
  listingId: number;
  pricePerNight: number;
  cleaningFee?: number;
  city?: string;
  phone: string;
  rating?: number;
  reviewsCount?: number;
  /** Optional yyyy-mm-dd (from ?checkIn / ?check_in) so shared links land priced. */
  initialCheckIn?: string;
  initialCheckOut?: string;
  children: ReactNode;
}

export function MobileBookingProvider({
  listingId,
  pricePerNight,
  cleaningFee = 0,
  city = "",
  phone,
  rating = 0,
  reviewsCount = 0,
  initialCheckIn,
  initialCheckOut,
  children,
}: MobileBookingProviderProps) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = parseDateParam(initialCheckIn);
    const to = parseDateParam(initialCheckOut);
    if (!from || !to || to <= from) return undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return from < today ? undefined : { from, to };
  });

  // Blocked days expand from the host's BlockedDate ranges, same as the desktop
  // tree (listing-details-client.tsx) — fetched once, handed to the calendar
  // (strikethrough days) and to the footer's availability check.
  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  useEffect(() => {
    getBlockedDates(listingId)
      .then((ranges) => {
        const dates: Date[] = [];
        for (const r of ranges as Array<{ startDate: Date | string; endDate: Date | string }>) {
          const end = new Date(r.endDate);
          for (let d = new Date(r.startDate); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
          }
        }
        setBlockedDates(dates);
      })
      .catch(() => {
        // Soft-fail — phase-1 booking happens on the phone; the host is the
        // final availability check.
      });
  }, [listingId]);

  const value = useMemo<MobileBookingValue>(() => {
    const from = range?.from;
    const to = range?.to;
    const nights =
      from && to ? Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000)) : 0;

    let state: MobileBookingState = "noDates";
    if (from && to && nights > 0) {
      const blocked = new Set(blockedDates.map(dayKey));
      state = "ready";
      // Occupied nights are [from, to) — checking out the morning of a blocked
      // day is fine, so the checkout date itself is not tested.
      for (let d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
        if (blocked.has(dayKey(d))) {
          state = "blocked";
          break;
        }
      }
    }

    return {
      range,
      setRange,
      blockedDates,
      state,
      nights,
      total: nights * pricePerNight + (nights > 0 ? cleaningFee : 0),
      pricePerNight,
      city,
      phone,
      rating,
      reviewsCount,
    };
  }, [range, blockedDates, pricePerNight, cleaningFee, city, phone, rating, reviewsCount]);

  return <MobileBookingContext.Provider value={value}>{children}</MobileBookingContext.Provider>;
}

/** The inline calendar section, bound to the shared range + blocked days. */
export function MobileBookingCalendar() {
  const { city, range, setRange, blockedDates } = useMobileBooking();
  return (
    <div id={MOBILE_CALENDAR_ANCHOR} className="scroll-mt-4">
      <MobileCalendar
        city={city || undefined}
        range={range}
        onRangeChange={setRange}
        blockedDates={blockedDates}
      />
    </div>
  );
}
