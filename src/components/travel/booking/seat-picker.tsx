'use client';

import {
  Fragment,
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { DoorOpen, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { formatNumber } from '@/lib/i18n/formatters';
import { SeatLegend } from './seat-legend';
import {
  BLOCKED_HATCH,
  SEAT_LEGEND_ORDER,
  SEAT_STATE_STYLES,
  aisleAfterColumn,
  type SeatState,
} from './seat-styles';

interface Seat {
  id: number;
  seatNumber: string;
  row: number;
  column: number;
  seatType: string | null;
  status: 'Available' | 'Reserved' | 'Booked' | 'Blocked';
}

interface SeatPickerProps {
  seats: Seat[];
  selectedSeats: string[];
  onSeatSelect: (seatNumber: string) => void;
  onSeatDeselect: (seatNumber: string) => void;
  maxSeats?: number;
  /** Fires when a rider taps a free seat while already at the cap. */
  onMaxReached?: () => void;
  /** Shows the "checking availability" line during a background refresh. */
  isRefreshing?: boolean;
}

/** Seat glyph edge, in px. Six-across cabins still clear a 390px viewport. */
const SEAT_SIZE = 40;

function seatStateOf(status: Seat['status'], isSelected: boolean): SeatState {
  if (isSelected) return 'selected';
  switch (status) {
    case 'Available':
      return 'available';
    case 'Reserved':
      return 'reserved';
    case 'Booked':
      return 'booked';
    default:
      return 'blocked';
  }
}

interface SeatButtonProps {
  seat: Seat;
  state: SeatState;
  /** Free seat the rider cannot take because the per-booking cap is full. */
  isCapped: boolean;
  isFocusStop: boolean;
  label: string;
  onClick: (seat: Seat) => void;
}

const SeatButton = memo(function SeatButton({
  seat,
  state,
  isCapped,
  isFocusStop,
  label,
  onClick,
}: SeatButtonProps) {
  const style = SEAT_STATE_STYLES[state];
  const isTaken = state === 'reserved' || state === 'booked' || state === 'blocked';
  // `aria-disabled` rather than `disabled`: a taken seat stays reachable, so a
  // screen-reader or keyboard rider can still read the shape of the cabin.
  const isInert = isTaken || isCapped;

  return (
    <button
      type="button"
      data-seat={seat.seatNumber}
      data-row={seat.row}
      data-col={seat.column}
      tabIndex={isFocusStop ? 0 : -1}
      aria-pressed={state === 'selected'}
      aria-disabled={isInert || undefined}
      aria-label={label}
      title={label}
      onClick={() => onClick(seat)}
      style={{ width: SEAT_SIZE, height: SEAT_SIZE }}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-2 text-xs transition-all duration-150',
        'outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        style.body,
        style.label,
        isInert ? 'cursor-not-allowed' : style.interactive,
        isCapped && !isTaken && 'opacity-45',
      )}
    >
      {state === 'blocked' && (
        <span className="pointer-events-none absolute inset-0" style={BLOCKED_HATCH} aria-hidden="true" />
      )}
      {/* Backrest — turns the square into something that reads as a seat. */}
      <span
        className="pointer-events-none absolute inset-x-1.5 bottom-0.5 h-1 rounded-full bg-current opacity-25"
        aria-hidden="true"
      />
      <span className="relative">{seat.seatNumber}</span>
    </button>
  );
});

