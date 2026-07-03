"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import { motion } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Counter } from "@/components/atom/counter";
import { format, addDays } from "date-fns";
import { ar, enUS } from "date-fns/locale";
import { useClickOutside } from "./use-click";
import { GUEST_LIMITS, MOBILE_BREAKPOINT } from "./constant";
import LocationDropdown from "./location";
import GuestSelectorDropdown from "./guest-selector";
import BigSearchDatePicker from "./big-search-date-picker";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandInput } from "@/components/ui/command";
import { useLocationSuggestions } from "./hooks/use-location-suggestions";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { type LocationSuggestion, SEARCH_CONFIG } from "@/lib/schemas/search-schema";
import { useLocale } from "@/components/internationalization/use-locale";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { type DateRange } from "react-day-picker";

type ActiveField = "location" | "checkin" | "checkout" | "guests" | null;

interface VerticalSearchProps {
  onSearch?: () => void;
  // "hero" (default) keeps the absolutely-positioned card that floats over the
  // homepage hero image. "sheet" makes the mobile card fill its parent so it can
  // be embedded inside the /listings mobile bottom-sheet (it drops the absolute
  // positioning + fixed height and the card's own rounding/shadow, which the
  // sheet already provides). Desktop rendering is identical in both variants.
  variant?: "hero" | "sheet";
  // Which step the mobile card opens on. Default (null) opens the idle form
  // (heading + all fields), as on the homepage hero. The /listings sheet passes
  // "location" so the Where step is shown immediately.
  initialField?: ActiveField;
  // When set, the mobile floating Search button becomes a Framer shared-layout
  // element with this id so it can morph from the collapsed pill's search circle
  // (and back). Undefined on the hero → plain button, hero is unaffected.
  ctaLayoutId?: string;
}

