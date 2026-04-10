"use client"

import { Counter } from "@/components/atom/counter"
import { GUEST_LIMITS } from "./constant"
import { useDictionary } from "@/components/internationalization/dictionary-context"

interface GuestSelectorProps {
  guests: {
    adults: number
    children: number
    infants: number
  }
  onGuestChange: (type: 'adults' | 'children' | 'infants', operation: 'increment' | 'decrement') => void
}

export default function GuestSelectorDropdown({
  guests,
  onGuestChange
}: GuestSelectorProps) {
  const dict = useDictionary()

  return (
    <>
      <h3 className="text-lg font-semibold mb-4">{dict.search?.whosComing ?? "Who's coming?"}</h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{dict.search?.adultsLabel ?? "Adults"}</div>
            <div className="text-sm text-gray-500">{dict.search?.adultsAge ?? "Ages 13 or above"}</div>
          </div>
          <Counter
            value={guests.adults}
            onIncrement={() => onGuestChange('adults', 'increment')}
            onDecrement={() => onGuestChange('adults', 'decrement')}
            min={GUEST_LIMITS.adults.min}
            max={GUEST_LIMITS.adults.max}
            sm={true}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{dict.search?.childrenLabel ?? "Children"}</div>
            <div className="text-sm text-gray-500">{dict.search?.childrenAge ?? "Ages 2-12"}</div>
          </div>
          <Counter
            value={guests.children}
            onIncrement={() => onGuestChange('children', 'increment')}
            onDecrement={() => onGuestChange('children', 'decrement')}
            min={GUEST_LIMITS.children.min}
            max={GUEST_LIMITS.children.max}
            sm={true}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">{dict.search?.infantsLabel ?? "Infants"}</div>
            <div className="text-sm text-gray-500">{dict.search?.infantsAge ?? "Under 2"}</div>
          </div>
          <Counter
            value={guests.infants}
            onIncrement={() => onGuestChange('infants', 'increment')}
            onDecrement={() => onGuestChange('infants', 'decrement')}
            min={GUEST_LIMITS.infants.min}
            max={GUEST_LIMITS.infants.max}
            sm={true}
          />
        </div>
      </div>
    </>
  )
} 