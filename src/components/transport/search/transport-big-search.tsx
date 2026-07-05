"use client";

import { Search, ArrowUpDown, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Counter } from "@/components/atom/counter";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import TransportCityDropdown from "./transport-city-dropdown";
import TransportDatePicker from "./transport-date-picker";
import { MOBILE_BREAKPOINT } from "@/components/template/search/constant";
import { isRTL as checkRTL, type Locale } from "@/components/internationalization/config";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { cityLabel } from "@/components/transport/city-names";

// Transport hero search — mirrors the homepage hero card (VerticalSearch): a
// left-anchored white card that carries the title inside it, with stacked
// fields and a red Search pill. Adapted for buses: the location pair is a
// joined From/To with a swap circle on the seam, and "Guests" becomes a
// Passengers stepper (adults + children → the `seats` search filter).
//
// Two layouts, same as the homepage:
//   • Desktop (≥md): the card stays put and each field opens a panel that
//     floats beside it.
//   • Mobile (<md): a fixed-height card whose BODY switches to the active
//     step (Where / When / Who) in place — no dropdown drops below the fields.
//     Floating prev/next arrows sit at the top and the Search pill floats at
//     the bottom, exactly like the homepage mobile flow.

type ActiveButton = "origin" | "destination" | "date" | "passengers" | null;

// Step order the mobile prev/next arrows walk.
const STEP_ORDER = ["origin", "destination", "date", "passengers"] as const;

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  city: string;
}

interface Passengers {
  adults: number;
  children: number;
}

interface TransportSearchDictionary {
  title: string;
  where: string;
  from: string;
  to: string;
  when: string;
  date: string;
  search: string;
  selectCity: string;
  selectDate: string;
  swap: string;
  passengers: string;
  addPassengers: string;
  adults: string;
  adultsAge: string;
  children: string;
  childrenAge: string;
  passenger: string;
  passengersPlural: string;
}

interface TransportBigSearchProps {
  assemblyPoints?: AssemblyPoint[];
  dictionary?: TransportSearchDictionary;
  initialOrigin?: string;
  initialDestination?: string;
  initialDate?: Date;
  lang?: string;
}

const DEFAULT_DICTIONARY: TransportSearchDictionary = {
  title: "Travel Between\nCities in Sudan",
  where: "Where",
  from: "From",
  to: "To",
  when: "When",
  date: "Travel Date",
  search: "Search",
  selectCity: "Add city",
  selectDate: "Add date",
  swap: "Swap cities",
  passengers: "Passengers",
  addPassengers: "Add passengers",
  adults: "Adults",
  adultsAge: "Ages 13+",
  children: "Children",
  childrenAge: "Ages 2–12",
  passenger: "passenger",
  passengersPlural: "passengers",
};

// Compact adults/children stepper — the transport equivalent of the homepage
// GuestSelector. Two rows only (no infants/pets); each row uses the shared
// Counter atom in its small variant so it fits the narrow card / side panel.
function PassengerSelector({
  passengers,
  onChange,
  dict,
}: {
  passengers: Passengers;
  onChange: (type: keyof Passengers, op: "increment" | "decrement") => void;
  dict: TransportSearchDictionary;
}) {
  // A child can't travel without an adult, so the adults minus is floored at 1
  // while any children are selected (mirrors the homepage guest rule).
  const minAdults = passengers.children > 0 ? 1 : 0;
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between py-4 border-b border-[#f0f0f0] first:pt-0">
        <div>
          <div className="font-semibold text-[15px] text-[#222222] leading-5">{dict.adults}</div>
          <div className="text-sm text-muted-foreground font-normal mt-0.5">{dict.adultsAge}</div>
        </div>
        <Counter
          value={passengers.adults}
          onIncrement={() => onChange("adults", "increment")}
          onDecrement={() => onChange("adults", "decrement")}
          min={minAdults}
          max={9}
          sm
        />
      </div>
      <div className="flex items-center justify-between py-4 last:pb-0">
        <div>
          <div className="font-semibold text-[15px] text-[#222222] leading-5">{dict.children}</div>
          <div className="text-sm text-muted-foreground font-normal mt-0.5">{dict.childrenAge}</div>
        </div>
        <Counter
          value={passengers.children}
          onIncrement={() => onChange("children", "increment")}
          onDecrement={() => onChange("children", "decrement")}
          min={0}
          max={9}
          sm
        />
      </div>
    </div>
  );
}

