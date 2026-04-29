"use client";

import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Counter } from "@/components/atom/counter";
import { format, addDays } from "date-fns";
import { ar, enUS } from "date-fns/locale";
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
    adult: "adult",
    adults: "adults",
    child: "child",
    children: "children",
    infant: "infant",
    infants: "infants",
    selectCheckIn: "Select check-in date",
    selectCheckOut: "Select check-out date",
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
    adult: "بالغ",
    adults: "بالغين",
    child: "طفل",
    children: "أطفال",
    infant: "رضيع",
    infants: "رضع",
    selectCheckIn: "اختر تاريخ الوصول",
    selectCheckOut: "اختر تاريخ المغادرة",
  },
} as const;

type ActiveField = "location" | "checkin" | "checkout" | "guests" | null;

interface VerticalSearchProps {
  onSearch?: () => void;
}

export default function VerticalSearch({ onSearch }: VerticalSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale, isRTL } = useLocale();
  const t = searchTranslations[locale as 'en' | 'ar'] || searchTranslations.en;
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [isMobile, setIsMobile] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    location: "",
    checkIn: "",
    checkOut: "",
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

  // Track previous date range for detecting changes
  const [prevDateRange, setPrevDateRange] = useState<{
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

  const handleFieldClick = (field: ActiveField) => {
    setActiveField(activeField === field ? null : field);
  };

  const handleDateRangeChange = (
    from: Date | undefined,
    to: Date | undefined
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

    // AUTO-ADVANCE & AUTO-CLOSE LOGIC:
    if (fromChanged && from && !to) {
      // User just selected check-in → auto-switch to check-out field
      setActiveField("checkout");
    } else if (toChanged && from && to) {
      // User just selected check-out → auto-close dropdown
      setActiveField(null);
    }

    // Track for next comparison
    setPrevDateRange({ from, to });
  };

  // Handle location selection
  const selectLocation = (location: LocationSuggestion) => {
    setFormData((prev) => ({ ...prev, location: location.displayName }));
    setActiveField("checkin");
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

  // Helper function to get total guests
  const getTotalGuests = () => {
    return (
      formData.guests.adults +
      formData.guests.children +
      formData.guests.infants
    );
  };

  // Helper function to get guest display text
  const getGuestDisplayText = () => {
    const total = getTotalGuests();
    if (total === 0) return t.addGuests;

    const parts = [];
    if (formData.guests.adults > 0) {
      parts.push(
        `${formData.guests.adults} ${formData.guests.adults > 1 ? t.adults : t.adult}`
      );
    }
    if (formData.guests.children > 0) {
      parts.push(
        `${formData.guests.children} ${formData.guests.children > 1 ? t.children : t.child}`
      );
    }
    if (formData.guests.infants > 0) {
      parts.push(
        `${formData.guests.infants} ${formData.guests.infants > 1 ? t.infants : t.infant}`
      );
    }

    return parts.join(", ");
  };

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
    if (formData.checkIn) {
      searchParams.set("checkIn", formData.checkIn);
    }
    if (formData.checkOut) {
      searchParams.set("checkOut", formData.checkOut);
    }
    if (getTotalGuests() > 0) {
      searchParams.set("guests", getTotalGuests().toString());
      searchParams.set("adults", formData.guests.adults.toString());
      searchParams.set("children", formData.guests.children.toString());
      searchParams.set("infants", formData.guests.infants.toString());
    }

    // Get current locale from pathname
    const pathParts = pathname.split("/");
    const locale = pathParts[1] || "en";

    // Always navigate to listings page
    const searchUrl = `/${locale}/listings${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
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
    return (
      <div
        className="absolute top-[53%] start-4 md:start-8 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)] md:w-auto max-h-[80vh] overflow-auto"
        ref={formRef}
      >
        <div className="bg-white rounded-xs px-4 md:px-6 py-6 md:py-4 shadow-md w-full md:w-80">
          {/* Header - Show heading or back arrow */}
          {!activeField ? (
            /* Show main heading when no field is active */
            <h1 className="text-lg md:text-xl font-medium text-[#6b6b6b] mb-4 md:mb-3 leading-tight whitespace-pre-line">
              {t.heading}
            </h1>
          ) : (
            /* Show back arrow when dropdown is active */
            <div className="flex items-center mb-4 md:mb-3">
              <button
                onClick={() => setActiveField(null)}
                className="flex items-center text-[#6b6b6b] hover:text-black transition-colors"
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
                      {dateRange.from ? format(dateRange.from, "MMM dd") : t.addDate}
                    </span>
                  </button>
                  <button
                    className={`flex-1 h-12 text-start px-3 border border-gray-300 border-s-0 rounded-e-xs rounded-s-none ${getFieldStyling("checkout")}`}
                    onClick={() => handleFieldClick("checkout")}
                  >
                    <span className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}>
                      {dateRange.to ? format(dateRange.to, "MMM dd") : t.addDate}
                    </span>
                  </button>
                </div>
              </div>

              {/* Guests field */}
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
            </div>
          ) : (
            /* Show dropdown content when a field is active */
            <div className="min-h-[200px] max-h-[60vh] overflow-y-auto">
              {activeField === "location" && (
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
              )}

              {(activeField === "checkin" || activeField === "checkout") && (
                <div className="flex flex-col overflow-hidden -mx-2">
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
                      </button>
                      <button
                        onClick={() => setActiveField("checkout")}
                        disabled={!dateRange.from}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                          activeField === "checkout"
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {t.checkOut}
                      </button>
                    </div>

                    {/* Hint below tabs */}
                    <p className="text-xs text-gray-500 text-center mt-1.5">
                      {activeField === "checkin" ? t.selectCheckIn : t.selectCheckOut}
                    </p>
                  </div>

                  <div className="flex justify-center">
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
                      locale={isRTL ? ar : enUS}
                      className="[--cell-size:2rem] p-0 text-sm"
                      classNames={{
                        months: "gap-0",
                        month: "gap-1",
                        nav: "gap-0.5",
                        week: "mt-0",
                        weekday: "text-[10px] font-normal",
                        month_caption: "h-8",
                      }}
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
                <GuestSelectorDropdown
                  guests={formData.guests}
                  onGuestChange={handleGuestChange}
                />
              )}
            </div>
          )}

          {/* Fixed Search button - always visible */}
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
    );
  }

  // Desktop version
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
                    {dateRange.from ? format(dateRange.from, "MMM dd") : t.addDate}
                  </span>
                </button>
                <button
                  className={`flex-1 h-12 text-start px-3 border border-gray-300 border-s-0 rounded-e-xs rounded-s-none ${getFieldStyling("checkout")}`}
                  onClick={() => handleFieldClick("checkout")}
                >
                  <span className={`text-sm ${dateRange.to ? "text-black" : "text-[#c0c0c0]"}`}>
                    {dateRange.to ? format(dateRange.to, "MMM dd") : t.addDate}
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
                    locale={isRTL ? ar : enUS}
                    className="[--cell-size:2rem] p-0 text-sm"
                    classNames={{
                      months: "gap-0",
                      month: "gap-1",
                      nav: "gap-0.5",
                      week: "mt-0",
                      weekday: "text-[10px] font-normal",
                      month_caption: "h-8",
                    }}
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
            className="hidden md:block absolute top-0 start-full ms-4 w-80 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10 overflow-hidden"
            style={{ height: formHeight ? `${formHeight}px` : 'auto' }}
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
          </div>
        )}

        {(activeField === "checkin" || activeField === "checkout") && (
          <div
            className="hidden md:block absolute top-0 start-full ms-4 w-auto bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-3 z-10 overflow-hidden"
            onMouseLeave={() => setActiveField(null)}
          >
            {/* HINT TEXT */}
            <div className="mb-2 px-1">
              <p className="text-xs font-medium text-gray-600 text-center">
                {activeField === "checkin" ? t.selectCheckIn : t.selectCheckOut}
              </p>
            </div>

            <div className="flex justify-center">
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
                numberOfMonths={2}
                locale={isRTL ? ar : enUS}
                className="[--cell-size:2rem] p-0 text-sm"
                classNames={{
                  months: "gap-4",
                  month: "gap-1",
                  nav: "gap-0.5",
                  week: "mt-0",
                  weekday: "text-[10px] font-normal",
                  month_caption: "h-8",
                }}
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
          <div
            className="hidden md:block absolute top-0 start-full ms-4 w-80 bg-white rounded-2xl shadow-lg border border-[#e5e7eb] p-6 z-10 overflow-hidden"
            style={{ height: formHeight ? `${formHeight}px` : 'auto' }}
            onMouseLeave={() => setActiveField(null)}
          >
            <div className="h-full overflow-y-auto">
              <GuestSelectorDropdown
                guests={formData.guests}
                onGuestChange={handleGuestChange}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
