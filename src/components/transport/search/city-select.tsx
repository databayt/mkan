'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from 'cmdk';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface AssemblyPoint {
  id: number;
  name: string;
  nameAr: string | null;
  city: string;
}

interface CitySelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  assemblyPoints?: AssemblyPoint[];
}

export function CitySelect({
  value,
  onChange,
  placeholder = 'Select city',
  assemblyPoints = [],
}: CitySelectProps) {
  const [open, setOpen] = useState(false);

  // Group assembly points by city
  const citiesMap = assemblyPoints.reduce(
    (acc, point) => {
      const city = acc[point.city];
      if (!city) {
        acc[point.city] = [point];
      } else {
        city.push(point);
      }
      return acc;
    },
    {} as Record<string, AssemblyPoint[]>
  );

  const cities = Object.keys(citiesMap).sort();

  // Sudan cities as fallback if no assembly points provided
  const defaultCities = [
    'Khartoum',
    'Omdurman',
    'Khartoum North',
    'Port Sudan',
    'Kassala',
    'Nyala',
    'El Obeid',
    'Wad Madani',
    'El Fasher',
    'Atbara',
    'Gedaref',
    'Dongola',
    'Sennar',
    'Rabak',
    'El Daein',
    'Kadugli',
    'Ed Damazin',
    'Kosti',
    'Shendi',
    'Berber',
  ];

  const displayCities = cities.length > 0 ? cities : defaultCities;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-12"
        >
          <div className="flex items-center">
            <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
            {value || placeholder}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search city..." className="h-10" />
          <CommandList>
            <CommandEmpty>No city found.</CommandEmpty>
            <CommandGroup>
              {displayCities.map((city) => (
                <CommandItem
                  key={city}
                  value={city}
                  onSelect={() => {
                    onChange(city);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === city ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  {city}
                  {citiesMap[city] && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {citiesMap[city].length} point
                      {citiesMap[city].length !== 1 ? 's' : ''}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
