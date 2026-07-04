"use client";

import React, { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Locale } from "@/components/internationalization/config";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { formatCurrency, formatNumber, formatDate } from "@/lib/i18n/formatters";
import {
  getMulticalendar,
  setAvailability,
  setPrice,
  type CalendarListing,
  type CalendarBooking,
  type MulticalendarData,
} from "@/lib/actions/calendar-actions";

// ---------- dict ----------
export interface MulticalDict {
  title?: string;
  subtitle?: string;
  today?: string;
  prevMonth?: string;
  nextMonth?: string;
  available?: string;
  blocked?: string;
  reserved?: string;
  open?: string;
  pricePerNight?: string;
  save?: string;
  saving?: string;
  close?: string;
  minNights?: string;
  reservedBy?: string;
  nightsSelected?: string;
  nightSelected?: string;
  perNight?: string;
  guests?: string;
  total?: string;
  changeView?: string;
  settings?: string;
  chooseListing?: string;
}

// ---------- date helpers (never mutate inputs) ----------
export function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}
export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
export function daysOfMonth(anchor: Date): Date[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => new Date(y, m, i + 1));
}
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
/** night `day` is covered by half-open range [startISO, endISO) at day granularity. */
export function covers(day: Date, startISO: string, endISO: string): boolean {
  const d = +startOfDay(day);
  return d >= +startOfDay(new Date(startISO)) && d < +startOfDay(new Date(endISO));
}

export type CellType = "open" | "blocked" | "reserved";
export interface CellInfo {
  type: CellType;
  price: number;
  booking: CalendarBooking | null;
  isCheckIn: boolean;
}
export function cellInfo(listing: CalendarListing, day: Date): CellInfo {
  const booking = listing.bookings.find((b) => covers(day, b.checkIn, b.checkOut)) ?? null;
  const blocked = listing.blocked.find((b) => covers(day, b.startDate, b.endDate));
  const priceRow = listing.pricing.find((p) => covers(day, p.startDate, p.endDate));
  const price = priceRow?.price ?? listing.basePrice;
  if (booking) return { type: "reserved", price, booking, isCheckIn: sameDay(day, new Date(booking.checkIn)) };
  if (blocked) return { type: "blocked", price, booking: null, isCheckIn: false };
  return { type: "open", price, booking: null, isCheckIn: false };
}

const LABEL_W = 208;
const CELL_W = 84;
const ROW_H = 68;

