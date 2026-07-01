"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import LocationDropdown from "./location";
import BigSearchDatePicker, { pickerTranslations } from "./big-search-date-picker";
import ExperiencesDatePicker from "./experiences-date-picker";
import GuestSelectorDropdown from "./guest-selector";
import ServiceTypeDropdown from "./service-type";
import { useLocale } from "@/components/internationalization/use-locale";
import { useLocationSuggestions } from "./hooks/use-location-suggestions";
import { useSearchValidation } from "@/hooks/useSearchValidation";
import { type LocationSuggestion } from "@/lib/schemas/search-schema";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import useSearchHeaderStore, { type SearchSegment } from "@/hooks/useSearchHeaderStore";

// Slide-and-fade downward when a dropdown first opens / fully closes — gives
// the impression that the panel is emerging from beneath the search bar,
// without the bar itself shifting. Used only for the panel's enter/exit; the
// segment-to-segment morph is driven by the layout spring below.
const DROPDOWN_TRANSITION = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };
const dropdownMotion = {
  initial: { opacity: 0, y: -8, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.985 },
};

// Segment-switch motion (Where ⇄ When ⇄ Who). The white active pill is a shared
// `layoutId` element and the dropdown is a single `layout` container, so a spring
// here makes BOTH glide between segments: the pill slides and stretches to the new
// segment's width while the panel smoothly re-anchors and resizes (e.g. 420px →
// full-width moving Where → When, then → 394px for Who). Tuned for a smooth,
// lightly-eased settle (~0.4s, no bounce) — the "very smooth" glide the live site
// actually snaps through, but which reads better here. Panel CONTENT crossfades on
// its own short tween (SWITCH_FADE) instead of this spring, since a spring on
// opacity wobbles.
const SWITCH_TRANSITION = {
  type: "spring" as const,
  stiffness: 480,
  damping: 42,
  mass: 1,
} as const;

// Content crossfade for the panel body as it swaps Where → When → Who. Short and
// eased so the outgoing body dissolves as the incoming one resolves, in step with
// the panel's spring resize above.
const SWITCH_FADE = { duration: 0.2, ease: [0.32, 0.72, 0, 1] as const };

// Captured from airbnb.com: the elevated active-segment pill shadow.
const PILL_SHADOW =
  "rgba(0,0,0,0.1) 0px 3px 12px 0px, rgba(0,0,0,0.08) 0px 1px 2px 0px";

// The white active-segment fill, as ONE shared element. Every active segment
// renders it with the same `layoutId`, so Framer interpolates its position AND
// width as the active segment changes — the pill GLIDES Where→When→Who (same
// trick as the tabs underline) instead of three backgrounds cross-fading.
//
// MUST live at module scope: when this was a closure defined inside BigSearch,
// every render produced a fresh component identity, so React remounted the
// motion.div on each render and Framer's layout projection reset — the pill
// snapped between segments instead of gliding. Hoisting it makes the identity
// stable so the shared-layout hand-off animates. zIndex:-1 keeps it above the
// grey hover pseudo (-z-10) but below the segment text; pointer-events-none so
// it never eats clicks.
function ActivePill() {
  return (
    <motion.div
      layoutId="searchActivePill"
      transition={SWITCH_TRANSITION}
      aria-hidden
      className="absolute inset-0 rounded-full bg-white pointer-events-none"
      // The active (focused) segment gets a 1px outline in the SAME #DDDDDD as
      // the outer search bar's border, so the focused pill reads as a mini of
      // the outer component. Inline (not a Tailwind arbitrary) so it always
      // renders in dev — Turbopack's incremental scan sometimes drops brand-new
      // arbitrary border utilities.
      style={{ zIndex: -1, boxShadow: PILL_SHADOW, border: "1px solid #DDDDDD" }}
    />
  );
}

type ActiveButton = "location" | "dates" | "guests" | null;

interface BigSearchProps {
  onClose?: () => void;
  // When the parent toggles this off (e.g. header collapses on scroll),
  // reset any open dropdown so it doesn't reappear when the header re-expands.
  isActive?: boolean;
  // Which dropdown to auto-open when the bar expands from a compact-pill click.
  // null = expanded by scroll, so open with no dropdown active.
  openTo?: SearchSegment | null;
}

