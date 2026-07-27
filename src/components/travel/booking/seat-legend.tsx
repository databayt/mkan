'use client';

import { useDictionary } from '@/components/internationalization/dictionary-context';
import { cn } from '@/lib/utils';
import {
  BLOCKED_HATCH,
  SEAT_LEGEND_ORDER,
  SEAT_STATE_STYLES,
  type SeatState,
} from './seat-styles';

/** `SeatStatus` value carrying each state's rider-facing word. */
const LEGEND_LABEL_KEY = {
  available: 'Available',
  selected: 'Selected',
  reserved: 'Reserved',
  booked: 'Booked',
  blocked: 'Blocked',
} as const;

const LEGEND_FALLBACK = {
  available: 'Available',
  selected: 'Selected',
  reserved: 'On hold',
  booked: 'Booked',
  blocked: 'Not available',
} as const;

interface SeatLegendProps {
  /** States present in this cabin. Ordered by the picker via SEAT_LEGEND_ORDER. */
  states: readonly SeatState[];
}

export function SeatLegend({ states }: SeatLegendProps) {
  const dict = useDictionary();
  const ts = dict?.travel?.seat;
  const statusLabels = ts?.status as Partial<Record<string, string>> | undefined;

  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {states.map((state) => {
        const style = SEAT_STATE_STYLES[state];
        // "Selected" is a client-only state, so it has no SeatStatus label.
        const label =
          state === 'selected'
            ? (ts?.selected ?? LEGEND_FALLBACK.selected)
            : (statusLabels?.[LEGEND_LABEL_KEY[state]] ?? LEGEND_FALLBACK[state]);

        return (
          <li key={state} className="flex items-center gap-2">
            <span
              className={cn('relative h-4 w-4 overflow-hidden rounded-sm border-2', style.body)}
              aria-hidden="true"
            >
              {state === 'blocked' && (
                <span className="absolute inset-0" style={BLOCKED_HATCH} />
              )}
            </span>
            <span className="text-xs text-muted-foreground">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
