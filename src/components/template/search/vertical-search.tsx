"use client";

import { Button } from "@/components/ui/button";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useTransition,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { Label } from "@/components/ui/label";
import { format, addDays } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useClickOutside } from "./use-click";
import { GUEST_LIMITS, MOBILE_BREAKPOINT } from "./constant";
import LocationDropdown from "./location";
import GuestSelectorDropdown from "./guest-selector";
import { Calendar } from "@/components/ui/calendar";
import { useLocationSuggestions } from "./hooks/use-location-suggestions";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { type LocationSuggestion, SEARCH_CONFIG } from "@/lib/schemas/search-schema";
import { useLocale } from "@/components/internationalization/use-locale";
import { type DateRange } from "react-day-picker";

// Search form translations
const searchTranslations = {
  en: {
    heading: "Book unique\naccommodations and\nactivities.",
    where: "WHERE",
    checkIn: "CHECK-IN",
    checkOut: "CHECK-OUT",
    guests: "GUESTS",
    anywhere: "Anywhere",
    addDate: "Add date",
    addGuests: "Add guests",
    back: "Back",
    search: "Search",
    clear: "Clear",
    clearAll: "Clear all",
    adult: "adult",
    adults: "adults",
    child: "child",
    children: "children",
    infant: "infant",
    infants: "infants",
    selectCheckIn: "Select check-in date",
    selectCheckOut: "Select check-out date",
    nights: "nights",
    night: "night",
  },
  ar: {
    heading: "احجز أماكن\nإقامة وأنشطة\nفريدة.",
    where: "أين",
    checkIn: "تسجيل الوصول",
    checkOut: "المغادرة",
    guests: "الضيوف",
    anywhere: "أي مكان",
    addDate: "أضف تاريخ",
    addGuests: "أضف ضيوف",
    back: "رجوع",
    search: "بحث",
    clear: "مسح",
    clearAll: "مسح الكل",
    adult: "بالغ",
    adults: "بالغين",
    child: "طفل",
    children: "أطفال",
    infant: "رضيع",
    infants: "رضع",
    selectCheckIn: "اختر تاريخ الوصول",
    selectCheckOut: "اختر تاريخ المغادرة",
    nights: "ليالٍ",
    night: "ليلة",
  },
} as const;

type ActiveField = "location" | "checkin" | "checkout" | "guests" | null;

interface VerticalSearchProps {
  onSearch?: () => void;
}

// Dropdown enter/exit motion. Short, slightly easing curve — feels responsive
// without drawing attention to itself when the user is rapidly tabbing through
// fields ("flipping").
const DROPDOWN_TRANSITION = { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const };
const dropdownMotion = {
  initial: { opacity: 0, y: -4, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -4, scale: 0.98 },
};