export default function VerticalSearch({
  onSearch,
  variant = "hero",
  initialField = null,
  ctaLayoutId,
}: VerticalSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isRTL, locale } = useLocale();
  const isAr = locale === "ar";
  const dict = useDictionary();
  const vf = dict?.search?.verticalForm;
  const t = {
    heading: vf?.heading ?? "Book unique\naccommodations and\nactivities.",
    where: vf?.where ?? "WHERE",
    checkIn: vf?.checkIn ?? "CHECK-IN",
    checkOut: vf?.checkOut ?? "CHECK-OUT",
    guests: vf?.guests ?? "GUESTS",
    anywhere: vf?.anywhere ?? "Anywhere",
    addDate: vf?.addDate ?? "Add date",
    addGuests: vf?.addGuests ?? "Add guests",
    back: vf?.back ?? "Back",
    search: vf?.search ?? "Search",
    adult: vf?.adult ?? "adult",
    adults: vf?.adults ?? "adults",
    child: vf?.child ?? "child",
    children: vf?.children ?? "children",
    infant: vf?.infant ?? "infant",
    infants: vf?.infants ?? "infants",
    selectCheckIn: vf?.selectCheckIn ?? "Select check-in date",
    selectCheckOut: vf?.selectCheckOut ?? "Select check-out date",
    guest: dict.search?.guest ?? "guest",
    guestsText: dict.search?.guests ?? "guests",
    pet: dict.search?.pet ?? "pet",
    pets: dict.search?.pets ?? "pets",
  };
  const [activeField, setActiveField] = useState<ActiveField>(initialField);
  const [isMobile, setIsMobile] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    location: "",
    // Canonical (English) token sent as the `location` param; `location` above
    // stays the localized label shown in the field.
    locationQuery: "",
    checkIn: "",
    checkOut: "",
    guests: {
      // Adults start at 2 — the typical booking party.
      adults: 2,
      children: 0,
      infants: 0,
      pets: 0,
    },
  });

  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Track previous date range for detecting changes
  const [prevDateRange, setPrevDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // "When" picker state — mirrors the /listings BigSearch so the hero opens the
  // SAME date picker (Dates / Flexible tabs, flexibility pills).
  const [searchMode, setSearchMode] = useState<"dates" | "flexible">("dates");
  const [flexibleDuration, setFlexibleDuration] = useState<
    "weekend" | "week" | "month"
  >("week");
  const [flexibleMonths, setFlexibleMonths] = useState<string[]>([]);
  const [dateFlexibility, setDateFlexibility] = useState<string>("exact");

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
  const { isValid: isDateValid, errors: dateErrors } =
    useSearchValidation(dateRange);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleFieldClick = (field: ActiveField) => {
    setActiveField(activeField === field ? null : field);
  };

  // ── Mobile step navigation ─────────────────────────────────────────────
  // The prev/next arrows walk four steps — Where (0) → Check-in (1) →
  // Check-out (2) → Who (3). Check-in and check-out are distinct steps so the
  // next arrow flips check-in → check-out (instead of skipping to Who).
  const fieldStep = (field: ActiveField): number => {
    if (field === "location") return 0;
    if (field === "checkin") return 1;
    if (field === "checkout") return 2;
    if (field === "guests") return 3;
    return -1;
  };
  const stepToField = (step: number): ActiveField =>
    step === 0
      ? "location"
      : step === 1
        ? "checkin"
        : step === 2
          ? "checkout"
          : "guests";
  const goPrevField = () => {
    const s = fieldStep(activeField);
    if (s > 0) setActiveField(stepToField(s - 1));
  };
  const goNextField = () => {
    const s = fieldStep(activeField);
    if (s >= 0 && s < 3) setActiveField(stepToField(s + 1));
  };

  const handleDateRangeChange = (
    from: Date | undefined,
    to: Date | undefined,
    // ms to wait before advancing check-out → guests. Mobile passes a small
    // delay so the completed range is visible for a beat before the Who panel
    // slides in; desktop advances immediately (0).
    advanceDelay = 0
  ) => {
    // Detect which date was just selected
    const fromChanged = from?.getTime() !== prevDateRange.from?.getTime();
    const toChanged = to?.getTime() !== prevDateRange.to?.getTime();

    // Update state
    setDateRange({ from, to });
    setFormData((prev) => ({
      ...prev,
      checkIn: from ? format(from, "yyyy-MM-dd") : "",
      checkOut: to ? format(to, "yyyy-MM-dd") : "",
    }));

    // AUTO-ADVANCE: location → checkin → checkout → guests → (close on outside-click)
    if (fromChanged && from && !to) {
      // User just selected check-in → auto-switch to check-out field
      setActiveField("checkout");
    } else if (toChanged && from && to) {
      // User just selected check-out → auto-advance to guests
      if (advanceDelay > 0) {
        setTimeout(() => setActiveField("guests"), advanceDelay);
      } else {
        setActiveField("guests");
      }
    }

    // Track for next comparison
    setPrevDateRange({ from, to });
  };

  // Short "MMM dd" shown in the CHECK-IN / CHECK-OUT fields — locale-aware so
  // Arabic renders the month name + digits in Arabic (matching the calendar
  // range summary below), instead of the always-English date-fns format().
  const fmtShortDate = (d: Date) =>
    d.toLocaleDateString(isAr ? "ar" : "en-US", {
      month: "short",
      day: "numeric",
    });

  // Format a Date as YYYY-MM-DD from LOCAL components (avoids the UTC day-shift
  // that toISOString() introduces in non-UTC timezones).
  const toLocalISODate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  // Turn the Flexible tab's selected months into a concrete check-in/check-out
  // span (first day of the earliest month → last day of the latest month),
  // matching the BigSearch flexible→range conversion.
  const getFlexibleDateRange = (months: string[]) => {
    const sorted = [...months].sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    if (!first || !last) {
      const from = new Date();
      const to = new Date();
      to.setMonth(to.getMonth() + 6);
      return { from, to };
    }
    const [fy, fm] = first.split("-");
    const [ly, lm] = last.split("-");
    const from = new Date(parseInt(fy || "0", 10), parseInt(fm || "1", 10) - 1, 1);
    const to = new Date(parseInt(ly || "0", 10), parseInt(lm || "1", 10), 0);
    return { from, to };
  };

  // Keep the two visible CHECK-IN / CHECK-OUT fields coherent while in Flexible
  // mode: derive a concrete range from the chosen months so the fields always
  // show real dates instead of going blank.
  const syncFlexibleToDateRange = (months: string[]) => {
    if (months.length === 0) {
      setDateRange({ from: undefined, to: undefined });
      setFormData((prev) => ({ ...prev, checkIn: "", checkOut: "" }));
      return;
    }
    const range = getFlexibleDateRange(months);
    setDateRange(range);
    setFormData((prev) => ({
      ...prev,
      checkIn: range.from ? toLocalISODate(range.from) : "",
      checkOut: range.to ? toLocalISODate(range.to) : "",
    }));
  };

  // Wrapped setters passed to BigSearchDatePicker so a Flexible selection also
  // refreshes the derived range (the picker itself only owns flexible state).
  const handleFlexibleMonths = (
    updater: string[] | ((prev: string[]) => string[])
  ) => {
    const next =
      typeof updater === "function" ? updater(flexibleMonths) : updater;
    setFlexibleMonths(next);
    syncFlexibleToDateRange(next);
  };

  const handleSearchMode = (mode: "dates" | "flexible") => {
    setSearchMode(mode);
    if (mode === "flexible") syncFlexibleToDateRange(flexibleMonths);
  };

  // Handle location selection
  const selectLocation = (location: LocationSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      location: location.displayName,
      locationQuery: location.searchValue || location.city || location.displayName,
    }));
    setActiveField("checkin");
  };

  // Add guest counter handlers — stable identity (functional update, no deps)
  // so the memoized GuestSelectorDropdown skips re-rendering untouched rows.
  const handleGuestChange = useCallback((
    type: "adults" | "children" | "infants" | "pets",
    operation: "increment" | "decrement"
  ) => {
    setFormData((prev) => {
      const currentVal = prev.guests[type] ?? 0;
      const nextVal =
        operation === "increment"
          ? Math.min(currentVal + 1, GUEST_LIMITS[type].max)
          : Math.max(GUEST_LIMITS[type].min, currentVal - 1);

      const nextGuests = { ...prev.guests, [type]: nextVal };
      // Airbnb rule: if we add a child, infant, or pet, we must have at least
      // 1 adult. Applied only for non-adult rows — a trailing `adults:` entry
      // in the literal above would clobber an adults increment/decrement.
      if (operation === "increment" && type !== "adults" && nextGuests.adults === 0) {
        nextGuests.adults = 1;
      }

      return { ...prev, guests: nextGuests };
    });
  }, []);

  // Helper function to get total guests
  const getTotalGuests = () => {
    return (
      formData.guests.adults +
      formData.guests.children +
      formData.guests.infants
    );
  };

  // Helper function to get guest display text (combining adults + children as guests, infants and pets separate)
  const getGuestDisplayText = () => {
    const totalGuests = formData.guests.adults + formData.guests.children;
    const totalInfants = formData.guests.infants;
    const totalPets = formData.guests.pets;

    if (totalGuests === 0 && totalInfants === 0 && totalPets === 0) {
      return t.addGuests;
    }

    const parts = [];
    if (totalGuests > 0) {
      parts.push(
        `${totalGuests} ${
          totalGuests > 1 ? t.guestsText : t.guest
        }`
      );
    }
    if (totalInfants > 0) {
      parts.push(
        `${totalInfants} ${
          totalInfants > 1 ? t.infants : t.infant
        }`
      );
    }
    if (totalPets > 0) {
      parts.push(
        `${totalPets} ${
          totalPets > 1 ? t.pets : t.pet
        }`
      );
    }

    return parts.join(", ");
  };

  // Use click outside hook
  useClickOutside(formRef, () => setActiveField(null));

  const handleSearch = () => {
    // Validate dates before search (only in exact-dates mode — a Flexible
    // selection legitimately spans a whole month, which the night-count
    // validation would otherwise reject).
    if (searchMode === "dates" && dateRange.from && dateRange.to && !isDateValid) {
      // Show validation errors by opening the date picker
      setActiveField("checkin");
      return;
    }

    const searchParams = new URLSearchParams();

    if (formData.location) {
      searchParams.set("location", formData.locationQuery || formData.location);
    }
    if (formData.checkIn) {
      searchParams.set("checkIn", formData.checkIn);
    }
    if (formData.checkOut) {
      searchParams.set("checkOut", formData.checkOut);
    }
    if (getTotalGuests() > 0 || formData.guests.pets > 0) {
      searchParams.set("guests", getTotalGuests().toString());
      searchParams.set("adults", formData.guests.adults.toString());
      searchParams.set("children", formData.guests.children.toString());
      searchParams.set("infants", formData.guests.infants.toString());
      if (formData.guests.pets > 0) {
        searchParams.set("pets", formData.guests.pets.toString());
      }
    }

    // Get current locale from pathname
    const pathParts = pathname.split("/");
    const locale = pathParts[1] || "ar";

    // Navigate to /search (map-sidebar variant)
    const searchUrl = `/${locale}/search${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    router.push(searchUrl);

    // Call onSearch callback if provided (for analytics or other side effects)
    if (onSearch) {
      onSearch();
    }
  };

  // Helper function to get field styling
  const getFieldStyling = (field: ActiveField) => {
    const isActive = activeField === field;
    const hasActiveField = activeField !== null;

    let styleClass = "bg-transparent";
    if (isActive) {
      styleClass = "bg-white !border-gray-400";
    } else if (hasActiveField) {
      styleClass = "bg-gray-50";
    }

    return `${styleClass} transition-all duration-200`;
  };

  if (isMobile) {
    const step = fieldStep(activeField);
    const isSheet = variant === "sheet";
    return (
      <div
        className={
          isSheet
            ? "relative h-full w-full"
            : "absolute top-[53%] start-4 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)]"
        }
        ref={formRef}
      >
        <div
          className={`relative bg-white w-full overflow-hidden ${
            isSheet ? "h-full" : "rounded-xs shadow-md"
          }`}
          // Hero: constant height across every state (idle + Where / When / Who)
          // so the card never grows when a menu opens — set inline so Turbopack
          // can't drop it as a brand-new arbitrary utility from its dev scan.
          // Sheet: the card fills the bottom-sheet body (h-full above) instead.
          style={isSheet ? undefined : { height: "min(82vh, 600px)" }}
        >
          {/* Body — branches by panel so the Where search input can stay fixed
              while its list scrolls behind it. Idle + When/Who use one
              full-height scroll area; Where is a flex column (fixed input +
              scrolling list). The floating arrows (top) and Search button
              (bottom) overlay all states. pt clears the arrows, pb the button. */}
          {!activeField ? (
            <div className="h-full overflow-y-auto no-scrollbar px-6 pt-9 pb-24">
              <h1 className="text-2xl font-semibold text-[#484848] mb-7 leading-snug whitespace-pre-line">
                {t.heading}
              </h1>
              <div className="space-y-5">
                {/* Location field */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1.5 block">
                    {t.where}
                  </Label>
                  <button
                    className={`w-full h-14 text-start px-4 border border-gray-300 rounded-xs ${getFieldStyling("location")}`}
                    onClick={() => handleFieldClick("location")}
                  >
                    <span
                      className={`text-sm ${formData.location ? "text-black" : "text-[#c0c0c0]"}`}
                    >
                      {formData.location || t.anywhere}
                    </span>
                  </button>
                </div>

                {/* Date fields */}
                <div>
                  <div className="grid grid-cols-2">
                    <div>
                      <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1.5 block">
                        {t.checkIn}
                      </Label>
                    </div>
                    <div>
                      <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1.5 block">
                        {t.checkOut}
                      </Label>
                    </div>
                  </div>
                  <div className="flex">
                    <button
                      className={`flex-1 h-14 text-start px-4 border border-gray-300 rounded-s-xs rounded-e-none ${getFieldStyling("checkin")}`}
                      onClick={() => handleFieldClick("checkin")}
                    >
                      <span className={`text-sm ${dateRange.from ? "text-black" : "text-[#c0c0c0]"}`}>
                        {dateRange.from ? fmtShortDate(dateRange.from) : t.addDate}
                      </span>
                    </button>
                    <button
                      className={`flex-1 h-14 text-start px-4 border border-gray-300 border-s-0 rounded-e-xs rounded-s-none ${getFieldStyling("checkout")}`}
                      onClick={() => handleFieldClick("checkout")}
                    >
                      <span className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}>
                        {dateRange.to ? fmtShortDate(dateRange.to) : t.addDate}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Guests field */}
                <div>
                  <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1.5 block">
                    {t.guests}
                  </Label>
                  <button
                    className={`w-full h-14 text-start px-4 border border-gray-300 rounded-xs ${getFieldStyling("guests")}`}
                    onClick={() => handleFieldClick("guests")}
                  >
                    <span
                      className={`text-sm ${getTotalGuests() > 0 ? "text-black" : "text-[#c0c0c0]"}`}
                    >
                      {getGuestDisplayText()}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : activeField === "location" ? (
            <div className="flex h-full flex-col px-6 pt-16">
              {/* Fixed search command — stays put; the list scrolls behind it. */}
              <Command shouldFilter={false} className="h-auto shrink-0 overflow-visible bg-transparent mb-3">
                <CommandInput
                  value={searchQuery}
                  onValueChange={searchLocations}
                  placeholder={dict.search?.searchDestinations ?? "Search destinations"}
                  className="h-11"
                />
              </Command>
              {/* Scrolling list — items hide behind the fixed input above and
                  clear the floating Search button via pb. fillHeight renders the
                  list naturally so this container does the scrolling. */}
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar pb-24">
                <LocationDropdown
                  fillHeight
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
            </div>
          ) : (
            <div className="h-full overflow-y-auto no-scrollbar px-6 pt-16 pb-24">
              {/* When — a focused Check-in / Check-out picker (replaces the
                  Dates / Flexible toggle). The active field is a black
                  (foreground) pill; the single-month calendar selects check-in
                  first, then check-out. Picking check-in auto-flips the toggle
                  to Check-out and picking check-out advances to Who — both via
                  handleDateRangeChange, which drives `activeField`. */}
              {(activeField === "checkin" || activeField === "checkout") && (
                <div className="flex flex-col">
                  {/* Check-in / Check-out toggle — simple segmented control (same
                      style as the big-search Dates/Flexible pills): active = white
                      pill, labels only (no date shown). */}
                  <div className="mb-5 flex justify-center">
                    <div className="inline-flex rounded-full bg-[#ebebeb] p-0.5 border border-gray-200/55">
                      {(["checkin", "checkout"] as const).map((field) => {
                        const active = activeField === field;
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={() => setActiveField(field)}
                            className={`px-4 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 ${
                              active
                                ? "bg-white text-[#222222] shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#DDDDDD]"
                                : "text-[#717171] hover:text-[#222222]"
                            }`}
                          >
                            {field === "checkin" ? t.checkIn : t.checkOut}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Single-month calendar. Wrapped in a div that overrides the
                      theme `--primary` to black so the selected check-in/out
                      endpoints render foreground/black (not brand red). */}
                  <div
                    className="flex justify-center"
                    style={
                      {
                        "--primary": "#222222",
                        "--color-primary": "#222222",
                        "--primary-foreground": "#ffffff",
                        "--color-primary-foreground": "#ffffff",
                      } as CSSProperties
                    }
                  >
                    <Calendar
                      mode="range"
                      min={1}
                      numberOfMonths={1}
                      defaultMonth={dateRange.from ?? new Date()}
                      locale={isAr ? ar : enUS}
                      selected={dateRange as DateRange}
                      onSelect={(range: DateRange | undefined) =>
                        handleDateRangeChange(range?.from, range?.to, 450)
                      }
                      disabled={(date) => {
                        const t0 = new Date();
                        t0.setHours(0, 0, 0, 0);
                        return date < t0;
                      }}
                      showOutsideDays={false}
                      // Cell size via inline style (lands on the day-picker root,
                      // beating the base className default) so it reliably fits
                      // the px-6 panel without a brand-new arbitrary utility.
                      style={
                        {
                          "--cell-size": "42px",
                          "--cell-radius": "21px",
                        } as CSSProperties
                      }
                      className="p-0"
                      classNames={{
                        root: "p-0",
                        months: "relative flex flex-row",
                        month: "flex flex-col gap-1.5",
                        month_grid: "w-auto",
                        week: "mt-0",
                        month_caption:
                          "h-9 mb-1 flex w-full items-center justify-center px-(--cell-size)",
                        caption_label: "text-base font-medium text-[#222222]",
                        button_previous: "size-9 text-[#222222]",
                        button_next: "size-9 text-[#222222]",
                        weekday:
                          "w-(--cell-size) h-7 flex items-center justify-center text-xs font-normal text-[#6a6a6a] select-none",
                        day: "size-(--cell-size) p-0 relative focus-within:relative focus-within:z-20 rounded-full hover:bg-gray-100 transition-all duration-150",
                        range_start: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-s-full",
                        range_middle: "bg-[#f7f7f7] rounded-none",
                        range_end: "bg-[#f7f7f7] after:bg-[#f7f7f7] rounded-e-full",
                        today: "bg-transparent",
                      }}
                      formatters={{
                        formatWeekdayName: (date, options) =>
                          date.toLocaleDateString(options?.locale?.code ?? "default", {
                            weekday: "narrow",
                          }),
                      }}
                    />
                  </div>

                  {/* Selected range summary — from → to. Auto-mirrors in RTL
                      (check-in lands on the start side); a neutral dash avoids a
                      direction-specific arrow. */}
                  <div className="mt-5 flex items-center justify-center gap-2.5 text-sm">
                    <span
                      className={
                        dateRange.from
                          ? "font-semibold text-[#222222]"
                          : "text-[#9a9a9a]"
                      }
                    >
                      {dateRange.from
                        ? dateRange.from.toLocaleDateString(isAr ? "ar" : "en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : t.checkIn}
                    </span>
                    <span className="text-[#9a9a9a]">–</span>
                    <span
                      className={
                        dateRange.to
                          ? "font-semibold text-[#222222]"
                          : "text-[#9a9a9a]"
                      }
                    >
                      {dateRange.to
                        ? dateRange.to.toLocaleDateString(isAr ? "ar" : "en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : t.checkOut}
                    </span>
                  </div>
                </div>
              )}

              {activeField === "guests" && (
                <GuestSelectorDropdown
                  guests={formData.guests}
                  onGuestChange={handleGuestChange}
                />
              )}
            </div>
          )}

          {/* Floating step arrows (active only) — plain line arrows, no outline
              or background, so the full-width content scrolls freely behind
              them. Walk Where → When → Who instead of a single Back. */}
          {activeField && (
            <div className="absolute top-5 start-4 z-30 flex items-center gap-3">
              <button
                type="button"
                onClick={goPrevField}
                disabled={step <= 0}
                aria-label={t.back}
                className="flex h-7 w-7 items-center justify-center text-[#222222] transition-opacity hover:opacity-60 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <ArrowLeft className={`h-5 w-5 ${isRTL ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={goNextField}
                disabled={step >= 3}
                aria-label={dict.common?.next ?? "Next"}
                className="flex h-7 w-7 items-center justify-center text-[#222222] transition-opacity hover:opacity-60 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <ArrowRight className={`h-5 w-5 ${isRTL ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
            </div>
          )}

          {/* Floating Search button — pinned to the bottom-end, on top of the
              scrolling body, so it stays reachable in every state. In the sheet
              (ctaLayoutId set) it's a Framer shared-layout twin of the collapsed
              pill's red search circle, so the circle morphs into this pill. */}
          {ctaLayoutId ? (
            <motion.button
              layoutId={ctaLayoutId}
              type="button"
              onClick={handleSearch}
              className={`absolute bottom-5 end-4 z-30 flex h-12 items-center gap-2 rounded-full ${isAr ? "px-8" : "px-6"} text-sm font-semibold bg-[#de3151] hover:bg-[#de3151]/90 text-white shadow-[0_6px_20px_rgba(222,49,81,0.4)]`}
            >
              <Search className="h-4 w-4" strokeWidth={2.5} />
              {t.search}
            </motion.button>
          ) : (
            <Button
              onClick={handleSearch}
              className={`absolute bottom-5 end-4 z-30 h-12 gap-2 rounded-full ${isAr ? "px-8" : "px-6"} text-sm font-semibold bg-[#de3151] hover:bg-[#de3151]/90 text-white shadow-[0_6px_20px_rgba(222,49,81,0.4)]`}
            >
              <Search className="h-4 w-4" strokeWidth={2.5} />
              {t.search}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Desktop version
  return (
    <div
      className="absolute top-[46%] start-4 md:start-8 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-auto"
      ref={formRef}
    >
      <div className="relative">
        <div className="bg-white rounded-xs px-4 md:px-6 py-6 md:py-4 shadow-md w-full md:w-[340px]">
          {/* Main heading */}
          <h1 className="text-lg md:text-xl font-medium text-[#6b6b6b] mb-4 md:mb-3 leading-tight whitespace-pre-line">
            {t.heading}
          </h1>

          {/* Desktop: All fields visible */}
          <div className="space-y-4 md:space-y-3">
            {/* Location field */}
            <div>
              <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                {t.where}
              </Label>
              <button
                className={`w-full h-12 text-start px-3 border border-gray-300 rounded-xs ${getFieldStyling("location")}`}
                onClick={() => handleFieldClick("location")}
              >
                <span
                  className={`text-sm ${formData.location ? "text-black" : "text-[#c0c0c0]"}`}
                >
                  {formData.location || t.anywhere}
                </span>
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
                >
                  <span className={`text-sm ${dateRange.from ? "text-black" : "text-[#c0c0c0]"}`}>
                    {dateRange.from ? fmtShortDate(dateRange.from) : t.addDate}
                  </span>
                </button>
                <button
                  className={`flex-1 h-12 text-start px-3 border border-gray-300 border-s-0 rounded-e-xs rounded-s-none ${getFieldStyling("checkout")}`}
                  onClick={() => handleFieldClick("checkout")}
                >
                  <span className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}>
                    {dateRange.to ? fmtShortDate(dateRange.to) : t.addDate}
                  </span>
                </button>
              </div>
            </div>

            {/* Travelers field */}
            <div>
              <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
                {t.guests}
              </Label>
              <button
                className={`w-full h-12 text-start px-3 border border-gray-300 rounded-xs ${getFieldStyling("guests")}`}
                onClick={() => handleFieldClick("guests")}
              >
                <span
                  className={`text-sm ${getTotalGuests() > 0 ? "text-black" : "text-[#c0c0c0]"}`}
                >
                  {getGuestDisplayText()}
                </span>
              </button>
            </div>

            {/* Mobile-only Inline Dropdowns - appear below fields when active */}
            {activeField === "location" && (
              <div className="md:hidden pt-3 border-t border-gray-200">
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
            )}

            {(activeField === "checkin" || activeField === "checkout") && (
              <div className="md:hidden pt-3 border-t border-gray-200">
                <div className="flex justify-center overflow-hidden -mx-2">
                  <Calendar
                    mode="range"
                    defaultMonth={dateRange.from || new Date()}
                    selected={dateRange}
                    onSelect={(range: DateRange | undefined) => {
                      if (range) {
                        handleDateRangeChange(range.from, range.to);
                      } else {
                        handleDateRangeChange(undefined, undefined);
                      }
                    }}
                    numberOfMonths={1}
                    disabled={(date) => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (date < today) return true;
                      const maxDate = addDays(today, SEARCH_CONFIG.DEFAULT_MAX_NIGHTS);
                      if (date > maxDate) return true;
                      if (dateRange.from && !dateRange.to) {
                        const maxCheckout = addDays(dateRange.from, SEARCH_CONFIG.DEFAULT_MAX_NIGHTS);
                        if (date > maxCheckout) return true;
                      }
                      return false;
                    }}
                  />
                </div>
              </div>
            )}

            {activeField === "guests" && (
              <div className="md:hidden pt-3 border-t border-gray-200">
                <GuestSelectorDropdown
                  guests={formData.guests}
                  onGuestChange={handleGuestChange}
                />
              </div>
            )}

            {/* Search button */}
            <div className="pt-3 md:pt-2 flex justify-end">
              <Button
                onClick={handleSearch}
                className="px-8 py-2 md:py-1 h-12 md:h-10 text-sm font-medium bg-[#de3151] hover:bg-[#de3151]/90 text-white rounded-xs"
              >
                {t.search}
              </Button>
            </div>
          </div>
        </div>

        {/* Desktop-only Side Dropdowns - Positioned beside form */}
        {activeField === "location" && (
          <div
            className="hidden md:block absolute top-0 start-full ms-4 w-[420px] max-w-[calc(100vw-2rem)] bg-white rounded-[32px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 p-6 z-10"
            onMouseLeave={() => setActiveField(null)}
          >
            {/* Search command — type to search destinations (drives the same
                location autocomplete the /listings BigSearch bar uses). */}
            <Command shouldFilter={false} className="overflow-visible bg-transparent mb-3">
              <CommandInput
                value={searchQuery}
                onValueChange={searchLocations}
                placeholder={dict.search?.searchDestinations ?? "Search destinations"}
                className="h-11"
              />
            </Command>
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
        )}

        {(activeField === "checkin" || activeField === "checkout") && (
          <div
            // Fixed 850px width (matching the /listings BigSearch dropdown) so the
            // Flexible-tab month carousel has a definite width to scroll within —
            // otherwise (w-auto) the carousel expands to fit all chips and the
            // prev/next arrows never appear. Width set inline because Turbopack
            // can drop a brand-new arbitrary `w-[850px]` utility from the dev scan.
            className="hidden md:block absolute top-0 start-full ms-4 max-w-[calc(100vw-2rem)] bg-white rounded-[32px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 z-10 p-8"
            style={{ width: 850 }}
            onMouseLeave={() => setActiveField(null)}
          >
            {/* Same date picker as the /listings BigSearch — Dates / Flexible
                tabs, two-month calendar, and ± flexibility pills. The hero's
                two CHECK-IN / CHECK-OUT fields both open this one picker; it
                owns the range internally and reports it via onDateChange. */}
            <BigSearchDatePicker
              dateRange={dateRange}
              onDateChange={handleDateRangeChange}
              searchMode={searchMode}
              setSearchMode={handleSearchMode}
              flexibleDuration={flexibleDuration}
              setFlexibleDuration={setFlexibleDuration}
              flexibleMonths={flexibleMonths}
              setFlexibleMonths={handleFlexibleMonths}
              dateFlexibility={dateFlexibility}
              setDateFlexibility={setDateFlexibility}
            />
          </div>
        )}

        {activeField === "guests" && (
          <div
            className="hidden md:block absolute top-0 start-full ms-4 w-[394px] max-w-[calc(100vw-2rem)] bg-white rounded-[32px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 p-6 z-10"
            onMouseLeave={() => setActiveField(null)}
          >
            {/* Same guest selector as the /listings BigSearch (Adults /
                Children / Infants / Pets), rendered full-height. */}
            <GuestSelectorDropdown
              guests={formData.guests}
              onGuestChange={handleGuestChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
