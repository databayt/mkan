'use client';

import { useDictionary } from '@/components/internationalization/dictionary-context';

interface SeatLegendProps {
  dictionary?: {
    available: string;
    selected: string;
    booked: string;
    blocked: string;
  };
}

export function SeatLegend({ dictionary: dictionaryProp }: SeatLegendProps) {
  const dict = useDictionary();
  const ts = dict?.travel?.seat;
  const dictionary = dictionaryProp ?? {
    available: ts?.available ?? 'Available',
    selected: ts?.selected ?? 'Selected',
    booked: ts?.booked ?? 'Booked',
    blocked: ts?.blocked ?? 'Not Available',
  };
  const legendItems = [
    {
      key: 'available',
      label: dictionary.available,
      className: 'bg-green-100 border-green-300',
    },
    {
      key: 'selected',
      label: dictionary.selected,
      className: 'bg-primary',
    },
    {
      key: 'booked',
      label: dictionary.booked,
      className: 'bg-gray-200 border-gray-300',
    },
    {
      key: 'blocked',
      label: dictionary.blocked,
      className: 'bg-red-100 border-red-300',
    },
  ];

  return (
    <div className="flex flex-wrap gap-4 text-sm">
      {legendItems.map((item) => (
        <div key={item.key} className="flex items-center gap-2">
          <div
            className={`w-5 h-5 rounded border-2 ${item.className}`}
            aria-hidden="true"
          />
          <span className="text-muted-foreground">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
