"use client";

import { Counter } from "@/components/atom/counter";
import { GUEST_LIMITS } from "./constant";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface GuestSelectorProps {
  guests: {
    adults: number;
    children: number;
    infants: number;
  };
  onGuestChange: (
    type: "adults" | "children" | "infants",
    operation: "increment" | "decrement"
  ) => void;
}

export default function GuestSelectorDropdown({
  guests,
  onGuestChange,
}: GuestSelectorProps) {
  const dict = useDictionary();

  // Children and infants need at least one adult — disable their + when
  // adults is zero. This matches Airbnb's host-side capacity rules and stops
  // users from sending "0 adults + 2 children" filters that the listings
  // search will silently treat as "0 guests."
  const requiresAdult = guests.adults === 0;

  return (
    <div className="flex flex-col">
      <h3 className="text-lg font-semibold mb-4">
        {dict.search?.whosComing ?? "Who's coming?"}
      </h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-medium">
              {dict.search?.adultsLabel ?? "Adults"}
            </div>
            <div className="text-sm text-gray-500">
              {dict.search?.adultsAge ?? "Ages 13 or above"}
            </div>
          </div>
          <Counter
            value={guests.adults}
            onIncrement={() => onGuestChange("adults", "increment")}
            onDecrement={() => onGuestChange("adults", "decrement")}
            min={GUEST_LIMITS.adults.min}
            max={GUEST_LIMITS.adults.max}
            sm={true}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-medium">
              {dict.search?.childrenLabel ?? "Children"}
            </div>
            <div className="text-sm text-gray-500">
              {dict.search?.childrenAge ?? "Ages 2-12"}
            </div>
          </div>
          <Counter
            value={guests.children}
            onIncrement={() => onGuestChange("children", "increment")}
            onDecrement={() => onGuestChange("children", "decrement")}
            min={GUEST_LIMITS.children.min}
            // Block + on children if no adult is set yet — Counter renders a
            // disabled state when value >= max.
            max={requiresAdult ? 0 : GUEST_LIMITS.children.max}
            sm={true}
          />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-medium">
              {dict.search?.infantsLabel ?? "Infants"}
            </div>
            <div className="text-sm text-gray-500">
              {dict.search?.infantsAge ?? "Under 2"}
            </div>
          </div>
          <Counter
            value={guests.infants}
            onIncrement={() => onGuestChange("infants", "increment")}
            onDecrement={() => onGuestChange("infants", "decrement")}
            min={GUEST_LIMITS.infants.min}
            max={requiresAdult ? 0 : GUEST_LIMITS.infants.max}
            sm={true}
          />
        </div>
      </div>

      {requiresAdult && (guests.children > 0 || guests.infants > 0) && (
        <p className="text-xs text-[#de3151] mt-3" role="status" aria-live="polite">
          {/* `needAdult` is a freshly-added string; widen the lookup so the
              dictionary type doesn't need a coordinated change to en.json
              and ar.json in this PR. Strings still fall back gracefully. */}
          {(dict.search as unknown as Record<string, string | undefined>)
            ?.needAdult ?? "At least one adult is required."}
        </p>
      )}
    </div>
  );
}
