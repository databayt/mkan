"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { DateRange, DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDictionary } from "@/components/internationalization/dictionary-context";
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
}

const DEFAULT_SERVICE_FEE_PCT = 0.12;

function formatDate(d: Date | undefined): string {
  if (!d) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function diffNights(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

const AirbnbReserve: React.FC<AirbnbReserveProps> = ({
  listingId,
  pricePerNight = 0,
  cleaningFee = 0,
  serviceFeePct = DEFAULT_SERVICE_FEE_PCT,
  maxGuests = 10,
  className = "",
}) => {
  const dict = useDictionary() as unknown as Record<string, Record<string, string>>;
  const params = useParams();
  const router = useRouter();
  const lang = (params?.lang as string) ?? "en";
  const t = dict.booking ?? {};
  const currency = dict.common?.currency ?? "$";

  const [range, setRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState(1);
  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load blocked dates for the listing so users can't pick conflicting ranges.
  useEffect(() => {
    if (!listingId) return;
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
        setBlockedDates(dates);
      })
      .catch(() => {
        // Soft-fail — user can still attempt a booking and server-side
        // availability check will catch conflicts.
      });
  }, [listingId]);

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

  return (
    <div className={`rounded-xl border bg-background p-4 max-w-xs ${className}`}>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <span className="text-lg font-bold">
            {currency}
            {pricePerNight || 0}
          </span>
          <span className="text-muted-foreground text-sm ms-1">
            {t.perNight ?? "/ night"}
          </span>
        </div>
      </div>

      {/* Date range picker */}
      <div className="border rounded-md mb-3">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="grid grid-cols-2 w-full text-start"
            >
              <div className="p-2 border-e">
                <div className="text-[10px] font-medium uppercase tracking-wide">
                  {t.checkIn ?? "Check-in"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(range?.from) || "—"}
                </div>
              </div>
              <div className="p-2">
                <div className="text-[10px] font-medium uppercase tracking-wide">
                  {t.checkOut ?? "Check-out"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(range?.to) || "—"}
                </div>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              numberOfMonths={1}
              disabled={[{ before: new Date() }, ...blockedDates]}
            />
          </PopoverContent>
        </Popover>

        {/* Guest picker */}
        <div className="border-t p-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide">
              {t.guests ?? "Guests"}
            </div>
            <select
              value={guests}
              onChange={(e) => setGuests(Number(e.target.value))}
              className="text-xs bg-transparent outline-none"
            >
              {Array.from({ length: maxGuests }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? (t.guestSingular ?? "guest") : (t.guestsPlural ?? "guests")}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>

      {availabilityError && (
        <p className="text-xs text-destructive mb-2">{availabilityError}</p>
      )}

      <Button
        className="w-full bg-[#E91E63] hover:bg-[#D81B60] text-white font-medium h-10 mb-3 text-sm"
        size="sm"
        disabled={!canReserve || isPending}
        onClick={onReserve}
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          t.reserve ?? "Reserve"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground mb-4">
        {t.notChargedYet ?? "You won't be charged yet"}
      </p>

      {nights > 0 && (
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="underline">
              {currency}
              {pricePerNight} × {nights} {nights === 1 ? (t.nightSingular ?? "night") : (t.nightsPlural ?? "nights")}
            </span>
            <span>
              {currency}
              {subtotal}
            </span>
          </div>
          {cleaning > 0 && (
            <div className="flex justify-between">
              <span className="underline">{t.cleaningFee ?? "Cleaning fee"}</span>
              <span>
                {currency}
                {cleaning}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="underline">{t.serviceFee ?? "Service fee"}</span>
            <span>
              {currency}
              {serviceFee}
            </span>
          </div>
          <hr className="my-2" />
          <div className="flex justify-between font-medium">
            <span>{t.total ?? "Total"}</span>
            <span>
              {currency}
              {total}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default AirbnbReserve;
