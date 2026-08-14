"use client";

import { useEffect, useState } from "react";
import { Tag } from "lucide-react";
import { useLocale } from "@/components/internationalization/use-locale";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { formatCurrency } from "@/lib/i18n/formatters";
import { RatingStar } from "./rating-star";
import { useMobileBooking, MOBILE_CALENDAR_ANCHOR } from "./mobile-booking";
import { trackEvent } from "@/lib/analytics/beacon";

/**
 * Fixed booking footer — Airbnb's BOOK_IT_FLOATING_FOOTER on the phone room
 * page, in its three live shapes (captured from rooms 40938334 / 27521336,
 * `.clone/airbnb-footer-states/`):
 *
 *   noDates — "Add dates for prices" (16/700) + ★rating over a button row.
 *             Airbnb shows a lone full-width "Check availability" here; mkan is
 *             contact-first, so Call leads (primary, start side) with "Check
 *             availability" beside it as a DLS secondary pill → inline calendar.
 *   blocked — underlined "Jul 6 – 11" (14px) beside a "Change dates" CTA, with
 *             the persistent "Those dates are not available" error toast
 *             floating above the bar.
 *   ready   — underlined total (16/700) over "For 5 nights · Jul 6 – 11"
 *             (12px), CTA beside them. Airbnb says "Reserve"; phase-1 mkan is
 *             contact-first, so the CTA is "Call" (tel:) — same shape, same
 *             gradient. The "Prices include all fees" toast pops for a few
 *             seconds whenever a bookable range lands (true here: the total is
 *             nights × rate + cleaning fee, and there is no service fee).
 *
 * Bar chrome from the live computed styles: white, 1px #DDDDDD top border,
 * 24px side padding; CTA is a 48px-tall fully-rounded pill (min 112px wide,
 * 16/500 white) on the DLS19 brand gradient. Toasts are white 12px-radius
 * cards with a soft 0/6/20 shadow, centered ~12px above the bar.
 */

const BRAND_GRADIENT = "linear-gradient(to right, #E61E4D 0%, #E31C5F 50%, #D70466 100%)";
const TOAST_SHADOW = "0px 6px 20px rgba(0, 0, 0, 0.2)";

const CTA_CLASS =
  "flex h-12 items-center justify-center rounded-full px-6 text-base font-medium leading-5 text-white";

/** "Jul 6 – 11" when the stay sits in one month, "Jun 28 – Jul 3" across two.
 *  Arabic keeps the month on the second endpoint: "٦ – ١١ يوليو". */
function formatStayDates(from: Date, to: Date, isAr: boolean): string {
  const intl = isAr ? "ar" : "en-US";
  const monthDay = new Intl.DateTimeFormat(intl, { month: "short", day: "numeric" });
  const dayOnly = new Intl.DateTimeFormat(intl, { day: "numeric" });
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  if (!sameMonth) return `${monthDay.format(from)} – ${monthDay.format(to)}`;
  return isAr
    ? `${dayOnly.format(from)} – ${monthDay.format(to)}`
    : `${monthDay.format(from)} – ${dayOnly.format(to)}`;
}

