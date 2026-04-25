'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, ArrowRightLeft, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { CitySelect } from './city-select';
import { cn } from '@/lib/utils';
import { mergeSearchParams, parseSearchParams } from './url-state';

interface SearchWidgetProps {
  initialOrigin?: string;
  initialDestination?: string;
  initialOriginId?: number;
  initialDestinationId?: number;
  initialDate?: Date;
  assemblyPoints?: Array<{
    id: number;
    name: string;
    nameAr: string | null;
    city: string;
  }>;
  dictionary?: {
    from: string;
    to: string;
    date: string;
    search: string;
    swap: string;
  };
}

export function SearchWidget({
  initialOrigin = '',
  initialDestination = '',
  initialOriginId,
  initialDestinationId,
  initialDate,
  assemblyPoints = [],
  dictionary = {
    from: 'From',
    to: 'To',
    date: 'Travel Date',
    search: 'Search Trips',
    swap: 'Swap cities',
  },
}: SearchWidgetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ lang: string }>();
  const lang = params?.lang === 'ar' ? 'ar' : 'en';
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [originId, setOriginId] = useState<number | undefined>(initialOriginId);
  const [destinationId, setDestinationId] = useState<number | undefined>(
    initialDestinationId,
  );
  const [date, setDate] = useState<Date | undefined>(initialDate || new Date());

  const handleSwap = () => {
    const tempText = origin;
    const tempId = originId;
    setOrigin(destination);
    setOriginId(destinationId);
    setDestination(tempText);
    setDestinationId(tempId);
  };

  const resolveCity = (label: string) =>
    assemblyPoints.find(
      (p) =>
        p.city.toLowerCase() === label.toLowerCase() ||
        p.name.toLowerCase() === label.toLowerCase(),
    );

  const handleSearch = () => {
    if (!origin || !destination || !date) return;

    const resolvedOrigin = originId ? undefined : resolveCity(origin)?.id;
    const resolvedDestination = destinationId
      ? undefined
      : resolveCity(destination)?.id;

    const current = parseSearchParams(searchParams);
    const qs = mergeSearchParams(current, {
      originId: originId ?? resolvedOrigin,
      destinationId: destinationId ?? resolvedDestination,
      origin,
      destination,
      date: format(date, 'yyyy-MM-dd'),
      page: 1,
    });

    router.push(`/${lang}/transport/search?${qs.toString()}`);
  };

  return (
    <div className="bg-background rounded-2xl shadow-lg p-6 border">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Origin */}
        <div className="flex-1">
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            {dictionary.from}
          </label>
          <CitySelect
            value={origin}
            onChange={setOrigin}
            placeholder={dictionary.from}
            assemblyPoints={assemblyPoints}
          />
        </div>

        {/* Swap Button */}
        <div className="flex items-end justify-center lg:pb-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleSwap}
            className="rounded-full"
            title={dictionary.swap}
            aria-label={dictionary.swap}
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Destination */}
        <div className="flex-1">
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            {dictionary.to}
          </label>
          <CitySelect
            value={destination}
            onChange={setDestination}
            placeholder={dictionary.to}
            assemblyPoints={assemblyPoints}
          />
        </div>

        {/* Date */}
        <div className="flex-1">
          <label className="text-sm font-medium text-muted-foreground mb-2 block">
            {dictionary.date}
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-start font-normal h-12',
                  !date && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="me-2 h-4 w-4" />
                {date ? format(date, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                disabled={(date) => date < new Date()}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Search Button */}
        <div className="flex items-end">
          <Button
            onClick={handleSearch}
            disabled={!origin || !destination || !date}
            className="w-full lg:w-auto h-12 px-8"
          >
            <Search className="me-2 h-4 w-4" />
            {dictionary.search}
          </Button>
        </div>
      </div>
    </div>
  );
}
