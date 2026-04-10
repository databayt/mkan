"use client"

import { Counter } from "@/components/atom/counter"

interface GuestData {
  adults: number
  children: number
  infants: number
}

interface GuestSelectorProps {
  guests: GuestData
  onGuestChange: (type: 'adults' | 'children' | 'infants', operation: 'increment' | 'decrement') => void
  className?: string
}

export default function GuestSelector({
  guests,
  onGuestChange,
  className
}: GuestSelectorProps) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Adults</div>
          <div className="text-sm text-gray-500">Ages 13 or above</div>
        </div>
        <Counter
          value={guests.adults}
          onIncrement={() => onGuestChange('adults', 'increment')}
          onDecrement={() => onGuestChange('adults', 'decrement')}
          min={0}
          max={16}
        />
      </div>
      
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Children</div>
          <div className="text-sm text-gray-500">Ages 2-12</div>
        </div>
        <Counter
          value={guests.children}
          onIncrement={() => onGuestChange('children', 'increment')}
          onDecrement={() => onGuestChange('children', 'decrement')}
          min={0}
          max={10}
        />
      </div>
      
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">Infants</div>
          <div className="text-sm text-gray-500">Under 2</div>
        </div>
        <Counter
          value={guests.infants}
          onIncrement={() => onGuestChange('infants', 'increment')}
          onDecrement={() => onGuestChange('infants', 'decrement')}
          min={0}
          max={5}
        />
      </div>
    </div>
  )
} 