export function SeatPicker({
  seats,
  selectedSeats,
  onSeatSelect,
  onSeatDeselect,
  maxSeats = 5,
  onMaxReached,
  isRefreshing = false,
}: SeatPickerProps) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const tsp = dict?.travel?.seatPicker;
  const ts = dict?.travel?.seat;
  const statusLabels = ts?.status as Partial<Record<string, string>> | undefined;
  const typeLabels = ts?.type as Partial<Record<string, string>> | undefined;

  const gridRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');

  const selectedSeatsSet = useMemo(() => new Set(selectedSeats), [selectedSeats]);

  const { rowNumbers, maxColumns, seatMap } = useMemo(() => {
    const seatLookup = new Map<string, Seat>();
    const rowSet = new Set<number>();
    let maxCol = 0;

    for (const seat of seats) {
      seatLookup.set(`${seat.row}-${seat.column}`, seat);
      rowSet.add(seat.row);
      if (seat.column > maxCol) maxCol = seat.column;
    }

    return {
      rowNumbers: [...rowSet].sort((a, b) => a - b),
      maxColumns: maxCol,
      seatMap: seatLookup,
    };
  }, [seats]);

  const columnArray = useMemo(
    () => Array.from({ length: maxColumns }, (_, i) => i + 1),
    [maxColumns],
  );
  const aisleCol = useMemo(() => aisleAfterColumn(maxColumns), [maxColumns]);

  // Only explain the states this cabin actually contains.
  const legendStates = useMemo(() => {
    const present = new Set<SeatState>(['available', 'selected']);
    for (const seat of seats) {
      if (seat.status !== 'Available') present.add(seatStateOf(seat.status, false));
    }
    return SEAT_LEGEND_ORDER.filter((state) => present.has(state));
  }, [seats]);

  const isMaxReached = selectedSeats.length >= maxSeats;

  // Roving tabindex: the cabin is one tab stop, arrows move between seats.
  const [focusStop, setFocusStop] = useState<string | null>(null);
  const effectiveFocusStop =
    focusStop && seats.some((s) => s.seatNumber === focusStop)
      ? focusStop
      : (selectedSeats[0] ??
        seats.find((s) => s.status === 'Available')?.seatNumber ??
        seats[0]?.seatNumber ??
        null);

  const seatLabel = useCallback(
    (seat: Seat, isSelected: boolean) => {
      const status = isSelected
        ? (ts?.selected ?? 'Selected')
        : (statusLabels?.[seat.status] ?? seat.status);
      const type = seat.seatType ? typeLabels?.[seat.seatType] : undefined;
      const template = type
        ? (tsp?.seatAria ?? 'Seat {seat}, {type}, {status}')
        : (tsp?.seatAriaPlain ?? 'Seat {seat}, {status}');
      return template
        .replace('{seat}', seat.seatNumber)
        .replace('{type}', type ?? '')
        .replace('{status}', status);
    },
    [statusLabels, typeLabels, ts?.selected, tsp?.seatAria, tsp?.seatAriaPlain],
  );

  const handleSeatClick = useCallback(
    (seat: Seat) => {
      setFocusStop(seat.seatNumber);

      if (selectedSeatsSet.has(seat.seatNumber)) {
        onSeatDeselect(seat.seatNumber);
        setAnnouncement(
          (tsp?.announceDeselected ?? 'Seat {seat} removed').replace('{seat}', seat.seatNumber),
        );
        return;
      }

      if (seat.status !== 'Available') return;

      if (selectedSeats.length >= maxSeats) {
        onMaxReached?.();
        return;
      }

      onSeatSelect(seat.seatNumber);
      setAnnouncement(
        (tsp?.announceSelected ?? 'Seat {seat} selected').replace('{seat}', seat.seatNumber),
      );
    },
    [
      selectedSeatsSet,
      selectedSeats.length,
      maxSeats,
      onSeatSelect,
      onSeatDeselect,
      onMaxReached,
      tsp?.announceSelected,
      tsp?.announceDeselected,
    ],
  );

  // Arrow keys walk the cabin. The map is pinned to LTR (see below), so
  // ArrowLeft is always "one column toward the driver" in both languages.
  const handleGridKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const origin = (event.target as HTMLElement).closest<HTMLElement>('[data-seat]');
      if (!origin) return;

      const row = Number(origin.dataset.row);
      const col = Number(origin.dataset.col);
      let nextRow = row;
      let nextCol = col;

      switch (event.key) {
        case 'ArrowLeft':
          nextCol = col - 1;
          break;
        case 'ArrowRight':
          nextCol = col + 1;
          break;
        case 'ArrowUp':
          nextRow = row - 1;
          break;
        case 'ArrowDown':
          nextRow = row + 1;
          break;
        case 'Home':
          nextCol = 1;
          break;
        case 'End':
          nextCol = maxColumns;
          break;
        default:
          return;
      }

      // Step over gaps (a cabin can miss a seat where the door or stairwell is).
      let target = seatMap.get(`${nextRow}-${nextCol}`);
      const step = nextCol - col;
      while (!target && step !== 0 && nextCol >= 1 && nextCol <= maxColumns) {
        nextCol += step;
        target = seatMap.get(`${nextRow}-${nextCol}`);
      }
      if (!target) return;

      event.preventDefault();
      setFocusStop(target.seatNumber);
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-seat="${CSS.escape(target.seatNumber)}"]`)
        ?.focus();
    },
    [seatMap, maxColumns],
  );

  const countLabel = `${formatNumber(selectedSeats.length, locale)} ${
    selectedSeats.length === 1
      ? (tsp?.seatSelected ?? 'seat selected')
      : (tsp?.seatsSelected ?? 'seats selected')
  }`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold">{tsp?.selectSeats ?? 'Select Your Seats'}</h3>
        <p className="text-sm text-muted-foreground">
          {selectedSeats.length === 0 ? (tsp?.none ?? 'No seat chosen yet') : countLabel}
          {isMaxReached && (
            <span className="ms-2 text-primary">({tsp?.maxReached ?? 'Maximum seats reached'})</span>
          )}
        </p>
      </div>

      <p id="seat-picker-hint" className="text-xs text-muted-foreground">
        {tsp?.hint ?? 'Tap a seat to choose it. Grey seats are already taken.'}{' '}
        {(tsp?.maxHint ?? 'You can book up to {count} seats in one go.').replace(
          '{count}',
          formatNumber(maxSeats, locale),
        )}
      </p>

      {/* The cabin is a physical diagram of the bus, so it is pinned to LTR —
          mirroring it under `dir="rtl"` would move seat A1 to the other
          window and quietly mislead every Arabic rider. Labels inside stay
          localized; bidi handles the RTL runs. */}
      <div dir="ltr" className="overflow-x-auto pb-1">
        <div
          className="mx-auto w-fit border border-border bg-muted/50 px-3 pb-4 pt-3"
          style={{ borderRadius: '28px 28px 12px 12px' }}
        >
          {/* Driver's cab */}
          <div className="mb-3 flex items-center justify-between gap-6 border-b border-dashed border-border pb-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-muted-foreground/40"
              title={tsp?.driver ?? 'Driver'}
              aria-label={tsp?.driver ?? 'Driver'}
            >
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {tsp?.front ?? 'Front of bus'}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
              {tsp?.door ?? 'Door'}
            </span>
          </div>

          {/* Seat grid */}
          <div
            ref={gridRef}
            role="group"
            aria-label={tsp?.selectSeats ?? 'Select Your Seats'}
            aria-describedby="seat-picker-hint"
            onKeyDown={handleGridKeyDown}
            className="flex flex-col gap-2"
          >
            {rowNumbers.map((rowNum) => (
              <div key={rowNum} className="flex items-center gap-2">
                <span
                  className="h-7 w-1.5 shrink-0 rounded-full bg-muted-foreground/25"
                  aria-hidden="true"
                />
                {columnArray.map((colNum) => {
                  const seat = seatMap.get(`${rowNum}-${colNum}`);
                  const showAisle = colNum === aisleCol && colNum < maxColumns;
                  const isSelected = seat ? selectedSeatsSet.has(seat.seatNumber) : false;

                  return (
                    <Fragment key={colNum}>
                      {seat ? (
                        <SeatButton
                          seat={seat}
                          state={seatStateOf(seat.status, isSelected)}
                          isCapped={isMaxReached && !isSelected}
                          isFocusStop={seat.seatNumber === effectiveFocusStop}
                          label={seatLabel(seat, isSelected)}
                          onClick={handleSeatClick}
                        />
                      ) : (
                        <span
                          style={{ width: SEAT_SIZE, height: SEAT_SIZE }}
                          className="shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {showAisle && <span className="w-5 shrink-0" aria-hidden="true" />}
                    </Fragment>
                  );
                })}
                <span
                  className="h-7 w-1.5 shrink-0 rounded-full bg-muted-foreground/25"
                  aria-hidden="true"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SeatLegend states={legendStates} />
        {isRefreshing && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            {tsp?.refreshing ?? 'Checking availability…'}
          </span>
        )}
      </div>

      {/* Chosen seats — removable without hunting for them on the map */}
      {selectedSeats.length > 0 && (
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            {tsp?.selectedSeats ?? 'Selected Seats'}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {selectedSeats.map((seatNumber) => (
              <li key={seatNumber}>
                <button
                  type="button"
                  onClick={() => {
                    onSeatDeselect(seatNumber);
                    setAnnouncement(
                      (tsp?.announceDeselected ?? 'Seat {seat} removed').replace('{seat}', seatNumber),
                    );
                  }}
                  aria-label={(tsp?.removeSeat ?? 'Remove seat {seat}').replace('{seat}', seatNumber)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary py-1 ps-3 pe-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {seatNumber}
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
