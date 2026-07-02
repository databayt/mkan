"use client"

import React from 'react'
import { Minus, Plus } from 'lucide-react'

interface CounterProps {
  value: number
  onIncrement: () => void
  onDecrement: () => void
  min?: number
  max?: number
  step?: number
  sm?: boolean
}

// Memoized + touch-action: manipulation — same tap-delay fix as the search
// guest counter; a stepper must react on the very first tap.
export const Counter = React.memo(function Counter({
  value,
  onIncrement,
  onDecrement,
  min = 0,
  max = 100,
  step = 1,
  sm = false,
}: CounterProps) {
  const isDecrementDisabled = value <= min
  const isIncrementDisabled = value >= max

  return (
    <div className={`flex items-center ${sm ? 'gap-2' : 'gap-3 sm:gap-4'}`}>
      <button
        type="button"
        onClick={onDecrement}
        disabled={isDecrementDisabled}
        style={{ touchAction: 'manipulation' }}
        className={`
          ${sm 
            ? 'w-8 h-8 min-h-[32px]' 
            : 'w-12 h-12 sm:w-10 sm:h-10 min-h-[48px] sm:min-h-[40px]'
          } rounded-full border flex items-center justify-center transition-colors
          ${isDecrementDisabled
            ? 'border-muted text-muted-foreground cursor-not-allowed'
            : 'border-muted-foreground text-muted-foreground hover:border-foreground hover:text-foreground active:scale-95'
          }
        `}
      >
        <Minus size={sm ? 14 : 18} strokeWidth={2} className={sm ? 'w-3.5 h-3.5' : 'sm:w-4 sm:h-4'} />
      </button>

      <span className={`${sm ? 'w-8 text-sm' : 'w-12 sm:w-16 text-lg sm:text-xl'} text-center font-medium`}>
        {value}
      </span>

      <button
        type="button"
        onClick={onIncrement}
        disabled={isIncrementDisabled}
        style={{ touchAction: 'manipulation' }}
        className={`
          ${sm 
            ? 'w-8 h-8 min-h-[32px]' 
            : 'w-12 h-12 sm:w-10 sm:h-10 min-h-[48px] sm:min-h-[40px]'
          } rounded-full border flex items-center justify-center transition-colors
          ${isIncrementDisabled
            ? 'border-muted text-muted-foreground cursor-not-allowed'
            : 'border-muted-foreground text-muted-foreground hover:border-foreground hover:text-foreground active:scale-95'
          }
        `}
      >
        <Plus size={sm ? 14 : 18} strokeWidth={2} className={sm ? 'w-3.5 h-3.5' : 'sm:w-4 sm:h-4'} />
      </button>
    </div>
  )
})