export default function VerticalSearch({ onSearch }: VerticalSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, isRTL } = useLocale();
  const t = searchTranslations[locale as "en" | "ar"] || searchTranslations.en;
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [isMobile, setIsMobile] = useState(false);
  // Tracks whether the viewport is wide enough to show a 2-month calendar
  // side-by-side next to the form (lg+, 1024px+). Below this we fall back to
  // a 1-month calendar so the side dropdown doesn't overflow the viewport.
  const [isWide, setIsWide] = useState(false);
  // useTransition gives us a proper pending flag during navigation — the
  // button stays in its loading state until the listings route is mounted.
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    location: "",
    guests: {
      adults: 0,
      children: 0,
      infants: 0,
    },
  });

  // Track search form height for dropdown matching
  const [formHeight, setFormHeight] = useState<number | null>(null);
  const searchFormRef = useRef<HTMLDivElement>(null);

  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Use the location suggestions hook
  const {
    suggestions,
    popularLocations,
    isLoading: isLoadingLocations,
    error: locationError,
    search: searchLocations,
    query: searchQuery,
  } = useLocationSuggestions();

  // Use the search validation hook
  const { isValid: isDateValid, errors: dateErrors, nights } =
    useSearchValidation(dateRange);

  // Check mobile + wide breakpoints on mount and resize. We track both
  // because the layout differs at three tiers:
  //  - <768px   (mobile):  inline dropdown inside the form
  //  - 768-1023 (tablet):  side dropdown, 1-month calendar
  //  - 1024+    (desktop): side dropdown, 2-month calendar
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsMobile(w < MOBILE_BREAKPOINT);
      setIsWide(w >= 1024);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Track search form height dynamically for desktop dropdowns
  useEffect(() => {
    if (!isMobile && searchFormRef.current) {
      const updateHeight = () => {
        const height = searchFormRef.current?.offsetHeight;
        if (height) {
          setFormHeight(height);
        }
      };

      // Initial measurement
      updateHeight();

      // Update on window resize
      window.addEventListener("resize", updateHeight);

      // Observe form size changes (when fields expand/collapse)
      const resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(searchFormRef.current);

      return () => {
        window.removeEventListener("resize", updateHeight);
        resizeObserver.disconnect();
      };
    }
    return undefined;
  }, [isMobile, activeField]); // Re-measure when active field changes

  // Close active dropdown on Escape
  useEffect(() => {
    if (!activeField) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveField(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeField]);

  const handleFieldClick = (field: ActiveField) => {
    setActiveField(activeField === field ? null : field);
  };

  /**
   * Field-aware date selection.
   *
   * react-day-picker's default `mode="range"` heuristic breaks down once the
   * user has both endpoints set and wants to *change check-in* — the library
   * either resets to a new single-day range or mutates check-out instead,
   * leaving the user confused. We override that by routing every click through
   * `activeField`: whichever endpoint the user is editing is the one we set,
   * and the other endpoint adjusts only when the click would invalidate it.
   *
   * v9 of react-day-picker passes the clicked date as the 2nd arg of
   * `onSelect` (`triggerDate`), so we can act on the literal click instead of
   * diffing the resulting range.
   */
  const handleCalendarSelect = useCallback(
    (_range: DateRange | undefined, triggerDate: Date | undefined) => {
      if (!triggerDate) return;
      const clicked = triggerDate;

      if (activeField === "checkout") {
        // No check-in yet → treat click as check-in, keep focus on checkout
        if (!dateRange.from) {
          setDateRange({ from: clicked, to: undefined });
          return;
        }
        // Click at-or-before existing check-in → swap so check-in remains the
        // earlier date. The previous check-in becomes check-out.
        if (clicked.getTime() <= dateRange.from.getTime()) {
          setDateRange({ from: clicked, to: dateRange.from });
        } else {
          setDateRange({ from: dateRange.from, to: clicked });
        }
        setActiveField(null);
        return;
      }

      // Default: editing check-in (covers activeField === "checkin" and the
      // first-ever click when no field is explicitly focused).
      if (dateRange.to && clicked.getTime() >= dateRange.to.getTime()) {
        // Picking a check-in at-or-after current check-out invalidates the
        // check-out — clear it and ask user to pick a new one.
        setDateRange({ from: clicked, to: undefined });
        setActiveField("checkout");
      } else {
        setDateRange({ from: clicked, to: dateRange.to });
        // Auto-advance only if check-out isn't already set, otherwise the
        // user is just adjusting check-in and a close is the kinder exit.
        setActiveField(dateRange.to ? null : "checkout");
      }
    },
    [activeField, dateRange.from, dateRange.to]
  );

  // Handle location selection
  const selectLocation = (location: LocationSuggestion) => {
    setFormData((prev) => ({ ...prev, location: location.displayName }));
    setActiveField("checkin");
  };

  const clearLocation = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData((prev) => ({ ...prev, location: "" }));
  };

  const clearDates = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDateRange({ from: undefined, to: undefined });
  };

  const clearGuests = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData((prev) => ({
      ...prev,
      guests: { adults: 0, children: 0, infants: 0 },
    }));
  };

  const clearAll = () => {
    setFormData({
      location: "",
      guests: { adults: 0, children: 0, infants: 0 },
    });
    setDateRange({ from: undefined, to: undefined });
    setActiveField(null);
  };

  // Add guest counter handlers
  const handleGuestChange = (
    type: "adults" | "children" | "infants",
    operation: "increment" | "decrement"
  ) => {
    setFormData((prev) => ({
      ...prev,
      guests: {
        ...prev.guests,
        [type]:
          operation === "increment"
            ? Math.min(prev.guests[type] + 1, GUEST_LIMITS[type].max)
            : Math.max(GUEST_LIMITS[type].min, prev.guests[type] - 1),
      },
    }));
  };

  // Helper function to get total guests (infants don't count toward room
  // capacity per Airbnb convention)
  const getTotalGuests = () =>
    formData.guests.adults + formData.guests.children;

  const totalIncludingInfants = useMemo(
    () =>
      formData.guests.adults +
      formData.guests.children +
      formData.guests.infants,
    [formData.guests]
  );

  // Helper function to get guest display text
  const getGuestDisplayText = () => {
    if (totalIncludingInfants === 0) return t.addGuests;

    const parts: string[] = [];
    const guestCount = formData.guests.adults + formData.guests.children;
    if (guestCount > 0) {
      parts.push(
        `${guestCount} ${guestCount > 1 ? t.adults : t.adult}`
      );
    }
    if (formData.guests.infants > 0) {
      parts.push(
        `${formData.guests.infants} ${formData.guests.infants > 1 ? t.infants : t.infant}`
      );
    }

    return parts.join(", ");
  };

  // Display text helpers
  const checkInLabel = dateRange.from
    ? format(dateRange.from, "MMM dd")
    : t.addDate;
  const checkOutLabel = dateRange.to
    ? format(dateRange.to, "MMM dd")
    : t.addDate;
  const nightsLabel =
    nights && nights > 0
      ? `${nights} ${nights === 1 ? t.night : t.nights}`
      : null;

  // Use click outside hook
  useClickOutside(formRef, () => setActiveField(null));

  const handleSearch = () => {
    // Validate dates before search
    if (dateRange.from && dateRange.to && !isDateValid) {
      // Show validation errors by opening the date picker
      setActiveField("checkin");
      return;
    }

    const searchParams = new URLSearchParams();

    if (formData.location) {
      searchParams.set("location", formData.location);
    }
    if (dateRange.from) {
      searchParams.set("checkIn", format(dateRange.from, "yyyy-MM-dd"));
    }
    if (dateRange.to) {
      searchParams.set("checkOut", format(dateRange.to, "yyyy-MM-dd"));
    }
    if (totalIncludingInfants > 0) {
      searchParams.set("guests", getTotalGuests().toString());
      searchParams.set("adults", formData.guests.adults.toString());
      searchParams.set("children", formData.guests.children.toString());
      searchParams.set("infants", formData.guests.infants.toString());
    }

    // Get current locale from pathname
    const pathParts = pathname.split("/");
    const langSegment = pathParts[1] || "en";

    // Always navigate to listings page
    const searchUrl = `/${langSegment}/listings${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

    startTransition(() => {
      router.push(searchUrl);
      // Side-effect callback (analytics, scroll-to-results) — fires alongside
      // the navigation so the host page can react before the route mounts.
      if (onSearch) onSearch();
    });
  };

  // Helper function to get field styling
  const getFieldStyling = (field: ActiveField) => {
    const isActive = activeField === field;
    const hasActiveField = activeField !== null;

    let styleClass = "bg-transparent";
    if (isActive) {
      styleClass = "bg-white !border-gray-400 shadow-[0_0_0_1px_rgba(0,0,0,0.04)]";
    } else if (hasActiveField) {
      styleClass = "bg-gray-50";
    }

    return `${styleClass} transition-all duration-200`;
  };

  // Disabled-date predicate shared by every calendar instance below.
  // Memoized so the calendar doesn't re-render on every keystroke.
  const isDateDisabled = useCallback(
    (date: Date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) return true;
      const maxDate = addDays(today, SEARCH_CONFIG.DEFAULT_MAX_NIGHTS);
      if (date > maxDate) return true;
      // When picking check-out, cap by max-nights from check-in
      if (activeField === "checkout" && dateRange.from) {
        const maxCheckout = addDays(
          dateRange.from,
          SEARCH_CONFIG.DEFAULT_MAX_NIGHTS
        );
        if (date > maxCheckout) return true;
      }
      return false;
    },
    [activeField, dateRange.from]
  );

  // Shared calendar render. Keeps the date logic in one place across the
  // mobile/desktop instances.
  //
  // The Calendar now mirrors shadcn radix-nova: 28px cells via
  // `--cell-size:--spacing(7)` and a muted range-middle band bridged by
  // ::after pseudo-elements (see `src/components/ui/calendar.tsx`). The
  // container only needs `w-fit` to let the calendar render at its
  // natural shadcn proportions — no per-consumer width override.
  const renderCalendar = (months: 1 | 2) => (
    <Calendar
      mode="range"
      defaultMonth={dateRange.from || new Date()}
      locale={locale === "ar" ? ar : enUS}
      selected={dateRange}
      onSelect={handleCalendarSelect}
      numberOfMonths={months}
      disabled={isDateDisabled}
    />
  );

  // Any field set? Used to show the "Clear all" link.
  const hasAnyFieldSet =
    formData.location ||
    dateRange.from ||
    dateRange.to ||
    totalIncludingInfants > 0;

  // Validation error to surface near the Search button
  const dateValidationMessage =
    dateErrors.checkIn ||
    dateErrors.checkOut ||
    dateErrors.dateRange ||
    null;

  // ============================================================
  // MOBILE LAYOUT
  // ============================================================
  if (isMobile) {
    return (
      <div
        className="absolute top-[53%] start-4 md:start-8 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-auto max-h-[80vh] overflow-auto"
        ref={formRef}
      >
        <div className="bg-white rounded-xs px-4 md:px-6 py-6 md:py-4 shadow-md w-full md:w-80">
          {/* Header - Show heading or back arrow */}
          {!activeField ? (
            /* Show main heading when no field is active */
            <div className="flex items-start justify-between mb-4 md:mb-3">
              <h1 className="text-lg md:text-xl font-medium text-[#6b6b6b] leading-tight whitespace-pre-line">
                {t.heading}
              </h1>
              {hasAnyFieldSet && (
                <button
                  onClick={clearAll}
                  className="text-xs underline text-[#6b6b6b] hover:text-black transition-colors"
                  aria-label={t.clearAll}
                >
                  {t.clearAll}
                </button>
              )}
            </div>
          ) : (
            /* Show back arrow when dropdown is active */
            <div className="flex items-center mb-4 md:mb-3">
              <button
                onClick={() => setActiveField(null)}
                className="flex items-center text-[#6b6b6b] hover:text-black transition-colors"
                aria-label={t.back}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={isRTL ? "rotate-180" : ""}
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
                <span className="ms-2 text-sm font-medium">{t.back}</span>
              </button>
            </div>
          )}

          {/* Mobile: Show form or dropdown content */}
          {!activeField ? (
            /* Show complete form when no field is active */
            <div className="space-y-4 md:space-y-3">
              {/* Location field */}
              <div>
                <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                  {t.where}
                </Label>
                <button
                  className={`w-full h-12 text-start px-3 border border-gray-300 rounded-xs flex items-center justify-between ${getFieldStyling("location")}`}
                  onClick={() => handleFieldClick("location")}
                  aria-expanded={activeField === "location"}
                >
                  <span
                    className={`text-sm truncate ${formData.location ? "text-black" : "text-[#c0c0c0]"}`}
                  >
                    {formData.location || t.anywhere}
                  </span>
                  {formData.location && (
                    <span
                      onClick={clearLocation}
                      role="button"
                      tabIndex={0}
                      aria-label={t.clear}
                      className="ms-2 flex-shrink-0 rounded-full p-1 hover:bg-gray-100 cursor-pointer"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          clearLocation(e as unknown as React.MouseEvent);
                        }
                      }}
                    >
                      <X size={12} className="text-gray-500" />
                    </span>
                  )}
                </button>
              </div>

              {/* Date fields */}
              <div>
                <div className="grid grid-cols-2">
                  <div>
                    <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                      {t.checkIn}
                    </Label>
                  </div>
                  <div>
                    <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                      {t.checkOut}
                    </Label>
                  </div>
                </div>
                <div className="flex">
                  <button
                    className={`flex-1 h-12 text-start px-3 border border-gray-300 rounded-s-xs rounded-e-none ${getFieldStyling("checkin")}`}
                    onClick={() => handleFieldClick("checkin")}
                    aria-expanded={activeField === "checkin"}
                  >
                    <span className={`text-sm ${dateRange.from ? "text-black" : "text-[#c0c0c0]"}`}>
                      {checkInLabel}
                    </span>
                  </button>
                  <button
                    className={`flex-1 h-12 text-start px-3 border border-gray-300 border-s-0 rounded-e-xs rounded-s-none flex items-center justify-between ${getFieldStyling("checkout")}`}
                    onClick={() => handleFieldClick("checkout")}
                    aria-expanded={activeField === "checkout"}
                  >
                    <span className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}>
                      {checkOutLabel}
                    </span>
                    {(dateRange.from || dateRange.to) && (
                      <span
                        onClick={clearDates}
                        role="button"
                        tabIndex={0}
                        aria-label={t.clear}
                        className="ms-2 flex-shrink-0 rounded-full p-1 hover:bg-gray-100 cursor-pointer"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            clearDates(e as unknown as React.MouseEvent);
                          }
                        }}
                      >
                        <X size={12} className="text-gray-500" />
                      </span>
                    )}
                  </button>
                </div>
                {nightsLabel && (
                  <p className="text-[11px] text-[#6b6b6b] mt-1">{nightsLabel}</p>
                )}
              </div>

              {/* Guests field */}
              <div>
                <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                  {t.guests}
                </Label>
                <button
                  className={`w-full h-12 text-start px-3 border border-gray-300 rounded-xs flex items-center justify-between ${getFieldStyling("guests")}`}
                  onClick={() => handleFieldClick("guests")}
                  aria-expanded={activeField === "guests"}
                >
                  <span
                    className={`text-sm truncate ${totalIncludingInfants > 0 ? "text-black" : "text-[#c0c0c0]"}`}
                  >
                    {getGuestDisplayText()}
                  </span>
                  {totalIncludingInfants > 0 && (
                    <span
                      onClick={clearGuests}
                      role="button"
                      tabIndex={0}
                      aria-label={t.clear}
                      className="ms-2 flex-shrink-0 rounded-full p-1 hover:bg-gray-100 cursor-pointer"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          clearGuests(e as unknown as React.MouseEvent);
                        }
                      }}
                    >
                      <X size={12} className="text-gray-500" />
                    </span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Show dropdown content when a field is active */
            <div className="min-h-[200px] max-h-[60vh] overflow-y-auto">
              <AnimatePresence mode="wait">
                {activeField === "location" && (
                  <motion.div
                    key="loc"
                    {...dropdownMotion}
                    transition={DROPDOWN_TRANSITION}
                  >
                    <LocationDropdown
                      searchQuery={searchQuery}
                      suggestions={suggestions}
                      popularLocations={popularLocations}
                      isLoading={isLoadingLocations}
                      error={locationError}
                      onSearchQueryChange={searchLocations}
                      onLocationSelect={(location) => {
                        if (location) {
                          selectLocation(location);
                        } else {
                          setActiveField(null);
                        }
                      }}
                    />
                  </motion.div>
                )}

                {(activeField === "checkin" || activeField === "checkout") && (
                  <motion.div
                    key="dates"
                    {...dropdownMotion}
                    transition={DROPDOWN_TRANSITION}
                    className="flex flex-col overflow-hidden -mx-2"
                  >
                    {/* FIELD SWITCHER TABS - Mobile only */}
                    <div className="w-full mb-3 px-2">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => setActiveField("checkin")}
                          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            activeField === "checkin"
                              ? "bg-gray-900 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {t.checkIn}
                          {dateRange.from && (
                            <span className="ms-2 text-[11px] opacity-80">
                              {format(dateRange.from, "MMM dd")}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setActiveField("checkout")}
                          className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                            activeField === "checkout"
                              ? "bg-gray-900 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {t.checkOut}
                          {dateRange.to && (
                            <span className="ms-2 text-[11px] opacity-80">
                              {format(dateRange.to, "MMM dd")}
                            </span>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-center">
                      {renderCalendar(1)}
                    </div>

                    {nightsLabel && (
                      <p className="text-xs text-center text-[#6b6b6b] mt-2">
                        {nightsLabel}
                      </p>
                    )}
                  </motion.div>
                )}

                {activeField === "guests" && (
                  <motion.div
                    key="guests"
                    {...dropdownMotion}
                    transition={DROPDOWN_TRANSITION}
                  >
                    <GuestSelectorDropdown
                      guests={formData.guests}
                      onGuestChange={handleGuestChange}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Validation error */}
          {dateValidationMessage && (
            <p
              className="text-xs text-[#de3151] mt-2"
              role="alert"
              aria-live="polite"
            >
              {dateValidationMessage}
            </p>
          )}

          {/* Fixed Search button - always visible */}
          <div className="pt-3 md:pt-2 flex justify-end">
            <Button
              onClick={handleSearch}
              disabled={isPending}
              className="px-8 py-2 md:py-1 h-12 md:h-10 text-sm font-medium bg-[#de3151] hover:bg-[#de3151]/90 text-white rounded-xs disabled:opacity-70"
            >
              {isPending ? (
                <span
                  className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  aria-hidden="true"
                />
              ) : (
                t.search
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // DESKTOP LAYOUT
  // ============================================================
  return (
    <div
      className="absolute top-[53%] start-4 md:start-8 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-auto"
      ref={formRef}
    >
      <div className="relative">
        <div
          ref={searchFormRef}
          className="bg-white rounded-xs px-4 md:px-6 py-6 md:py-4 shadow-md w-full md:w-[340px]"
        >
          {/* Header with optional Clear all */}
          <div className="flex items-start justify-between mb-4 md:mb-3">
            <h1 className="text-lg md:text-xl font-medium text-[#6b6b6b] leading-tight whitespace-pre-line">
              {t.heading}
            </h1>
            {hasAnyFieldSet && (
              <button
                onClick={clearAll}
                className="text-xs underline text-[#6b6b6b] hover:text-black transition-colors flex-shrink-0 ms-2"
                aria-label={t.clearAll}
              >
                {t.clearAll}
              </button>
            )}
          </div>

          {/* Desktop: All fields visible */}
          <div className="space-y-4 md:space-y-3">
            {/* Location field */}
            <div>
              <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                {t.where}
              </Label>
              <button
                className={`w-full h-12 text-start px-3 border border-gray-300 rounded-xs flex items-center justify-between ${getFieldStyling("location")}`}
                onClick={() => handleFieldClick("location")}
                aria-expanded={activeField === "location"}
              >
                <span
                  className={`text-sm truncate ${formData.location ? "text-black" : "text-[#c0c0c0]"}`}
                >
                  {formData.location || t.anywhere}
                </span>
                {formData.location && (
                  <span
                    onClick={clearLocation}
                    role="button"
                    tabIndex={0}
                    aria-label={t.clear}
                    className="ms-2 flex-shrink-0 rounded-full p-1 hover:bg-gray-100 cursor-pointer"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        clearLocation(e as unknown as React.MouseEvent);
                      }
                    }}
                  >
                    <X size={12} className="text-gray-500" />
                  </span>
                )}
              </button>
            </div>

            {/* Date fields */}
            <div>
              <div className="grid grid-cols-2">
                <div>
                  <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                    {t.checkIn}
                  </Label>
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                    {t.checkOut}
                  </Label>
                </div>
              </div>
              <div className="flex">
                <button
                  className={`flex-1 h-12 text-start px-3 border border-gray-300 rounded-s-xs rounded-e-none ${getFieldStyling("checkin")}`}
                  onClick={() => handleFieldClick("checkin")}
                  aria-expanded={activeField === "checkin"}
                >
                  <span className={`text-sm ${dateRange.from ? "text-black" : "text-[#c0c0c0]"}`}>
                    {checkInLabel}
                  </span>
                </button>
                <button
                  className={`flex-1 h-12 text-start px-3 border border-gray-300 border-s-0 rounded-e-xs rounded-s-none flex items-center justify-between ${getFieldStyling("checkout")}`}
                  onClick={() => handleFieldClick("checkout")}
                  aria-expanded={activeField === "checkout"}
                >
                  <span className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}>
                    {checkOutLabel}
                  </span>
                  {(dateRange.from || dateRange.to) && (
                    <span
                      onClick={clearDates}
                      role="button"
                      tabIndex={0}
                      aria-label={t.clear}
                      className="ms-2 flex-shrink-0 rounded-full p-1 hover:bg-gray-100 cursor-pointer"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          clearDates(e as unknown as React.MouseEvent);
                        }
                      }}
                    >
                      <X size={12} className="text-gray-500" />
                    </span>
                  )}
                </button>
              </div>
              {nightsLabel && (
                <p className="text-[11px] text-[#6b6b6b] mt-1">{nightsLabel}</p>
              )}
            </div>

            {/* Travelers field */}
            <div>
              <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                {t.guests}
              </Label>
              <button
                className={`w-full h-12 text-start px-3 border border-gray-300 rounded-xs flex items-center justify-between ${getFieldStyling("guests")}`}
                onClick={() => handleFieldClick("guests")}
                aria-expanded={activeField === "guests"}
              >
                <span
                  className={`text-sm truncate ${totalIncludingInfants > 0 ? "text-black" : "text-[#c0c0c0]"}`}
                >
                  {getGuestDisplayText()}
                </span>
                {totalIncludingInfants > 0 && (
                  <span
                    onClick={clearGuests}
                    role="button"
                    tabIndex={0}
                    aria-label={t.clear}
                    className="ms-2 flex-shrink-0 rounded-full p-1 hover:bg-gray-100 cursor-pointer"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        clearGuests(e as unknown as React.MouseEvent);
                      }
                    }}
                  >
                    <X size={12} className="text-gray-500" />
                  </span>
                )}
              </button>
            </div>

            {/* Validation error */}
            {dateValidationMessage && (
              <p
                className="text-xs text-[#de3151]"
                role="alert"
                aria-live="polite"
              >
                {dateValidationMessage}
              </p>
            )}

            {/* Search button */}
            <div className="pt-3 md:pt-2 flex justify-end">
              <Button
                onClick={handleSearch}
                disabled={isPending}
                className="px-8 py-2 md:py-1 h-12 md:h-10 text-sm font-medium bg-[#de3151] hover:bg-[#de3151]/90 text-white rounded-xs disabled:opacity-70"
              >
                {isPending ? (
                  <span
                    className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  t.search
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Desktop-only Side Dropdowns - Positioned beside form */}
        <AnimatePresence>
          {activeField === "location" && (
            <motion.div
              key="dd-location"
              {...dropdownMotion}
              transition={DROPDOWN_TRANSITION}
              style={{
                height: formHeight ? `${formHeight}px` : "auto",
                transformOrigin: isRTL ? "right top" : "left top",
              }}
              className="hidden md:block absolute top-0 start-full ms-4 w-80 max-w-[calc(100vw-380px)] bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10 overflow-hidden"
              onMouseLeave={() => setActiveField(null)}
            >
              <div className="h-full overflow-y-auto">
                <LocationDropdown
                  searchQuery={searchQuery}
                  suggestions={suggestions}
                  popularLocations={popularLocations}
                  isLoading={isLoadingLocations}
                  error={locationError}
                  onSearchQueryChange={searchLocations}
                  onLocationSelect={(location) => {
                    if (location) {
                      selectLocation(location);
                    } else {
                      setActiveField(null);
                    }
                  }}
                />
              </div>
            </motion.div>
          )}

          {(activeField === "checkin" || activeField === "checkout") && (
            <motion.div
              key="dd-dates"
              {...dropdownMotion}
              transition={DROPDOWN_TRANSITION}
              style={{
                height: formHeight ? `${formHeight}px` : "auto",
                transformOrigin: isRTL ? "right top" : "left top",
              }}
              className="hidden md:block absolute top-0 start-full ms-4 w-fit max-w-[calc(100vw-380px)] bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-2 z-10 overflow-hidden"
              onMouseLeave={() => setActiveField(null)}
            >
              <div className="h-full flex flex-col items-center justify-center">
                {/* Field indicator — shows which endpoint is currently being
                    edited, mirrors the highlighted form field for clarity. */}
                <div className="w-full flex gap-2 justify-center px-2 mb-2">
                  <button
                    onClick={() => setActiveField("checkin")}
                    className={`flex-1 max-w-[160px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activeField === "checkin"
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {t.checkIn}
                    {dateRange.from && (
                      <span className="ms-2 opacity-80">
                        {format(dateRange.from, "MMM dd")}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveField("checkout")}
                    className={`flex-1 max-w-[160px] px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      activeField === "checkout"
                        ? "bg-gray-900 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {t.checkOut}
                    {dateRange.to && (
                      <span className="ms-2 opacity-80">
                        {format(dateRange.to, "MMM dd")}
                      </span>
                    )}
                  </button>
                </div>
                {renderCalendar(isWide ? 2 : 1)}
                {nightsLabel && (
                  <p className="text-xs text-[#6b6b6b] mt-1">{nightsLabel}</p>
                )}
              </div>
            </motion.div>
          )}

          {activeField === "guests" && (
            <motion.div
              key="dd-guests"
              {...dropdownMotion}
              transition={DROPDOWN_TRANSITION}
              style={{
                height: formHeight ? `${formHeight}px` : "auto",
                transformOrigin: isRTL ? "right top" : "left top",
              }}
              className="hidden md:block absolute top-0 start-full ms-4 w-80 max-w-[calc(100vw-380px)] bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10 overflow-hidden"
              onMouseLeave={() => setActiveField(null)}
            >
              <div className="h-full overflow-y-auto">
                <GuestSelectorDropdown
                  guests={formData.guests}
                  onGuestChange={handleGuestChange}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