// ============================================================
export default function Multicalendar({
  data,
  lang,
  dict,
  monthStartISO,
}: {
  data: MulticalendarData;
  lang: Locale;
  dict: MulticalDict | null;
  monthStartISO: string;
}) {
  const t = dict ?? {};
  const isRTL = lang === "ar";
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  const [listings, setListings] = useState<CalendarListing[]>(() =>
    // focused listing floats to the top, like Airbnb deep-linking a listing.
    data.focusId
      ? [...data.listings].sort((a, b) => (a.id === data.focusId ? -1 : b.id === data.focusId ? 1 : 0))
      : data.listings,
  );
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(new Date(monthStartISO)));
  const [selection, setSelection] = useState<{ listingId: number; anchor: string; end: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isDesktop = useIsDesktop(640);

  const days = useMemo(() => daysOfMonth(monthAnchor), [monthAnchor]);
  const today = useMemo(() => startOfDay(new Date()), []);
  const monthLabel = monthAnchor.toLocaleDateString(isRTL ? "ar" : "en-US", { month: "long", year: "numeric" });

  async function refreshMonth(anchor: Date) {
    const start = startOfMonth(anchor);
    const end = addMonths(anchor, 1);
    try {
      const res = await getMulticalendar({ start, end, focusId: data.focusId ?? undefined });
      setListings(
        data.focusId
          ? [...res.listings].sort((a, b) => (a.id === data.focusId ? -1 : b.id === data.focusId ? 1 : 0))
          : res.listings,
      );
    } catch {
      setError("Could not load calendar");
    }
  }

  function goMonth(delta: number) {
    const next = addMonths(monthAnchor, delta);
    setMonthAnchor(next);
    setSelection(null);
    setError(null);
    startTransition(() => refreshMonth(next));
  }
  function goToday() {
    const next = startOfMonth(new Date());
    setMonthAnchor(next);
    setSelection(null);
    setError(null);
    startTransition(() => refreshMonth(next));
  }

  function onCellClick(listing: CalendarListing, day: Date) {
    setError(null);
    const key = startOfDay(day).toISOString();
    setSelection((prev) =>
      prev && prev.listingId === listing.id
        ? { listingId: listing.id, anchor: prev.anchor, end: key } // extend range within the same row
        : { listingId: listing.id, anchor: key, end: key },
    );
  }

  // selected range bounds
  const sel = useMemo(() => {
    if (!selection) return null;
    const a = startOfDay(new Date(selection.anchor));
    const b = startOfDay(new Date(selection.end));
    const start = a <= b ? a : b;
    const end = a <= b ? b : a; // inclusive last night
    const listing = listings.find((l) => l.id === selection.listingId) ?? null;
    return { listing, start, end, endExclusive: addDays(end, 1) };
  }, [selection, listings]);

  function isSelected(listingId: number, day: Date): boolean {
    if (!sel || sel.listing?.id !== listingId) return false;
    const d = +startOfDay(day);
    return d >= +sel.start && d <= +sel.end;
  }

  return (
    <div className="flex h-full bg-background">
      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* toolbar */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              aria-label={t.prevMonth ?? "Previous month"}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              disabled={pending}
            >
              <PrevIcon className="size-4" />
            </button>
            <h1 className="min-w-[150px] text-center text-base font-semibold text-foreground sm:text-lg">{monthLabel}</h1>
            <button
              type="button"
              onClick={() => goMonth(1)}
              aria-label={t.nextMonth ?? "Next month"}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              disabled={pending}
            >
              <NextIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="ms-1 rounded-full border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-40"
              disabled={pending}
            >
              {t.today ?? "Today"}
            </button>
          </div>
          {/* legend */}
          <div className="hidden items-center gap-4 text-xs text-muted-foreground md:flex">
            <LegendDot className="bg-background border border-border" label={t.available ?? "Available"} />
            <LegendDot className="bg-muted" label={t.blocked ?? "Blocked"} />
            <LegendDot className="bg-foreground/15" label={t.reserved ?? "Reserved"} />
          </div>
        </div>

        {/* grid */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div
            className="grid w-max"
            style={{ gridTemplateColumns: `${LABEL_W}px repeat(${days.length}, ${CELL_W}px)` }}
          >
            {/* corner */}
            <div
              className="sticky top-0 z-30 flex items-end border-b border-e border-border bg-background px-4 py-2 text-xs font-medium text-muted-foreground"
              style={{ insetInlineStart: 0 }}
            >
              {listings.length} {listings.length === 1 ? "listing" : "listings"}
            </div>
            {/* date headers */}
            {days.map((day) => {
              const isToday = sameDay(day, today);
              const isWeekend = day.getDay() === 5 || day.getDay() === 6;
              return (
                <div
                  key={+day}
                  className="sticky top-0 z-20 border-b border-e border-border bg-background py-2 text-center"
                >
                  <div className={`text-[11px] uppercase ${isWeekend ? "text-foreground/70" : "text-muted-foreground"}`}>
                    {day.toLocaleDateString(isRTL ? "ar" : "en-US", { weekday: "narrow" })}
                  </div>
                  <div
                    className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm ${
                      isToday ? "bg-foreground font-semibold text-background" : "text-foreground"
                    }`}
                  >
                    {formatNumber(day.getDate(), lang)}
                  </div>
                </div>
              );
            })}

            {/* rows */}
            {listings.map((listing) => (
              <React.Fragment key={listing.id}>
                {/* listing label (sticky inline-start) */}
                <div
                  className={`sticky z-10 flex items-center gap-2 border-b border-e border-border bg-background px-3 ${
                    listing.id === data.focusId ? "bg-muted/40" : ""
                  }`}
                  style={{ insetInlineStart: 0, height: ROW_H }}
                >
                  <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-muted">
                    {listing.photo ? (
                      <Image src={listing.photo} alt="" fill sizes="36px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{listing.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatCurrency(listing.basePrice, lang)}
                    </p>
                  </div>
                </div>
                {/* night cells */}
                {days.map((day) => {
                  const info = cellInfo(listing, day);
                  const selected = isSelected(listing.id, day);
                  const isPast = +startOfDay(day) < +today;
                  return (
                    <button
                      type="button"
                      key={+day}
                      onClick={() => onCellClick(listing, day)}
                      style={{ height: ROW_H }}
                      className={[
                        "relative flex flex-col items-center justify-center border-b border-e border-border text-xs outline-none transition-colors",
                        info.type === "open" ? "bg-background hover:bg-muted/40" : "",
                        info.type === "blocked" ? "bg-muted text-muted-foreground hover:bg-muted/80" : "",
                        info.type === "reserved" ? "bg-foreground/[0.06] hover:bg-foreground/10" : "",
                        selected ? "z-10 ring-2 ring-inset ring-foreground" : "",
                        isPast && info.type === "open" ? "text-muted-foreground/60" : "",
                      ].join(" ")}
                    >
                      {info.type === "reserved" ? (
                        info.isCheckIn ? (
                          <span className="max-w-full truncate px-1 text-[11px] font-medium text-foreground">
                            {info.booking?.guestName}
                          </span>
                        ) : null
                      ) : (
                        <span className={info.type === "blocked" ? "line-through" : "font-medium text-foreground"}>
                          {formatNumber(info.price, lang)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* side editor */}
      {sel && sel.listing && (
        <>
          {!isDesktop && (
            <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelection(null)} />
          )}
          <SidePanel
            listing={sel.listing}
            start={sel.start}
            end={sel.end}
            endExclusive={sel.endExclusive}
            lang={lang}
            t={t}
            isDesktop={isDesktop}
            pending={pending}
            error={error}
            onClose={() => setSelection(null)}
            onSetAvailability={(blocked) =>
              startTransition(async () => {
                setError(null);
                const res = await setAvailability({
                  listingId: sel.listing!.id,
                  startDate: sel.start.toISOString(),
                  endDate: sel.endExclusive.toISOString(),
                  blocked,
                });
                if (res.ok) await refreshMonth(monthAnchor);
                else setError(res.error);
              })
            }
            onSetPrice={(price) =>
              startTransition(async () => {
                setError(null);
                const res = await setPrice({
                  listingId: sel.listing!.id,
                  startDate: sel.start.toISOString(),
                  endDate: sel.endExclusive.toISOString(),
                  price,
                });
                if (res.ok) await refreshMonth(monthAnchor);
                else setError(res.error);
              })
            }
          />
        </>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

// ============================================================
export function SidePanel({
  listing,
  start,
  end,
  endExclusive,
  lang,
  t,
  isDesktop,
  pending,
  error,
  onClose,
  onSetAvailability,
  onSetPrice,
}: {
  listing: CalendarListing;
  start: Date;
  end: Date;
  endExclusive: Date;
  lang: Locale;
  t: MulticalDict;
  isDesktop: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSetAvailability: (blocked: boolean) => void;
  onSetPrice: (price: number) => void;
}) {
  // selected nights
  const nights = useMemo(() => {
    const out: Date[] = [];
    for (let d = new Date(start); +d <= +end; d = addDays(d, 1)) out.push(new Date(d));
    return out;
  }, [start, end]);

  const reservedBooking = useMemo(
    () => listing.bookings.find((b) => nights.some((d) => covers(d, b.checkIn, b.checkOut))) ?? null,
    [listing.bookings, nights],
  );
  const allBlocked = useMemo(
    () => nights.every((d) => listing.blocked.some((b) => covers(d, b.startDate, b.endDate))),
    [listing.blocked, nights],
  );
  const defaultPrice = useMemo(() => {
    const row = listing.pricing.find((p) => covers(start, p.startDate, p.endDate));
    return row?.price ?? listing.basePrice;
  }, [listing, start]);

  const [priceInput, setPriceInput] = useState<string>(String(Math.round(defaultPrice)));
  // re-seed the input whenever the selection (and thus its default price) changes
  const seedKey = `${listing.id}:${+start}:${+end}`;
  const [lastSeed, setLastSeed] = useState(seedKey);
  if (seedKey !== lastSeed) {
    setLastSeed(seedKey);
    setPriceInput(String(Math.round(defaultPrice)));
  }

  const single = +start === +end;
  const dateLabel = single
    ? formatDate(start, lang)
    : `${formatDate(start, lang)} – ${formatDate(end, lang)}`;
  const nightCount = nights.length;

  return (
    <aside
      className="z-50 flex flex-col bg-background"
      style={
        isDesktop
          ? {
              width: 360,
              flexShrink: 0,
              borderInlineStartWidth: 1,
              borderInlineStartStyle: "solid",
              borderColor: "var(--border)",
            }
          : {
              position: "fixed",
              insetInlineStart: 0,
              insetInlineEnd: 0,
              bottom: 0,
              maxHeight: "82%",
              borderTopWidth: 1,
              borderTopStyle: "solid",
              borderColor: "var(--border)",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              boxShadow: "0 -8px 30px rgba(0,0,0,0.12)",
            }
      }
    >
      {/* header */}
      <div className="flex items-start justify-between gap-2 border-b border-border p-5">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">{dateLabel}</p>
          <p className="truncate text-sm text-muted-foreground">{listing.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close ?? "Close"}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {reservedBooking ? (
          <ReservedCard booking={reservedBooking} lang={lang} t={t} />
        ) : (
          <div className="space-y-6">
            {/* availability */}
            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                {nightCount === 1
                  ? (t.nightSelected ?? "1 night selected")
                  : (t.nightsSelected ?? "{n} nights selected").replace("{n}", formatNumber(nightCount, lang))}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onSetAvailability(false)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    !allBlocked
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {t.open ?? "Open"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onSetAvailability(true)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                    allBlocked
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-foreground hover:bg-muted"
                  }`}
                >
                  {t.blocked ?? "Blocked"}
                </button>
              </div>
            </div>

            {/* price */}
            <div>
              <label htmlFor="mc-price" className="mb-2 block text-sm font-medium text-foreground">
                {t.pricePerNight ?? "Per-night price"}
              </label>
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-lg border border-border px-3 focus-within:border-foreground">
                  <span className="text-sm text-muted-foreground">{lang === "ar" ? "ج.س" : "SDG"}</span>
                  <input
                    id="mc-price"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    className="w-full bg-transparent px-2 py-2.5 text-sm text-foreground outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={pending || priceInput === "" || Number(priceInput) < 0}
                  onClick={() => onSetPrice(Number(priceInput))}
                  className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? (t.saving ?? "Saving…") : (t.save ?? "Save")}
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {(t.minNights ?? "Min {n} nights").replace("{n}", formatNumber(listing.minStay, lang))}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </div>
    </aside>
  );
}

function ReservedCard({ booking, lang, t }: { booking: CalendarBooking; lang: Locale; t: MulticalDict }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-muted">
          {booking.guestImage ? (
            <Image src={booking.guestImage} alt="" fill sizes="48px" className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base font-semibold text-muted-foreground">
              {booking.guestName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {(t.reservedBy ?? "Reserved by {name}").replace("{name}", booking.guestName)}
          </p>
          <p className="text-xs text-muted-foreground">{booking.status}</p>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        <Row label={formatDate(new Date(booking.checkIn), lang)} value={formatDate(new Date(booking.checkOut), lang)} />
        <Row
          label={t.guests ?? "Guests"}
          value={formatNumber(booking.guestCount, lang)}
        />
        <Row label={t.total ?? "Total"} value={formatCurrency(booking.totalPrice, lang)} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
