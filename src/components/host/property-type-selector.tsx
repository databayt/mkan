"use client";

import React from 'react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import SelectionCard from './selection-card';
import { cn } from '@/lib/utils';
import { PropertyType } from '@prisma/client';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { PropertyTypeIcon } from './property-type-icons';
import { PROPERTY_TYPES } from './property-type-icon-svg';

interface PropertySelectorProps {
  selectedType?: string;
  onSelect?: (typeId: string) => void;
  compact?: boolean;
  className?: string;
}

// Airbnb UI id (kebab-case) -> Prisma PropertyType enum.
const PRISMA_BY_ID: Record<string, PropertyType> = {
  'house': PropertyType.Villa,
  'apartment': PropertyType.Apartment,
  'barn': PropertyType.Cottage,
  'bed-breakfast': PropertyType.Rooms,
  'boat': PropertyType.Cottage,
  'cabin': PropertyType.Cottage,
  'camper-rv': PropertyType.Tinyhouse,
  'casa-particular': PropertyType.Villa,
  'castle': PropertyType.Villa,
  'cave': PropertyType.Cottage,
  'container': PropertyType.Tinyhouse,
  'cycladic-home': PropertyType.Villa,
  'dammuso': PropertyType.Villa,
  'dome': PropertyType.Tinyhouse,
  'earth-home': PropertyType.Cottage,
  'farm': PropertyType.Cottage,
  'guesthouse': PropertyType.Apartment,
  'hotel': PropertyType.Apartment,
  'houseboat': PropertyType.Cottage,
  'minsu': PropertyType.Rooms,
  'riad': PropertyType.Villa,
  'ryokan': PropertyType.Rooms,
  'shepherds-hut': PropertyType.Tinyhouse,
  'tent': PropertyType.Tinyhouse,
  'tiny-home': PropertyType.Tinyhouse,
  'tower': PropertyType.Villa,
  'treehouse': PropertyType.Cottage,
  'trullo': PropertyType.Villa,
  'windmill': PropertyType.Cottage,
  'yurt': PropertyType.Tinyhouse,
};

export const mapPropertyTypeToPrisma = (typeId: string): PropertyType =>
  PRISMA_BY_ID[typeId] ?? PropertyType.Apartment;

// kebab-case Airbnb id -> camelCase dictionary key (e.g. "bed-breakfast" -> "bedBreakfast").
const toDictKey = (id: string): string => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

const PropertySelector: React.FC<PropertySelectorProps> = ({
  selectedType,
  onSelect,
  compact = false,
  className,
}) => {
  const dict = useDictionary();
  const labels = dict.host?.propertyTypes as Record<string, string> | undefined;

  const propertyTypes = PROPERTY_TYPES.map((meta) => ({
    id: meta.id,
    name: labels?.[toDictKey(meta.id)] ?? meta.label,
  }));

  if (compact) {
    // Split the 30 types into slides of 12 (3 columns x 4 rows).
    const chunkSize = 12;
    const chunks: { id: string; name: string }[][] = [];
    for (let i = 0; i < propertyTypes.length; i += chunkSize) {
      chunks.push(propertyTypes.slice(i, i + chunkSize));
    }

    return (
      <div className={cn('w-full relative', className)}>
        <Carousel opts={{ align: 'start', loop: false }} className="w-full">
          <CarouselContent>
            {chunks.map((chunk, chunkIdx) => (
              <CarouselItem key={chunkIdx} className="basis-full">
                <div className="grid grid-cols-3 gap-3">
                  {chunk.map((type, i) => (
                    <SelectionCard
                      key={type.id}
                      id={type.id}
                      title={type.name}
                      icon={
                        <PropertyTypeIcon
                          type={type.id}
                          size={32}
                          index={chunkIdx * chunkSize + i}
                        />
                      }
                      isSelected={selectedType === type.id}
                      onClick={onSelect}
                      compact
                      className="h-24"
                    />
                  ))}
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          {/* Navigation controls below the grid, bottom-right */}
          <div className="flex justify-end items-center space-x-2 mt-4">
            <CarouselPrevious className="static translate-y-0 h-9 w-9 rounded-full border shadow-sm bg-background hover:bg-accent flex items-center justify-center text-foreground cursor-pointer" />
            <CarouselNext className="static translate-y-0 h-9 w-9 rounded-full border shadow-sm bg-background hover:bg-accent flex items-center justify-center text-foreground cursor-pointer" />
          </div>
        </Carousel>
      </div>
    );
  }

  return (
    <div className={cn('w-full max-w-4xl mx-auto', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {propertyTypes.map((type, i) => (
          <SelectionCard
            key={type.id}
            id={type.id}
            title={type.name}
            icon={<PropertyTypeIcon type={type.id} size={32} index={i} />}
            isSelected={selectedType === type.id}
            onClick={onSelect}
            className="p-6"
          />
        ))}
      </div>
    </div>
  );
};

export default PropertySelector;
