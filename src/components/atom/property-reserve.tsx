"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { DateRange, DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency, formatDate } from "@/lib/i18n/formatters";
import { checkAvailability, createBooking, getBlockedDates } from "@/lib/actions/booking-actions";
import { toast } from "sonner";

interface AirbnbReserveProps {
  listingId?: number;
  pricePerNight?: number;
  cleaningFee?: number | null;
  serviceFeePct?: number;
  maxGuests?: number;
  rating?: number;
  reviewCount?: number;
  className?: string;
  /**
   * Controlled booking range. When `onRangeChange` is supplied the component is
   * controlled (the listing page lifts this so the inline availability calendar
   * and this card stay in sync); otherwise it keeps its own internal range.
   */
  range?: DateRange;
  onRangeChange?: (range: DateRange | undefined) => void;
  /** Pre-expanded blocked dates from the parent; falls back to its own fetch. */
  blockedDates?: Date[];
  /** Custom button text (default: "Reserve") */
  buttonText?: string;
  /** Hide button when merged to header */
  hideButton?: boolean;
}

const DEFAULT_SERVICE_FEE_PCT = 0.12;

function diffNights(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

const AirbnbReserve: React.FC<AirbnbReserveProps> = ({
  listingId,
  pricePerNight = 0,
  cleaningFee = 0,
  buttonText,
  hideButton = false,
  serviceFeePct = DEFAULT_SERVICE_FEE_PCT,
  maxGuests = 10,
  className = "",
  range: controlledRange,
  onRangeChange,
  blockedDates: controlledBlocked,
}) => {
  const dict = useDictionary() as unknown as Record<string, Record<string, string>>;
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) ?? "ar";
  const { locale } = useLocale();
  const t = dict.booking ?? {};

  // Controlled when the parent passes onRangeChange; otherwise self-managed.
  const isControlled = onRangeChange !== undefined;
  const [internalRange, setInternalRange] = useState<DateRange | undefined>();
  const range = isControlled ? controlledRange : internalRange;
  const setRange = onRangeChange ?? setInternalRange;

  const [guests, setGuests] = useState(1);
  const [internalBlocked, setInternalBlocked] = useState<Date[]>([]);
  const blockedDates = controlledBlocked ?? internalBlocked;
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load blocked dates for the listing so users can't pick conflicting ranges.
  // Skipped when the parent already provides them (controlled blocked dates).
  useEffect(() => {
    if (!listingId || controlledBlocked) return;
    getBlockedDates(listingId)
      .then((ranges) => {
        const dates: Date[] = [];
        for (const r of ranges as Array<{ startDate: Date; endDate: Date }>) {
          const start = new Date(r.startDate);
          const end = new Date(r.endDate);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(new Date(d));
          }
        }
        setInternalBlocked(dates);
      })
      .catch(() => {
        // Soft-fail — user can still attempt a booking and server-side
        // availability check will catch conflicts.
      });
  }, [listingId, controlledBlocked]);

  // Verify availability whenever the range changes to give early feedback.
  // Both setState calls are intentional: clearing the error when range
  // becomes incomplete and flipping isChecking around an async network
  // call. The availability is derived from a server action, not props.
  useEffect(() => {
    if (!listingId || !range?.from || !range?.to) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clearing error when input becomes incomplete; not derivable from props alone.
      setAvailabilityError(null);
      return;
    }
    setIsChecking(true);
    checkAvailability({
      listingId,
      checkIn: range.from,
      checkOut: range.to,
    })
      .then((res: unknown) => {
        const r = res as { available: boolean };
        setAvailabilityError(
          r?.available ? null : (t.unavailable ?? "Those dates aren't available.")
        );
      })
      .catch(() => {
        setAvailabilityError(t.unavailable ?? "Those dates aren't available.");
      })
      .finally(() => setIsChecking(false));
  }, [listingId, range?.from, range?.to, t.unavailable]);

  const nights = useMemo(() => {
    if (!range?.from || !range?.to) return 0;
    return diffNights(range.from, range.to);
  }, [range]);

  const subtotal = nights * pricePerNight;
  const cleaning = nights > 0 ? (cleaningFee ?? 0) : 0;
  const serviceFee = Math.round(subtotal * serviceFeePct);
  const total = subtotal + cleaning + serviceFee;

  const canReserve =
    !!listingId &&
    !!range?.from &&
    !!range?.to &&
    nights > 0 &&
    !availabilityError &&
    !isChecking;

  const onReserve = () => {
    if (!canReserve || !listingId || !range?.from || !range?.to) return;
    startTransition(async () => {
      try {
        const result = (await createBooking({
          listingId,
          checkIn: range.from,
          checkOut: range.to,
          guestCount: guests,
        })) as { success: boolean; booking?: { id: number } };
        const id = result?.booking?.id;
        if (!id) throw new Error("No booking ID returned");
        router.push(`/${lang}/bookings/${id}/checkout`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : (t.createFailed ?? "Could not reserve")
        );
      }
    });
  };

  const money = (n: number) => formatCurrency(n, locale);
  const fmtDay = (d: Date | undefined) =>
    d ? formatDate(d, locale, { year: undefined, month: "short", day: "numeric" }) : "";

  return (
    <>
    <div
      className={`rounded-xl border border-[#DDDDDD] bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)] ${className}`}
    >
      {/* Price headline — 22px/500 unit price + qualifier, like the live card */}
      <div className="mb-5 flex items-baseline gap-1.5">
        <span className="text-[22px] font-medium text-[#222222]">
          {money(pricePerNight || 0)}
        </span>
        <span className="text-sm text-[#222222]">{t.perNight ?? "night"}</span>
      </div>

      {/* Date + guests — single 12px-radius box with hairline internal dividers */}
      <div className="mb-4 overflow-hidden rounded-[12px] border border-[#B0B0B0]">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="grid w-full grid-cols-2 text-start">
              <div className="border-e border-[#B0B0B0] px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#222222]">
                  {t.checkIn ?? "Check-in"}
                </div>
                <div className="text-sm text-[#222222]">
                  {fmtDay(range?.from) || (t.addDate ?? "Add date")}
                </div>
              </div>
              <div className="px-3 py-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#222222]">
                  {t.checkOut ?? "Check-out"}
                </div>
                <div className="text-sm text-[#222222]">
                  {fmtDay(range?.to) || (t.addDate ?? "Add date")}
                </div>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              numberOfMonths={2}
              disabled={[{ before: new Date() }, ...blockedDates]}
            />
          </PopoverContent>
        </Popover>

        {/* Guest picker */}
        <div className="flex items-center justify-between border-t border-[#B0B0B0] px-3 py-2.5">
          <div className="flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#222222]">
              {t.guests ?? "Guests"}
            </div>
            <select
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className="w-full appearance-none bg-transparent text-sm text-[#222222] outline-none"
            >
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? (t.guestSingular ?? "guest") : (t.guestsPlural ?? "guests")}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown className="h-4 w-4 text-[#222222]" />
        </div>
      </div>

      {availabilityError && (
        <p className="mb-2 text-sm text-destructive">{availabilityError}</p>
      )}

      {/* Reserve — Airbnb's Rausch gradient pill, 12px radius */}
      <Button
        className="h-12 w-full rounded-[12px] border-0 text-base font-semibold text-white hover:opacity-95 transition-opacity duration-300"
        style={{
          background:
            "linear-gradient(to right, #E61E4D 0%, #E31C5F 50%, #D70466 100%)",
          opacity: hideButton ? 0 : 1,
          pointerEvents: hideButton ? "none" : "auto",
        }}
        disabled={!canReserve || isPending || hideButton}
        onClick={onReserve}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          buttonText ?? (t.reserve ?? "Reserve")
        )}
      </Button>

      <p className="mt-3 text-center text-sm text-[#6A6A6A]">
        {t.notChargedYet ?? "You won't be charged yet"}
      </p>

      {nights > 0 && (
        <div className="mt-5 space-y-3 text-base text-[#222222]">
          <div className="flex justify-between">
            <span className="underline">
              {money(pricePerNight)} × {nights}{" "}
              {nights === 1
                ? (t.nightSingular ?? "night")
                : (t.nightsPlural ?? "nights")}
            </span>
            <span>{money(subtotal)}</span>
          </div>
          {cleaning > 0 && (
            <div className="flex justify-between">
              <span className="underline">{t.cleaningFee ?? "Cleaning fee"}</span>
              <span>{money(cleaning)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="underline">{t.serviceFee ?? "Service fee"}</span>
            <span>{money(serviceFee)}</span>
          </div>
          <hr className="my-3 border-[#DDDDDD]" />
          <div className="flex justify-between font-semibold">
            <span>{t.total ?? "Total"}</span>
            <span>{money(total)}</span>
          </div>
        </div>
      )}
    </div>

    {/* Report this listing — mirrors Airbnb's REPORT_TO_AIRBNB row below the
        book-it card: centered, muted, flag icon. */}
    <button
      type="button"
      className="mx-auto mt-2 flex items-center gap-2 text-sm text-[#6A6A6A] underline underline-offset-2 hover:text-[#222222]"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" style={{ display: "block", height: 16, width: 16, fill: "currentColor" }}>
        <path d="m7.5011 1c.5272 0 .9591.40794.99725.92537l.00275.07463v1h5.5c.31265 0 .5435.281645.4935.581075l-.01275.056285-.96125 3.36264.96125 3.36265c.08055.2818-.0967.5625-.36775.62465l-.0554.00945-.0576.00325h-5.5c-.5272 0-.9591-.40795-.99725-.92535l-.00275-.07465v-1h-5v6h-1v-14zm1 3h-1v4h1z" />
      </svg>
      {t.reportListing ?? "Report this listing"}
    </button>
    </>
  );
};

export default AirbnbReserve;