export default function TransportBigSearch({
  assemblyPoints = [],
  dictionary = DEFAULT_DICTIONARY,
  initialOrigin = "",
  initialDestination = "",
  initialDate,
  lang = "ar",
}: TransportBigSearchProps) {
  const router = useRouter();
  const dict = useDictionary();
  const isRTL = checkRTL(lang as Locale);
  const [activeButton, setActiveButton] = useState<ActiveButton>(null);
  const [isMobile, setIsMobile] = useState(false);
  const searchBarRef = useRef<HTMLDivElement>(null);

  // Form state
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [date, setDate] = useState<Date | undefined>(initialDate);
  const [passengers, setPassengers] = useState<Passengers>({ adults: 0, children: 0 });

  // Track viewport so mobile gets the in-place step flow and desktop the
  // beside-the-card panels (same split as the homepage VerticalSearch).
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleButtonClick = (button: ActiveButton) => {
    setActiveButton(activeButton === button ? null : button);
  };

  const handleOriginSelect = (city: string) => {
    setOrigin(city);
    setActiveButton("destination");
  };

  const handleDestinationSelect = (city: string) => {
    setDestination(city);
    setActiveButton("date");
  };

  const handleDateChange = (selectedDate: Date | undefined) => {
    setDate(selectedDate);
    if (selectedDate) setActiveButton("passengers");
  };

  // Swap origin ⇄ destination in place (the classic From/To flip).
  const handleSwap = () => {
    setOrigin(destination);
    setDestination(origin);
  };

  const handlePassengerChange = useCallback(
    (type: keyof Passengers, op: "increment" | "decrement") => {
      setPassengers((prev) => {
        const current = prev[type];
        const next =
          op === "increment" ? Math.min(current + 1, 9) : Math.max(0, current - 1);
        const updated = { ...prev, [type]: next };
        // Adding a child requires at least one adult.
        if (op === "increment" && type === "children" && updated.adults === 0) {
          updated.adults = 1;
        }
        return updated;
      });
    },
    []
  );

  const totalPassengers = passengers.adults + passengers.children;

  const passengerText = () => {
    if (totalPassengers === 0) return dictionary.addPassengers;
    return `${totalPassengers} ${totalPassengers > 1 ? dictionary.passengersPlural : dictionary.passenger}`;
  };

  const formatDate = (d: Date | undefined) => {
    if (!d) return dictionary.selectDate;
    const locale = lang === "ar" ? "ar-SA" : "en-US";
    return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  };

  const handleSearch = () => {
    if (!origin || !destination || !date) return;

    const searchParams = new URLSearchParams();

    const resolveCity = (label: string) =>
      assemblyPoints.find(
        (p) =>
          p.city.toLowerCase() === label.toLowerCase() ||
          p.name.toLowerCase() === label.toLowerCase()
      );

    const originMatch = resolveCity(origin);
    const destinationMatch = resolveCity(destination);

    if (originMatch) searchParams.set("originId", String(originMatch.id));
    if (destinationMatch) searchParams.set("destinationId", String(destinationMatch.id));
    searchParams.set("origin", origin);
    searchParams.set("destination", destination);
    searchParams.set("date", date.toISOString().split("T")[0] ?? "");
    if (totalPassengers > 0) searchParams.set("seats", String(totalPassengers));

    router.push(`/${lang}/transport/search?${searchParams.toString()}`);
  };

  // Field surface styling — same three-state treatment as the homepage card:
  // active field turns solid white with a darker border; the rest dim to
  // gray-50 while any field is open.
  const getFieldStyling = (button: ActiveButton) => {
    const isActive = activeButton === button;
    const hasActive = activeButton !== null;
    let styleClass = "bg-transparent";
    if (isActive) styleClass = "bg-white !border-gray-400";
    else if (hasActive) styleClass = "bg-gray-50";
    return `${styleClass} transition-all duration-200`;
  };

  // ── Mobile step navigation (prev/next arrows) ─────────────────────────────
  const step = activeButton ? STEP_ORDER.indexOf(activeButton) : -1;
  const goPrev = () => {
    const prev = step > 0 ? STEP_ORDER[step - 1] : undefined;
    if (prev) setActiveButton(prev);
  };
  const goNext = () => {
    const next = step >= 0 && step < STEP_ORDER.length - 1 ? STEP_ORDER[step + 1] : undefined;
    if (next) setActiveButton(next);
  };

  // Click outside to close the active field. The side/inline dropdowns live
  // inside this ref, so selecting within them is not treated as "outside".
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(event.target as Node)) {
        setActiveButton(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canSearch = Boolean(origin && destination && date);

  // The stacked From / To / Date / Passengers fields — shared by the desktop
  // card and the mobile idle screen.
  const renderFieldStack = () => (
    <div className="space-y-4 md:space-y-3">
      {/* Where — From / To joined vertical pair (styled like the homepage
          check-in/check-out fields, stacked instead of side-by-side) with a
          swap circle straddling the seam. In-field labels keep the swap from
          colliding with a stacked label row. */}
      <div>
        <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
          {dictionary.where}
        </Label>
        <div className="relative">
          <button
            type="button"
            onClick={() => handleButtonClick("origin")}
            className={`w-full h-14 text-start px-3 border border-gray-300 rounded-t-xs ${getFieldStyling("origin")}`}
          >
            <span className="block text-[11px] font-medium text-[#6b6b6b] leading-none">
              {dictionary.from}
            </span>
            <span className={`block text-sm mt-1 truncate ${origin ? "text-black" : "text-[#c0c0c0]"}`}>
              {origin ? cityLabel(origin, lang) : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleButtonClick("destination")}
            className={`w-full h-14 text-start px-3 border border-gray-300 border-t-0 rounded-b-xs ${getFieldStyling("destination")}`}
          >
            <span className="block text-[11px] font-medium text-[#6b6b6b] leading-none">
              {dictionary.to}
            </span>
            <span className={`block text-sm mt-1 truncate ${destination ? "text-black" : "text-[#c0c0c0]"}`}>
              {destination ? cityLabel(destination, lang) : ""}
            </span>
          </button>
          {/* Swap circle — pinned to the trailing edge, centered on the seam. */}
          <button
            type="button"
            onClick={handleSwap}
            aria-label={dictionary.swap}
            title={dictionary.swap}
            className="absolute end-3 top-1/2 -translate-y-1/2 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-300 bg-white text-[#484848] shadow-sm transition-colors hover:border-gray-500 hover:text-black active:scale-95"
          >
            <ArrowUpDown className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* When */}
      <div>
        <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
          {dictionary.when}
        </Label>
        <button
          type="button"
          onClick={() => handleButtonClick("date")}
          className={`w-full h-14 md:h-12 text-start px-3 border border-gray-300 rounded-xs ${getFieldStyling("date")}`}
        >
          <span
            className={`text-sm ${date ? "text-black" : "text-[#c0c0c0]"}`}
            dir={isRTL ? "rtl" : "ltr"}
          >
            {formatDate(date)}
          </span>
        </button>
      </div>

      {/* Passengers */}
      <div>
        <Label className="text-[11px] font-medium text-[#6b6b6b] mb-1 block">
          {dictionary.passengers}
        </Label>
        <button
          type="button"
          onClick={() => handleButtonClick("passengers")}
          className={`w-full h-14 md:h-12 text-start px-3 border border-gray-300 rounded-xs ${getFieldStyling("passengers")}`}
        >
          <span className={`text-sm ${totalPassengers > 0 ? "text-black" : "text-[#c0c0c0]"}`}>
            {passengerText()}
          </span>
        </button>
      </div>
    </div>
  );

  // ── Mobile: fixed-height card with in-place steps ─────────────────────────
  if (isMobile) {
    return (
      <div className="relative w-full" ref={searchBarRef}>
        <div
          className="relative bg-white w-full overflow-hidden shadow-sm"
          // Constant height across idle + every step so the card never grows
          // when a step opens (inline so Turbopack can't drop it as a brand-new
          // arbitrary utility from its dev scan).
          style={{ height: "min(78vh, 560px)" }}
        >
          {/* Body — swaps by step; the floating arrows (top) and Search pill
              (bottom) overlay every state. pt clears the arrows, pb the pill. */}
          {!activeButton ? (
            <div className="h-full overflow-y-auto no-scrollbar px-5 pt-8 pb-24">
              <h1 className="text-2xl font-semibold text-[#484848] mb-6 leading-snug whitespace-pre-line">
                {dictionary.title}
              </h1>
              {renderFieldStack()}
            </div>
          ) : activeButton === "origin" || activeButton === "destination" ? (
            <div className="h-full overflow-y-auto no-scrollbar px-5 pt-16 pb-24">
              <TransportCityDropdown
                value={activeButton === "origin" ? origin : destination}
                onChange={activeButton === "origin" ? handleOriginSelect : handleDestinationSelect}
                assemblyPoints={assemblyPoints}
              />
            </div>
          ) : activeButton === "date" ? (
            <div className="h-full overflow-y-auto no-scrollbar px-5 pt-16 pb-24 flex justify-center">
              <TransportDatePicker date={date} onDateChange={handleDateChange} />
            </div>
          ) : (
            <div className="h-full overflow-y-auto no-scrollbar px-5 pt-16 pb-24">
              <PassengerSelector passengers={passengers} onChange={handlePassengerChange} dict={dictionary} />
            </div>
          )}

          {/* Floating step arrows (active only) — plain line arrows that walk
              Where → When → Who, matching the homepage mobile flow. */}
          {activeButton && (
            <div className="absolute top-5 start-4 z-30 flex items-center gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={step <= 0}
                aria-label={dict?.common?.back ?? "Back"}
                className="flex h-7 w-7 items-center justify-center text-[#222222] transition-opacity hover:opacity-60 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <ArrowLeft className={`h-5 w-5 ${isRTL ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={step >= STEP_ORDER.length - 1}
                aria-label={dict?.common?.next ?? "Next"}
                className="flex h-7 w-7 items-center justify-center text-[#222222] transition-opacity hover:opacity-60 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <ArrowRight className={`h-5 w-5 ${isRTL ? "rotate-180" : ""}`} strokeWidth={2} />
              </button>
            </div>
          )}

          {/* Floating Search pill — pinned bottom-end, on top of the body, so
              it stays reachable in every step. */}
          <Button
            onClick={handleSearch}
            disabled={!canSearch}
            style={{ paddingInline: 28 }}
            className="absolute bottom-5 end-4 z-30 h-12 gap-2 rounded-full text-sm font-semibold bg-[#de3151] hover:bg-[#de3151]/90 text-white shadow-[0_6px_20px_rgba(222,49,81,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Search className="h-4 w-4" strokeWidth={2.5} />
            {dictionary.search}
          </Button>
        </div>
      </div>
    );
  }

  // ── Desktop: the card stays put; each field opens a panel beside it ───────
  return (
    <div className="relative w-full md:w-[340px]" ref={searchBarRef}>
      <div className="relative bg-white shadow-sm px-5 pt-4 pb-20 w-full">
        {/* Title within the form — homepage hero pattern. */}
        <h1 className="text-xl font-medium text-[#6b6b6b] mb-3 leading-tight whitespace-pre-line">
          {dictionary.title}
        </h1>

        {renderFieldStack()}

        {/* Floating Search pill — same style as the mobile flow (rounded-full,
            drop shadow, Search icon) pinned to the card's bottom-end. */}
        <Button
          onClick={handleSearch}
          disabled={!canSearch}
          style={{ paddingInline: 24 }}
          className="absolute bottom-4 end-4 z-30 h-11 gap-2 rounded-full text-sm font-semibold bg-[#de3151] hover:bg-[#de3151]/90 text-white shadow-[0_6px_20px_rgba(222,49,81,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="h-4 w-4" strokeWidth={2.5} />
          {dictionary.search}
        </Button>
      </div>

      {/* Side dropdowns — float to the trailing side of the card, same as the
          homepage hero. */}
      {activeButton === "origin" && (
        <div className="absolute top-0 start-full ms-4 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-[24px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 p-4 z-50">
          <TransportCityDropdown
            value={origin}
            onChange={handleOriginSelect}
            assemblyPoints={assemblyPoints}
          />
        </div>
      )}
      {activeButton === "destination" && (
        <div className="absolute top-0 start-full ms-4 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-[24px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 p-4 z-50">
          <TransportCityDropdown
            value={destination}
            onChange={handleDestinationSelect}
            assemblyPoints={assemblyPoints}
          />
        </div>
      )}
      {activeButton === "date" && (
        <div className="absolute top-0 start-full ms-4 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-[24px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 p-5 z-50">
          <TransportDatePicker date={date} onDateChange={handleDateChange} />
        </div>
      )}
      {activeButton === "passengers" && (
        <div className="absolute top-0 start-full ms-4 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-[24px] shadow-[rgba(0,0,0,0.15)_0px_10px_37px] border border-gray-200/50 p-6 z-50">
          <PassengerSelector passengers={passengers} onChange={handlePassengerChange} dict={dictionary} />
        </div>
      )}
    </div>
  );
}
