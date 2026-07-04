"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUp, CalendarRange, Check, Settings, X } from "lucide-react";
import type { Locale } from "@/components/internationalization/config";
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";
import {
  getMulticalendar,
  setAvailability,
  setPrice,
  type CalendarListing,
  type MulticalendarData,
} from "@/lib/actions/calendar-actions";
import {
  addDays,
  addMonths,
  cellInfo,
  daysOfMonth,
  sameDay,
  startOfDay,
  startOfMonth,
  SidePanel,
  type MulticalDict,
} from "./multicalendar";

// Airbnb's mobile /multicalendar: one listing at a time as a vertical stack of
// month grids — sticky 32px month label + S·M·T·W·T·F·S row on top, 40px
// circle actions (listing switcher + availability settings), price under each
// day, a floating "Today" pill, and the bottom-sheet range editor. The desktop
// listings×days grid stays in multicalendar.tsx (this component renders <lg).
export default function MobileCalendar({
  data,
  lang,
  dict,
  monthStartISO,
  monthsAhead = 6,
}: {
  data: MulticalendarData;
  lang: Locale;
  dict: MulticalDict | null;
  monthStartISO: string;
  monthsAhead?: number;
}) {
  const t = dict ?? {};
  const monthStart = useMemo(() => startOfMonth(new Date(monthStartISO)), [monthStartISO]);
  const months = useMemo(
    () => Array.from({ length: monthsAhead }, (_, i) => addMonths(monthStart, i)),
    [monthStart, monthsAhead],
  );
  const today = useMemo(() => startOfDay(new Date()), []);

  const [listings, setListings] = useState<CalendarListing[]>(data.listings);
  const [activeId, setActiveId] = useState<number>(() => data.focusId ?? data.listings[0]?.id);
  const [selection, setSelection] = useState<{ anchor: string; end: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [headerMonth, setHeaderMonth] = useState(0); // index into months
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  const listing = listings.find((l) => l.id === activeId) ?? listings[0] ?? null;

  async function refresh() {
    try {
      const res = await getMulticalendar({
        start: monthStart,
        end: addMonths(monthStart, monthsAhead),
        focusId: data.focusId ?? undefined,
      });
      setListings(res.listings);
    } catch {
      setError("Could not load calendar");
    }
  }

  function onDayClick(day: Date) {
    if (!listing) return;
    setError(null);
    const key = startOfDay(day).toISOString();
    setSelection((prev) =>
      prev ? { anchor: prev.anchor, end: key } : { anchor: key, end: key },
    );
  }

  const sel = useMemo(() => {
    if (!selection) return null;
    const a = startOfDay(new Date(selection.anchor));
    const b = startOfDay(new Date(selection.end));
    const start = a <= b ? a : b;
    const end = a <= b ? b : a;
    return { start, end, endExclusive: addDays(end, 1) };
  }, [selection]);

  function isSelected(day: Date): boolean {
    if (!sel) return false;
    const d = +startOfDay(day);
    return d >= +sel.start && d <= +sel.end;
  }

  // header month label follows the topmost visible month section
  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop + 8;
    let idx = 0;
    sectionRefs.current.forEach((sec, i) => {
      if (sec && sec.offsetTop <= top) idx = i;
    });
    if (idx !== headerMonth) setHeaderMonth(idx);
  }

  function scrollToToday() {
    const i = months.findIndex(
      (m) => m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth(),
    );
    const sec = sectionRefs.current[Math.max(0, i)];
    const el = scrollRef.current;
    if (sec && el) el.scrollTo({ top: sec.offsetTop - 4, behavior: "smooth" });
  }

  // weekday letters, Sunday-first (matches the live grid in both locales)
  const weekdays = useMemo(() => {
    const base = new Date(2026, 5, 28); // a Sunday
    return Array.from({ length: 7 }, (_, i) =>
      addDays(base, i).toLocaleDateString(lang === "ar" ? "ar" : "en-US", { weekday: "narrow" }),
    );
  }, [lang]);

  const headerLabel = months[headerMonth]?.toLocaleDateString(lang === "ar" ? "ar" : "en-US", {
    month: "long",
    ...(months[headerMonth]?.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });

  if (!listing) return null;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* sticky header: month label + circle actions + weekday row */}
      <div className="px-4 pb-0 pt-2">
        <div className="flex items-center justify-between">
          <h1 className="text-[32px] font-semibold leading-9 text-foreground">{headerLabel}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              aria-label={t.changeView ?? "Change calendar view"}
              className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
            >
              <CalendarRange className="size-4" />
            </button>
            <Link
              href={`/${lang}/hosting/listings/editor/${listing.id}/details/availability`}
              aria-label={t.settings ?? "Settings"}
              className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
            >
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-7 pb-2 pt-3 text-center text-xs font-medium text-muted-foreground">
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      </div>
      <div className="h-px bg-border" />

      {/* month stack */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-28"
      >
        {months.map((anchor, i) => (
          <MonthSection
            key={+anchor}
            ref={(el) => {
              sectionRefs.current[i] = el;
            }}
            anchor={anchor}
            listing={listing}
            lang={lang}
            today={today}
            isSelected={isSelected}
            onDayClick={onDayClick}
          />
        ))}
      </div>

      {/* floating Today pill */}
      <button
        type="button"
        onClick={scrollToToday}
        className="fixed bottom-20 end-4 z-30 flex h-12 items-center gap-2 rounded-full bg-background px-5 text-sm font-medium text-foreground"
        style={{ boxShadow: "0 6px 16px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.04)" }}
      >
        <ArrowUp className="size-4" />
        {t.today ?? "Today"}
      </button>

      {/* bottom-sheet range editor (shared with desktop) */}
      {sel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setSelection(null)} />
          <SidePanel
            listing={listing}
            start={sel.start}
            end={sel.end}
            endExclusive={sel.endExclusive}
            lang={lang}
            t={t}
            isDesktop={false}
            pending={pending}
            error={error}
            onClose={() => setSelection(null)}
            onSetAvailability={(blocked) =>
              startTransition(async () => {
                setError(null);
                const res = await setAvailability({
                  listingId: listing.id,
                  startDate: sel.start.toISOString(),
                  endDate: sel.endExclusive.toISOString(),
                  blocked,
                });
                if (res.ok) await refresh();
                else setError(res.error);
              })
            }
            onSetPrice={(price) =>
              startTransition(async () => {
                setError(null);
                const res = await setPrice({
                  listingId: listing.id,
                  startDate: sel.start.toISOString(),
                  endDate: sel.endExclusive.toISOString(),
                  price,
                });
                if (res.ok) await refresh();
                else setError(res.error);
              })
            }
          />
        </>
      )}

      {/* listing switcher sheet */}
      {pickerOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setPickerOpen(false)} />
          <div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70%] flex-col bg-background"
            style={{ borderTopLeftRadius: 32, borderTopRightRadius: 32 }}
          >
            <div className="flex items-center justify-between px-6 pb-2 pt-5">
              <p className="text-base font-semibold text-foreground">
                {t.chooseListing ?? "Choose a listing"}
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                aria-label={t.close ?? "Close"}
                className="flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">
              {listings.map((l) => {
                const active = l.id === listing.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => {
                      setActiveId(l.id);
                      setSelection(null);
                      setPickerOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl p-3 text-start transition-colors ${
                      active ? "bg-muted" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-muted">
                      {l.photo ? (
                        <Image src={l.photo} alt="" fill sizes="48px" className="object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatCurrency(l.basePrice, lang)}
                      </p>
                    </div>
                    {active && <Check className="size-4 flex-shrink-0 text-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const MonthSection = React.forwardRef<
  HTMLElement,
  {
    anchor: Date;
    listing: CalendarListing;
    lang: Locale;
    today: Date;
    isSelected: (d: Date) => boolean;
    onDayClick: (d: Date) => void;
  }
>(function MonthSection({ anchor, listing, lang, today, isSelected, onDayClick }, ref) {
  const days = daysOfMonth(anchor);
  const label = anchor.toLocaleDateString(lang === "ar" ? "ar" : "en-US", {
    month: "long",
    ...(anchor.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
  const leading = days[0].getDay(); // Sunday-first offset

  return (
    <section ref={ref}>
      <h3 className="pb-3 pt-6 text-[22px] font-semibold leading-7 text-foreground">{label}</h3>
      <div className="grid grid-cols-7">
        {Array.from({ length: leading }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {days.map((day) => {
          const info = cellInfo(listing, day);
          const isPast = +startOfDay(day) < +today;
          const isToday = sameDay(day, today);
          const selected = isSelected(day);
          return (
            <button
              type="button"
              key={+day}
              onClick={() => onDayClick(day)}
              className={`relative flex min-h-[64px] flex-col items-center gap-1 rounded-lg pb-2 pt-2 outline-none ${
                selected ? "ring-2 ring-inset ring-foreground" : ""
              } ${info.type === "reserved" ? "bg-foreground/[0.06]" : ""}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                  isToday
                    ? "bg-foreground font-semibold text-background"
                    : isPast
                      ? "text-muted-foreground/50"
                      : "font-medium text-foreground"
                }`}
              >
                {formatNumber(day.getDate(), lang)}
              </span>
              {info.type === "reserved" ? (
                info.isCheckIn ? (
                  <span className="max-w-full truncate px-0.5 text-[10px] font-medium text-foreground">
                    {info.booking?.guestName}
                  </span>
                ) : (
                  <span className="text-[10px] text-transparent">·</span>
                )
              ) : (
                <span
                  className={`text-xs ${
                    info.type === "blocked"
                      ? "text-muted-foreground line-through"
                      : isPast
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground"
                  }`}
                >
                  {formatNumber(info.price, lang)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
});
