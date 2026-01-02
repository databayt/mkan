'use client';

import { cn } from '@/lib/utils';
import { SeatLegend } from './seat-legend';

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
  dictionary?: {
    selectSeats: string;
    seatSelected: string;
    seatsSelected: string;
    maxReached: string;
  };
}

export function SeatPicker({
  seats,
  selectedSeats,
  onSeatSelect,
  onSeatDeselect,
  maxSeats = 5,
  dictionary = {
    selectSeats: 'Select Your Seats',
    seatSelected: 'seat selected',
    seatsSelected: 'seats selected',
    maxReached: 'Maximum seats reached',
  },
}: SeatPickerProps) {
  // Group seats by row
  const rows = seats.reduce(
    (acc, seat) => {
      if (!acc[seat.row]) {
        acc[seat.row] = [];
      }
      acc[seat.row].push(seat);
      return acc;
    },
    {} as Record<number, Seat[]>
  );

  const rowNumbers = Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b);

  // Determine max columns
  const maxColumns = Math.max(...seats.map((s) => s.column));

  const handleSeatClick = (seat: Seat) => {
    if (seat.status !== 'Available') return;

    if (selectedSeats.includes(seat.seatNumber)) {
      onSeatDeselect(seat.seatNumber);
    } else {
      if (selectedSeats.length >= maxSeats) return;
      onSeatSelect(seat.seatNumber);
    }
  };

  const getSeatStyle = (seat: Seat) => {
    const isSelected = selectedSeats.includes(seat.seatNumber);

    if (isSelected) {
      return 'bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer';
    }

    switch (seat.status) {
      case 'Available':
        return 'bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer border-green-300';
      case 'Reserved':
        return 'bg-yellow-100 text-yellow-800 cursor-not-allowed border-yellow-300';
      case 'Booked':
        return 'bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300';
      case 'Blocked':
        return 'bg-red-100 text-red-800 cursor-not-allowed border-red-300';
      default:
        return 'bg-gray-100';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{dictionary.selectSeats}</h3>
        <p className="text-sm text-muted-foreground">
          {selectedSeats.length}{' '}
          {selectedSeats.length === 1
            ? dictionary.seatSelected
            : dictionary.seatsSelected}
          {selectedSeats.length >= maxSeats && (
            <span className="text-amber-600 ml-2">
              ({dictionary.maxReached})
            </span>
          )}
        </p>
      </div>

      {/* Bus Layout */}
      <div className="overflow-x-auto pb-4">
        <div className="bg-muted/30 rounded-xl p-6 min-w-[300px] inline-block">
          {/* Driver Area */}
          <div className="flex justify-end mb-6 pr-4">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
              Driver
            </div>
          </div>

          {/* Seat Grid */}
          <div className="space-y-2">
            {rowNumbers.map((rowNum) => (
              <div key={rowNum} className="flex items-center gap-2">
                {/* Row Label */}
                <span className="w-6 text-xs text-muted-foreground font-medium">
                  {String.fromCharCode(64 + rowNum)}
                </span>

                {/* Seats in Row */}
                <div className="flex gap-2">
                  {Array.from({ length: maxColumns }, (_, i) => i + 1).map(
                    (colNum) => {
                      const seat = rows[rowNum]?.find(
                        (s) => s.column === colNum
                      );

                      // Add aisle space after column 2 (for 4-column bus)
                      const showAisle = colNum === 2 && maxColumns === 4;

                      return (
                        <div key={colNum} className="flex items-center">
                          {seat ? (
                            <button
                              type="button"
                              onClick={() => handleSeatClick(seat)}
                              disabled={seat.status !== 'Available'}
                              className={cn(
                                'w-10 h-10 rounded-lg border-2 flex items-center justify-center text-xs font-semibold transition-colors',
                                getSeatStyle(seat)
                              )}
                              title={`${seat.seatNumber} - ${seat.status}${seat.seatType ? ` (${seat.seatType})` : ''}`}
                            >
                              {seat.seatNumber}
                            </button>
                          ) : (
                            <div className="w-10 h-10" /> // Empty space
                          )}
                          {showAisle && <div className="w-6" />}
                        </div>
                      );
                    }
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Column Labels */}
          <div className="flex items-center gap-2 mt-4">
            <span className="w-6" />
            <div className="flex gap-2">
              {Array.from({ length: maxColumns }, (_, i) => i + 1).map(
                (colNum) => {
                  const showAisle = colNum === 2 && maxColumns === 4;
                  return (
                    <div key={colNum} className="flex items-center">
                      <span className="w-10 text-center text-xs text-muted-foreground">
                        {colNum}
                      </span>
                      {showAisle && <div className="w-6" />}
                    </div>
                  );
                }
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <SeatLegend />

      {/* Selected Seats Summary */}
      {selectedSeats.length > 0 && (
        <div className="bg-primary/5 rounded-lg p-4">
          <p className="text-sm font-medium">Selected Seats:</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedSeats.map((seatNumber) => (
              <span
                key={seatNumber}
                className="inline-flex items-center bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm"
              >
                {seatNumber}
                <button
                  type="button"
                  onClick={() => onSeatDeselect(seatNumber)}
                  className="ml-2 hover:text-primary-foreground/70"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