export default function BigSearch({ onClose, isActive = true, openTo = null }: BigSearchProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
  const { locale } = useLocale();
  // Active category tab (Homes/Experiences/Services) drives per-tab fields:
  // Experiences changes the "Where" placeholder; Services swaps the third
  // segment from Who/guests to "Type of service".
  const activeTab = useSearchHeaderStore((s) => s.activeTab);
  const isServices = activeTab === "services";
  const isExperiences = activeTab === "experiences";
  // Experiences and Services share the new single-month + quick-cards "When"
  // picker; only Homes keeps the two-month Dates/Flexible picker.
  const usesActivityDatePicker = isExperiences || isServices;
  const [activeButton, setActiveButton] = useState<ActiveButton>(null);
  const [hoveredButton, setHoveredButton] = useState<ActiveButton>(null);
  const [selectedService, setSelectedService] = useState<string>("");
  const searchBarRef = useRef<HTMLDivElement>(null);

  const [searchMode, setSearchMode] = useState<"dates" | "flexible">("dates");
  const [flexibleDuration, setFlexibleDuration] = useState<"weekend" | "week" | "month">("week");
  const [flexibleMonths, setFlexibleMonths] = useState<string[]>([]);
  const [dateFlexibility, setDateFlexibility] = useState<string>("exact");

  useEffect(() => {
    // When the parent collapses the search bar (isActive=false), reset any
    // open dropdown so it doesn't reappear on re-expand. Sync from prop —
    // intentional setState-in-effect.
    if (!isActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset on parent prop change; reverse-state-derivation would need controlled mode.
      setActiveButton(null);
      setHoveredButton(null);
    }
  }, [isActive]);

  useEffect(() => {
    // Deep-link the dropdown the user pointed at on the compact pill: tapping
    // "When" opens the calendar, "Who" the guests panel, etc. Only fires while
    // the bar is active and a segment was actually requested (scroll-driven
    // expands pass openTo=null, so they open with no dropdown).
    if (isActive && openTo) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Sync requested dropdown from parent intent on expand.
      setActiveButton(openTo);
    }
  }, [isActive, openTo]);

  // Selected location state. `selectedLocation` is the localized label shown
  // in the pill; `selectedLocationQuery` is the canonical (English) token sent
  // as the `location` URL param so the query matches the English-stored data
  // regardless of the display locale.
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedLocationQuery, setSelectedLocationQuery] = useState("");

  // Use the location suggestions hook
  const {
    suggestions,
    popularLocations,
    isLoading: isLoadingLocations,
    error: locationError,
    search: searchLocations,
    query: searchQuery,
  } = useLocationSuggestions();

  // Date range state
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });

  // Use the search validation hook
  const { isValid: isDateValid } = useSearchValidation(dateRange);

  // Guest state
  const [guests, setGuests] = useState({
    adults: 0,
    children: 0,
    infants: 0,
    pets: 0,
  });

  const handleButtonClick = (button: ActiveButton) => {
    setActiveButton(activeButton === button ? null : button);
  };

  // Handle location selection
  const handleLocationSelect = (location: LocationSuggestion | null) => {
    if (location) {
      setSelectedLocation(location.displayName);
      setSelectedLocationQuery(
        location.searchValue || location.city || location.displayName
      );
      setActiveButton("dates"); // Move to next field
    } else {
      setActiveButton(null);
    }
  };

  // Handle date range change
  const handleDateChange = (from: Date | undefined, to: Date | undefined) => {
    setDateRange({ from, to });
    // Close the dropdown when both dates are selected
    if (from && to) {
      setActiveButton(null);
    }
  };

  // Helper for formatting flexible date text
  const getMonthsListText = (months: string[], loc: string) => {
    if (months.length === 0) return loc === "ar" ? "أي شهر" : "any month";
    
    const t = pickerTranslations[loc === "ar" ? "ar" : "en"];
    const monthNames = months.map(m => {
      const [_, monthStr = "1"] = m.split("-");
      const monthIdx = parseInt(monthStr, 10) - 1;
      const name = t.monthsName[monthIdx.toString() as keyof typeof t.monthsName];
      return name;
    });

    if (loc === "ar") {
      return monthNames.join(" و ");
    } else {
      if (monthNames.length === 1) return monthNames[0];
      if (monthNames.length === 2) return `${monthNames[0]} & ${monthNames[1]}`;
      return `${monthNames.slice(0, -1).join(", ")}, & ${monthNames[monthNames.length - 1]}`;
    }
  };

  const getFlexibleDisplayText = (duration: "weekend" | "week" | "month", months: string[], loc: string) => {
    const t = pickerTranslations[loc === "ar" ? "ar" : "en"];
    const durationText = duration === "weekend" ? t.weekend : duration === "week" ? t.week : t.month;
    const monthsText = getMonthsListText(months, loc);
    
    if (loc === "ar") {
      return `أي ${durationText} في ${monthsText}`;
    } else {
      return `Any ${durationText} in ${monthsText}`;
    }
  };

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

    const firstParts = first.split("-");
    const lastParts = last.split("-");

    const firstYear = parseInt(firstParts[0] || "0", 10);
    const firstMonth = parseInt(firstParts[1] || "1", 10);
    const lastYear = parseInt(lastParts[0] || "0", 10);
    const lastMonth = parseInt(lastParts[1] || "1", 10);

    const from = new Date(firstYear, firstMonth - 1, 1);
    const to = new Date(lastYear, lastMonth, 0);

    return { from, to };
  };

  // Format date for display
  const formatDate = (date: Date | undefined) => {
    if (!date) return "";
    return date.toLocaleDateString(locale === "ar" ? "ar" : "en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Get combined dates display text for the single "When" segment
  const getDatesDisplayText = () => {
    if (searchMode === "dates") {
      if (dateRange.from && dateRange.to) {
        const fromStr = formatDate(dateRange.from);
        const toStr = formatDate(dateRange.to);
        // A single-day pick (quick cards "Today"/"Tomorrow", or a same-day
        // experience) shows just the one date instead of "Jun 29 – Jun 29".
        const sameDay =
          dateRange.from.getFullYear() === dateRange.to.getFullYear() &&
          dateRange.from.getMonth() === dateRange.to.getMonth() &&
          dateRange.from.getDate() === dateRange.to.getDate();
        if (sameDay) return fromStr;
        const flexText = dateFlexibility !== "exact" 
          ? ` (± ${dateFlexibility} ${locale === "ar" ? "يوم" : "day"}${dateFlexibility === "1" ? "" : "s"})` 
          : "";
        return `${fromStr} – ${toStr}${flexText}`;
      }
      if (dateRange.from) {
        return formatDate(dateRange.from);
      }
      return dict.search?.addDates ?? "Add dates";
    } else {
      return getFlexibleDisplayText(flexibleDuration, flexibleMonths, locale);
    }
  };

  // Handle guest change
  const handleGuestChange = (
    type: "adults" | "children" | "infants" | "pets",
    operation: "increment" | "decrement"
  ) => {
    setGuests((prev) => {
      const currentVal = prev[type] ?? 0;
      const nextVal =
        operation === "increment" ? currentVal + 1 : Math.max(0, currentVal - 1);

      let nextAdults = prev.adults;
      // Airbnb rule: if we add a child, infant, or pet, we must have at least 1 adult
      if (operation === "increment" && type !== "adults" && prev.adults === 0) {
        nextAdults = 1;
      }

      return {
        ...prev,
        [type]: nextVal,
        adults: nextAdults,
      };
    });
  };

  // Get guest display text formatted like Airbnb (combining adults + children as guests, infants and pets separate)
  const getGuestDisplayText = () => {
    const totalGuests = guests.adults + guests.children;
    const totalInfants = guests.infants;
    const totalPets = guests.pets;

    if (totalGuests === 0 && totalInfants === 0 && totalPets === 0) {
      return dict.search?.addGuests ?? "Add guests";
    }

    const parts = [];
    if (totalGuests > 0) {
      parts.push(
        `${totalGuests} ${
          totalGuests > 1
            ? (dict.search?.guests ?? "guests")
            : (dict.search?.guest ?? "guest")
        }`
      );
    }
    if (totalInfants > 0) {
      parts.push(
        `${totalInfants} ${
          totalInfants > 1
            ? (dict.search?.infants ?? "infants")
            : (dict.search?.infant ?? "infant")
        }`
      );
    }
    if (totalPets > 0) {
      parts.push(
        `${totalPets} ${
          totalPets > 1
            ? (dict.search?.pets ?? "pets")
            : (dict.search?.pet ?? "pet")
        }`
      );
    }

    return parts.join(", ");
  };

  // Click outside to reset
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchBarRef.current &&
        !searchBarRef.current.contains(event.target as Node)
      ) {
        setActiveButton(null);
        setHoveredButton(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const isLineHidden = (position: "location-dates" | "dates-guests") => {
    switch (position) {
      case "location-dates":
        return (
          hoveredButton === "location" ||
          hoveredButton === "dates" ||
          activeButton === "location" ||
          activeButton === "dates"
        );
      case "dates-guests":
        return (
          hoveredButton === "dates" ||
          hoveredButton === "guests" ||
          activeButton === "dates" ||
          activeButton === "guests"
        );
      default:
        return false;
    }
  };

  // Helper function to get button styling.
  //
  // The HOVER fill lives on a `before:` pseudo-element (not the button itself)
  // so a hovered neighbor can extend its fill *under* the active white pill.
  // Two convex rounded caps facing each other would otherwise leave a lighter
  // #EBEBEB lens at the seam; tucking the darker #DDDDDD behind the active pill
  // (which sits at z-20) fills that notch instead. The white ACTIVE fill is no
  // longer a pseudo — it's a single shared `layoutId` element that slides
  // between segments (see ActivePill below), which is why the isActive branch
  // emits no background here.
  const getButtonStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const isHovered = hoveredButton === button;
    const hasActiveButton = activeButton !== null;

    // Stacking: active segment sits above its neighbors so the sliding white
    // pill (and its content) paint over their extended hover fills.
    const z = isActive ? "z-20" : "z-10";

    // Pseudo background color by state.
    let bgClass = "";
    if (isActive) {
      // White fill is painted by the shared sliding pill; pseudo stays clear.
      bgClass = "";
    } else if (hasActiveButton) {
      // Another segment is active: blend into the bar's #EBEBEB, darken on hover.
      bgClass = isHovered ? "before:bg-[#DDDDDD]" : "";
    } else if (isHovered) {
      // Hover fill ONLY — a soft #EBEBEB pill, matching airbnb.com whose search
      // segments get a plain grey fill on hover with NO border ring.
      // The old `before:border before:border-[#DDDDDD]` ring was removed because
      // it caused a one-second black-outline flash: an unset border-color
      // defaults to `currentColor` (≈#222), so `before:transition-colors`
      // animated the ring from black → #DDDDDD on every hover. No border ⇒
      // nothing to transition ⇒ no flash (and it's closer to the live site).
      bgClass = "before:bg-[#EBEBEB]";
    }

    // Seam fill: when a neighbor of the active pill is hovered, stretch its
    // pseudo past the cap radius toward the active side AND square off the edge
    // that tucks under the white pill. A rounded edge would recede at the
    // top/bottom corners and leave a light-gray notch; squaring it fills the
    // full height while the square edge stays hidden under the white pill.
    // Exactly one start/end inset and a non-conflicting round class are emitted.
    const order: Exclude<ActiveButton, null>[] = ["location", "dates", "guests"];
    let insetStart = "before:start-0";
    let insetEnd = "before:end-0";
    let roundClass = "before:rounded-full";
    if (activeButton !== null && !isActive && isHovered && button !== null) {
      const activeIdx = order.indexOf(activeButton);
      const buttonIdx = order.indexOf(button);
      if (buttonIdx === activeIdx + 1) {
        // Active is to my left → extend left under it, square the left edge.
        insetStart = "before:-start-10";
        roundClass = "before:rounded-e-full before:rounded-s-none";
      } else if (buttonIdx === activeIdx - 1) {
        // Active is to my right → extend right under it, square the right edge.
        insetEnd = "before:-end-10";
        roundClass = "before:rounded-s-full before:rounded-e-none";
      }
    }

    return `relative ${z} before:absolute before:inset-y-0 ${insetStart} ${insetEnd} before:-z-10 ${roundClass} before:transition-colors before:duration-200 before:content-[''] ${bgClass} transition-all duration-200`;
  };

  const handleSearch = () => {
    // Validate dates before search if in standard date mode
    if (searchMode === "dates" && dateRange.from && dateRange.to && !isDateValid) {
      setActiveButton("dates");
      return;
    }

    const searchParams = new URLSearchParams();

    if (selectedLocation) {
      searchParams.set("location", selectedLocationQuery || selectedLocation);
    }

    // Format a Date as YYYY-MM-DD from LOCAL components. Using toISOString()
    // converts to UTC first, which shifts the calendar day by ±1 in non-UTC
    // timezones (e.g. a local Jul 12 became "2026-07-11" in the URL).
    const toLocalISODate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    let finalCheckIn = "";
    let finalCheckOut = "";

    if (searchMode === "dates") {
      if (dateRange.from) {
        finalCheckIn = toLocalISODate(dateRange.from);
      }
      if (dateRange.to) {
        finalCheckOut = toLocalISODate(dateRange.to);
      }
    } else {
      const flexRange = getFlexibleDateRange(flexibleMonths);
      finalCheckIn = toLocalISODate(flexRange.from);
      finalCheckOut = toLocalISODate(flexRange.to);
    }

    if (finalCheckIn) {
      searchParams.set("checkIn", finalCheckIn);
    }
    if (finalCheckOut) {
      searchParams.set("checkOut", finalCheckOut);
    }

    const totalGuests = guests.adults + guests.children + guests.infants;
    if (totalGuests > 0 || guests.pets > 0) {
      searchParams.set("guests", totalGuests.toString());
      searchParams.set("adults", guests.adults.toString());
      searchParams.set("children", guests.children.toString());
      searchParams.set("infants", guests.infants.toString());
      if (guests.pets > 0) {
        searchParams.set("pets", guests.pets.toString());
      }
    }

    // Get current locale from pathname
    const pathParts = pathname.split("/");
    const locale = pathParts[1] || "ar";

    const searchUrl = `/${locale}/search${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    router.push(searchUrl);

    if (onClose) {
      onClose();
    }
  };

  // Per-tab field copy (mirrors airbnb.com): Experiences renames the "Where"
  // placeholder; Services swaps the third segment to "Type of service".
  const wherePlaceholder =
    activeTab === "experiences"
      ? (dict.search?.searchByCityOrLandmark ?? "Search by city or landmark")
      : (dict.search?.searchDestinations ?? "Search destinations");
  const thirdLabel = isServices
    ? (dict.search?.typeOfService ?? "Type of service")
    : (dict.search?.who ?? "Who");
  const thirdValue = isServices
    ? selectedService || (dict.search?.addService ?? "Add service")
    : getGuestDisplayText();

  return (
    <div className="relative w-full mx-auto" style={{ maxWidth: 850 }} ref={searchBarRef}>
      {/* Pill — h-[66px] via inline style because Tailwind v4 CSS scan may not
          include arbitrary-value utilities that weren't in the initial scan. */}
      <div
        style={{ height: 66 }}
        className={`flex items-center rounded-full border transition-all duration-200 ${
          activeButton
            ? "bg-[#EBEBEB] border-[#DDDDDD] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.1)_0px_8px_24px_0px]"
            : "bg-white border-[#DDDDDD] shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.1)_0px_8px_24px_0px] hover:shadow-[rgba(0,0,0,0.02)_0px_0px_0px_1px,rgba(0,0,0,0.18)_0px_8px_24px_0px]"
        }`}
      >
        {/* Where Button */}
        {activeButton === "location" ? (
          <div
            className={`flex-1 min-w-0 ps-8 pe-8 py-4 text-start cursor-default ${getButtonStyling("location")}`}
            onMouseEnter={() => setHoveredButton("location")}
            onMouseLeave={() => setHoveredButton(null)}
          >
            <ActivePill />
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
              {dict.search?.where ?? "Where"}
            </div>
            <input
              type="text"
              placeholder={wherePlaceholder}
              value={searchQuery}
              onChange={(e) => searchLocations(e.target.value)}
              /* Height/line-height set inline: the arbitrary `h-[18px]`/
                 `leading-[18px]` utilities silently fail under Turbopack, so the
                 input fell back to its default (taller) height — which enlarged
                 the active "Where" pill and pushed the label up. Pinning 18px
                 here keeps the segment the same height as When/Who. */
              style={{ display: "block", height: 18, lineHeight: "18px", fontSize: 14, padding: 0, margin: 0, boxSizing: "border-box" }}
              className="w-full bg-transparent border-0 border-none text-[#222222] placeholder-[#6a6a6a] focus:outline-none focus:ring-0 focus:border-none focus-visible:ring-0 outline-none"
              autoFocus
            />
          </div>
        ) : (
          <button
            type="button"
            className={`flex-1 min-w-0 ps-8 pe-8 py-4 text-start ${getButtonStyling("location")}`}
            onMouseEnter={() => setHoveredButton("location")}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => handleButtonClick("location")}
          >
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
              {dict.search?.where ?? "Where"}
            </div>
            <div className="text-sm leading-[18px] text-[#6a6a6a] truncate">
              {selectedLocation || wherePlaceholder}
            </div>
          </button>
        )}

        {/* Divider 1 */}
        <div
          className={`w-px h-8 bg-[#DDDDDD] transition-opacity duration-200 ${
            isLineHidden("location-dates") ? "opacity-0" : "opacity-100"
          }`}
        ></div>

        {/* When Button (combined dates) */}
        <button
          className={`flex-1 min-w-0 px-6 py-4 ${getButtonStyling("dates")}`}
          onMouseEnter={() => setHoveredButton("dates")}
          onMouseLeave={() => setHoveredButton(null)}
          onClick={() => handleButtonClick("dates")}
        >
          {activeButton === "dates" && <ActivePill />}
          <div className="text-start">
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
              {dict.search?.when ?? "When"}
            </div>
            <div className="text-sm leading-[18px] text-[#6a6a6a]">{getDatesDisplayText()}</div>
          </div>
        </button>

        {/* Divider 2 */}
        <div
          className={`w-px h-8 bg-[#DDDDDD] transition-opacity duration-200 ${
            isLineHidden("dates-guests") ? "opacity-0" : "opacity-100"
          }`}
        ></div>

        {/* Guests / Type-of-service segment + Search Button Container.
            The search button stays INSIDE this container (unchanged). Only the
            label/value are tab-driven (Who/guests, or "Type of service" on the
            Services tab). */}
        <div
          className={`flex-[1.15] min-w-0 flex items-center ${getButtonStyling("guests")}`}
          onMouseEnter={() => setHoveredButton("guests")}
          onMouseLeave={() => setHoveredButton(null)}
        >
          {activeButton === "guests" && <ActivePill />}
          {/* Guests / service button */}
          <div
            className="flex-1 px-6 py-4 text-start"
            onClick={() => handleButtonClick("guests")}
          >
            <div style={{ fontSize: 12, fontWeight: 500, lineHeight: '16px', color: '#222222', marginBottom: 2 }} className="whitespace-nowrap">
              {thirdLabel}
            </div>
            <div className="text-sm leading-[18px] text-[#6a6a6a] truncate">{thirdValue}</div>
          </div>

          {/* Search Button. 48×48px circle; expands with label when a segment
              is active. Airbnb fill #FF385C, hover #E31C5F (their "Rausch"
              red, matching the app's menu-pages/auth CTAs). */}
          <div className="pe-2.5">
            <Button
              onClick={handleSearch}
              size="icon"
              className={`rounded-full bg-[#FF385C] hover:bg-[#E31C5F] text-white h-12 transition-[width,padding] duration-300 ${
                activeButton ? "w-28 px-4" : "w-12"
              }`}
            >
              <Search className="w-4 h-4" />
              {activeButton && (
                <span className="ms-2 text-sm font-medium">{dict.search?.searchButton ?? "Search"}</span>
              )}
              <span className="sr-only">{dict.search?.searchButton ?? "Search"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Dropdown — ONE container that re-anchors between segments
          (Where↔When↔Who). It only enters/exits (fade + rise) on the first
          open and the full close; while open it stays mounted and, on a
          segment switch, SNAPS instantly to the new position/width and swaps
          content — mirroring real Airbnb, whose panel has no between-segment
          transition. `layout` is kept so the snap is measured cleanly, but its
          transition is instant (SWITCH_TRANSITION); `popLayout` still keeps the
          outgoing panel from fighting the incoming one for height during the
          (instant) swap. */}
      <AnimatePresence>
        {activeButton && (
          <motion.div
            key="search-dropdown"
            layout
            initial={dropdownMotion.initial}
            animate={dropdownMotion.animate}
            exit={dropdownMotion.exit}
            transition={{ ...DROPDOWN_TRANSITION, layout: SWITCH_TRANSITION }}
            style={{
              transformOrigin: "top center",
              willChange: "transform, opacity",
              // Experiences/Services "When" panel is CENTERED under the bar — the
              // "When" segment is the bar's midpoint, and airbnb.com/experiences
              // hangs this panel centered (cx≈bar centre), not left-anchored.
              // Centred via inline left+marginLeft, NOT a `-translate-x-1/2`
              // class: this is a Framer motion.div and Framer owns `transform`
              // (it animates y/scale), so a translate utility would be clobbered.
              // left:50% + marginLeft -300 (half the 600px width) lands the
              // centre on the bar centre in BOTH LTR and RTL (the midpoint is
              // direction-agnostic), which also fixes the RTL mirror.
              ...(activeButton === "dates" && usesActivityDatePicker
                ? { left: "50%", marginLeft: -300 }
                : {}),
            }}
            className={`absolute top-full mt-3 bg-white rounded-[32px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 z-10 overflow-hidden ${
              activeButton === "location"
                ? "start-0 w-[420px] max-w-[calc(100vw-2rem)] p-6"
                : activeButton === "dates"
                  ? // Experiences/Services: 600px panel centred under the bar
                    // (positioning via the inline left+marginLeft above). Homes:
                    // full-width two-month, anchored across the bar.
                    usesActivityDatePicker
                    ? "w-[600px] max-w-[calc(100vw-2rem)] p-6"
                    : "inset-x-0 w-full p-8"
                  : // Third segment: Services type-of-service is a wide pill grid;
                    // Homes/Experiences guests panel stays narrow + end-anchored.
                    isServices
                    ? "end-0 w-[560px] max-w-[calc(100vw-2rem)] p-6"
                    : "end-0 w-[394px] p-6"
            }`}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={activeButton}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SWITCH_FADE}
              >
                {activeButton === "location" && (
                  <LocationDropdown
                    searchQuery={searchQuery}
                    suggestions={suggestions}
                    popularLocations={popularLocations}
                    isLoading={isLoadingLocations}
                    error={locationError}
                    onSearchQueryChange={searchLocations}
                    onLocationSelect={handleLocationSelect}
                  />
                )}
                {activeButton === "dates" &&
                  (usesActivityDatePicker ? (
                    <ExperiencesDatePicker
                      dateRange={dateRange}
                      onDateChange={handleDateChange}
                    />
                  ) : (
                    <BigSearchDatePicker
                      dateRange={dateRange}
                      onDateChange={handleDateChange}
                      searchMode={searchMode}
                      setSearchMode={setSearchMode}
                      flexibleDuration={flexibleDuration}
                      setFlexibleDuration={setFlexibleDuration}
                      flexibleMonths={flexibleMonths}
                      setFlexibleMonths={setFlexibleMonths}
                      dateFlexibility={dateFlexibility}
                      setDateFlexibility={setDateFlexibility}
                    />
                  ))}
                {activeButton === "guests" && (
                  isServices ? (
                    <ServiceTypeDropdown
                      selected={selectedService}
                      locale={locale === "ar" ? "ar" : "en"}
                      onSelect={(label) => {
                        setSelectedService(label);
                        setActiveButton(null);
                      }}
                    />
                  ) : (
                    <GuestSelectorDropdown
                      guests={guests}
                      onGuestChange={handleGuestChange}
                      hidePets={isExperiences}
                    />
                  )
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
