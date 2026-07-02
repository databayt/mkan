"use client"

import * as React from "react"
import { Minus, Plus } from "lucide-react"
import { GUEST_LIMITS } from "./constant"
import { useDictionary } from "@/components/internationalization/dictionary-context"

interface GuestSelectorProps {
  guests: {
    adults: number
    children: number
    infants: number
    pets?: number
  }
  onGuestChange: (
    type: "adults" | "children" | "infants" | "pets",
    operation: "increment" | "decrement"
  ) => void
  // Experiences hides the Pets row (airbnb.com/experiences "Who" only offers
  // Adults / Children / Infants); Homes keeps it.
  hidePets?: boolean
}

interface GuestCounterProps {
  value: number
  onIncrement: () => void
  onDecrement: () => void
  min: number
  max: number
}

// Memoized so a click on one row never re-renders the other three.
// touch-action: manipulation removes the mobile double-tap-zoom delay that
// made every +/- feel ~300ms late; transitions are scoped to colors only so
// the browser never animates layout on tap.
const GuestCounter = React.memo(function GuestCounter({
  value,
  onIncrement,
  onDecrement,
  min,
  max,
}: GuestCounterProps) {
  const isDecrementDisabled = value <= min
  const isIncrementDisabled = value >= max

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onDecrement}
        disabled={isDecrementDisabled}
        style={{ touchAction: "manipulation" }}
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors select-none ${
          isDecrementDisabled
            ? "border-[#ebebeb] text-[#ebebeb] cursor-not-allowed"
            : "border-[#b0b0b0] text-[#717171] hover:border-[#222222] hover:text-[#222222] active:scale-95"
        }`}
      >
        <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>

      <span className="w-6 text-center text-base text-[#222222] font-normal select-none tabular-nums">
        {value}
      </span>

      <button
        type="button"
        onClick={onIncrement}
        disabled={isIncrementDisabled}
        style={{ touchAction: "manipulation" }}
        className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors select-none ${
          isIncrementDisabled
            ? "border-[#ebebeb] text-[#ebebeb] cursor-not-allowed"
            : "border-[#b0b0b0] text-[#717171] hover:border-[#222222] hover:text-[#222222] active:scale-95"
        }`}
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
    </div>
  )
})

function GuestSelectorDropdown({
  guests,
  onGuestChange,
  hidePets = false,
}: GuestSelectorProps) {
  const dict = useDictionary()

  const currentPets = guests.pets ?? 0

  // Airbnb rule: if there are children, infants, or pets, we must have at least 1 adult.
  // So the minus button for adults is disabled if adults is 1 and any other count > 0.
  const hasOtherGuests = guests.children > 0 || guests.infants > 0 || currentPets > 0
  const minAdults = hasOtherGuests ? 1 : 0

  // Stable per-row handlers so the memoized counters skip re-rendering rows
  // whose value didn't change.
  const incAdults = React.useCallback(() => onGuestChange("adults", "increment"), [onGuestChange])
  const decAdults = React.useCallback(() => onGuestChange("adults", "decrement"), [onGuestChange])
  const incChildren = React.useCallback(() => onGuestChange("children", "increment"), [onGuestChange])
  const decChildren = React.useCallback(() => onGuestChange("children", "decrement"), [onGuestChange])
  const incInfants = React.useCallback(() => onGuestChange("infants", "increment"), [onGuestChange])
  const decInfants = React.useCallback(() => onGuestChange("infants", "decrement"), [onGuestChange])
  const incPets = React.useCallback(() => onGuestChange("pets", "increment"), [onGuestChange])
  const decPets = React.useCallback(() => onGuestChange("pets", "decrement"), [onGuestChange])

  return (
    <div className="flex flex-col">
      {/* Adults Row */}
      <div className="flex items-center justify-between py-6 border-b border-[#f0f0f0] first:pt-0">
        <div>
          <div className="font-semibold text-[16px] text-[#222222] leading-5">
            {dict.search?.adultsLabel ?? "Adults"}
          </div>
          <div className="text-sm text-muted-foreground font-normal mt-1 leading-[18px]">
            {dict.search?.adultsAge ?? "Ages 13 or above"}
          </div>
        </div>
        <GuestCounter
          value={guests.adults}
          onIncrement={incAdults}
          onDecrement={decAdults}
          min={minAdults}
          max={GUEST_LIMITS.adults.max}
        />
      </div>

      {/* Children Row */}
      <div className="flex items-center justify-between py-6 border-b border-[#f0f0f0]">
        <div>
          <div className="font-semibold text-[16px] text-[#222222] leading-5">
            {dict.search?.childrenLabel ?? "Children"}
          </div>
          <div className="text-sm text-muted-foreground font-normal mt-1 leading-[18px]">
            {dict.search?.childrenAge ?? "Ages 2–12"}
          </div>
        </div>
        <GuestCounter
          value={guests.children}
          onIncrement={incChildren}
          onDecrement={decChildren}
          min={GUEST_LIMITS.children.min}
          max={GUEST_LIMITS.children.max}
        />
      </div>

      {/* Infants Row — last row (no border) when Pets is hidden (Experiences). */}
      <div
        className={`flex items-center justify-between py-6 ${
          hidePets ? "last:pb-0" : "border-b border-[#f0f0f0]"
        }`}
      >
        <div>
          <div className="font-semibold text-[16px] text-[#222222] leading-5">
            {dict.search?.infantsLabel ?? "Infants"}
          </div>
          <div className="text-sm text-muted-foreground font-normal mt-1 leading-[18px]">
            {dict.search?.infantsAge ?? "Under 2"}
          </div>
        </div>
        <GuestCounter
          value={guests.infants}
          onIncrement={incInfants}
          onDecrement={decInfants}
          min={GUEST_LIMITS.infants.min}
          max={GUEST_LIMITS.infants.max}
        />
      </div>

      {/* Pets Row — hidden on the Experiences tab. */}
      {!hidePets && (
      <div className="flex items-center justify-between py-6 last:pb-0">
        <div>
          <div className="font-semibold text-[16px] text-[#222222] leading-5">
            {dict.search?.petsLabel ?? "Pets"}
          </div>
          <div className="mt-1 leading-[18px]">
            <a
              href="https://www.airbnb.com/help/article/1869"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-muted-foreground underline hover:text-black font-normal transition-colors"
            >
              {dict.search?.petsAge ?? "Bringing a service animal?"}
            </a>
          </div>
        </div>
        <GuestCounter
          value={currentPets}
          onIncrement={incPets}
          onDecrement={decPets}
          min={GUEST_LIMITS.pets.min}
          max={GUEST_LIMITS.pets.max}
        />
      </div>
      )}
    </div>
  )
}

export default React.memo(GuestSelectorDropdown)