const MobileReserve = ({ className = "" }: { className?: string }) => {
  const { locale } = useLocale();
  const dict = useDictionary();
  const isAr = locale === "ar";
  const { listingId, range, state, nights, total, phone, rating, reviewsCount } = useMobileBooking();

  const t = {
    addDates: isAr ? "أضف التواريخ لعرض الأسعار" : "Add dates for prices",
    checkAvailability: isAr ? "تحقق من التوفر" : "Check availability",
    changeDates: isAr ? "تغيير التواريخ" : "Change dates",
    notAvailable: isAr ? "هذه التواريخ غير متاحة" : "Those dates are not available",
    allFees: isAr ? "الأسعار تشمل جميع الرسوم" : "Prices include all fees",
    forNights: isAr
      ? `لمدة ${nights} ${nights === 1 ? "ليلة" : "ليالٍ"}`
      : `For ${nights} ${nights === 1 ? "night" : "nights"}`,
    call: dict?.property?.contactHost?.call ?? (isAr ? "اتصال" : "Call"),
    error: isAr ? "خطأ: " : "Error: ",
  };

  // The fees toast pops whenever a bookable range lands (page load with dates,
  // or completing a pick inline) and stays until the guest scrolls — probed on
  // the live footer: still up at 40s idle, gone for good after the first
  // scroll. A short arming delay swallows the layout/momentum scroll that can
  // fire right as the range is picked.
  const [showFees, setShowFees] = useState(false);
  const rangeKey =
    state === "ready" ? `${range?.from?.getTime()}-${range?.to?.getTime()}` : "";
  useEffect(() => {
    if (!rangeKey) {
      setShowFees(false);
      return;
    }
    setShowFees(true);
    let armed = false;
    const arm = setTimeout(() => {
      armed = true;
    }, 600);
    const onScroll = () => {
      if (!armed) return;
      setShowFees(false);
      window.removeEventListener("scroll", onScroll);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(arm);
      window.removeEventListener("scroll", onScroll);
    };
  }, [rangeKey]);

  const scrollToCalendar = () => {
    document
      .getElementById(MOBILE_CALENDAR_ANCHOR)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const dates =
    range?.from && range?.to ? formatStayDates(range.from, range.to, isAr) : "";

  return (
    <div className={`md:hidden fixed bottom-0 inset-x-0 z-50 ${className}`}>
      {/* Toast layer — floats centered above the bar. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-full mb-3 flex justify-center px-6"
        aria-live="polite"
      >
        {state === "blocked" && (
          <div
            role="group"
            className="pointer-events-auto flex items-center gap-2 rounded-[12px] bg-white px-4 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ boxShadow: TOAST_SHADOW }}
          >
            <svg
              viewBox="0 0 16 16"
              aria-hidden="true"
              className="h-4 w-4 shrink-0"
              style={{ fill: "#C13515" }}
            >
              <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0zm0 10.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm.8-6.6H7.2v5.2h1.6z" />
            </svg>
            <p className="whitespace-nowrap text-sm leading-5 text-[#222222]">
              <span className="sr-only">{t.error}</span>
              {t.notAvailable}
            </p>
          </div>
        )}
        {state === "ready" && showFees && (
          <div
            role="group"
            className="pointer-events-auto flex items-center gap-2.5 rounded-[12px] bg-white py-3.5 ps-3 pe-5 animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ boxShadow: TOAST_SHADOW }}
          >
            <Tag size={28} strokeWidth={1.75} className="shrink-0" color="#E61E4D" aria-hidden />
            <p className="whitespace-nowrap text-sm font-medium leading-5 text-[#222222]">
              {t.allFees}
            </p>
          </div>
        )}
      </div>

      <div
        className="border-t border-[#DDDDDD] bg-white px-6 pt-3"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        {state === "noDates" ? (
          <div>
            <button type="button" onClick={scrollToCalendar} className="block text-start">
              <span className="text-base font-bold leading-5 text-[#222222]">{t.addDates}</span>
            </button>
            {rating > 0 && reviewsCount > 0 && (
              <div className="mt-1 flex items-center gap-1">
                <RatingStar size={12} />
                <span className="text-xs font-medium leading-4 text-[#222222]">
                  {rating.toFixed(2)}
                </span>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <a
                href={`tel:${phone}`}
                className={`${CTA_CLASS} flex-1`}
                style={{ background: BRAND_GRADIENT }}
                onClick={() => trackEvent(listingId, "CONTACT_PHONE_CLICK")}
              >
                {t.call}
              </a>
              <button
                type="button"
                onClick={scrollToCalendar}
                className="flex h-12 shrink-0 items-center justify-center rounded-full border border-[#222222] bg-white px-5 text-base font-medium leading-5 text-[#222222]"
              >
                {t.checkAvailability}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            {state === "ready" ? (
              // Airbnb's underlined price opens the breakdown sheet; phase-1
              // has no sheet, so both left blocks jump to the calendar.
              <button
                type="button"
                onClick={scrollToCalendar}
                className="flex min-w-0 flex-col items-start text-start"
              >
                <span className="text-base font-bold leading-6 text-[#222222] underline">
                  {formatCurrency(total, locale)}
                </span>
                <span className="max-w-full truncate text-xs leading-4 text-[#222222]">
                  {t.forNights} · {dates}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={scrollToCalendar}
                className="text-sm leading-5 text-[#222222] underline"
              >
                {dates}
              </button>
            )}
            {state === "ready" ? (
              <a
                href={`tel:${phone}`}
                className={`${CTA_CLASS} shrink-0`}
                style={{ background: BRAND_GRADIENT, minWidth: 112 }}
                onClick={() => trackEvent(listingId, "CONTACT_PHONE_CLICK")}
              >
                {t.call}
              </a>
            ) : (
              <button
                type="button"
                onClick={scrollToCalendar}
                className={`${CTA_CLASS} shrink-0`}
                style={{ background: BRAND_GRADIENT, minWidth: 112 }}
              >
                {t.changeDates}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileReserve;
