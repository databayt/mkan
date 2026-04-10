"use client";

import React from 'react';
import { Home, Building, Bed, Ship, TreePine, Castle, Mountain, Container, Warehouse, Car, Building2 } from 'lucide-react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import SelectionCard from './selection-card';
import { cn } from '@/lib/utils';
import { PropertyType } from '@prisma/client';

interface PropertyTypeOption {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  prismaValue: PropertyType;
}

interface PropertySelectorProps {
  selectedType?: string;
  onSelect?: (typeId: string) => void;
  compact?: boolean;
  className?: string;
}

// Mapping function to convert UI property type IDs to Prisma enum values
export const mapPropertyTypeToPrisma = (typeId: string): PropertyType => {
  const mapping: Record<string, PropertyType> = {
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
    'cycladic-home': PropertyType.Villa
  };
  
  return mapping[typeId] || PropertyType.Apartment; // Default to Apartment if not found
};

const PropertySelector: React.FC<PropertySelectorProps> = ({
  selectedType,
  onSelect,
  compact = false,
  className,
}) => {
  const dict = useDictionary();

  const propertyTypes: PropertyTypeOption[] = [
    { id: 'house', name: dict.host?.propertyTypes?.house ?? 'House', icon: Home, prismaValue: PropertyType.Villa },
    { id: 'apartment', name: dict.host?.propertyTypes?.apartment ?? 'Apartment', icon: Building, prismaValue: PropertyType.Apartment },
    { id: 'barn', name: dict.host?.propertyTypes?.barn ?? 'Barn', icon: Warehouse, prismaValue: PropertyType.Cottage },
    { id: 'bed-breakfast', name: dict.host?.propertyTypes?.bedBreakfast ?? 'Bed & Breakfast', icon: Bed, prismaValue: PropertyType.Rooms },
    { id: 'boat', name: dict.host?.propertyTypes?.boat ?? 'Boat', icon: Ship, prismaValue: PropertyType.Cottage },
    { id: 'cabin', name: dict.host?.propertyTypes?.cabin ?? 'Cabin', icon: TreePine, prismaValue: PropertyType.Cottage },
    { id: 'camper-rv', name: dict.host?.propertyTypes?.camperRv ?? 'Camper/RV', icon: Car, prismaValue: PropertyType.Tinyhouse },
    { id: 'casa-particular', name: dict.host?.propertyTypes?.casaParticular ?? 'Casa Particular', icon: Building2, prismaValue: PropertyType.Villa },
    { id: 'castle', name: dict.host?.propertyTypes?.castle ?? 'Castle', icon: Castle, prismaValue: PropertyType.Villa },
    { id: 'cave', name: dict.host?.propertyTypes?.cave ?? 'Cave', icon: Mountain, prismaValue: PropertyType.Cottage },
    { id: 'container', name: dict.host?.propertyTypes?.container ?? 'Container', icon: Container, prismaValue: PropertyType.Tinyhouse },
    { id: 'cycladic-home', name: dict.host?.propertyTypes?.cycladicHome ?? 'Cycladic Home', icon: Home, prismaValue: PropertyType.Villa }
  ];

  if (compact) {
    return (
      <div className={cn('w-full', className)}>
        <div className="grid grid-cols-4 gap-3">
          {propertyTypes.map((type) => {
            const IconComponent = type.icon;
            
            return (
              <SelectionCard
                key={type.id}
                id={type.id}
                title={type.name}
                icon={<IconComponent size={20} />}
                isSelected={selectedType === type.id}
                onClick={onSelect}
                compact={true}
                className="h-20"
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('w-full max-w-4xl mx-auto', className)}>
      <div className="mb-8">
        {/* <h1 className="text-center">
          Which of these best describes your place?
        </h1> */}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {propertyTypes.map((type) => {
          const IconComponent = type.icon;
          
          return (
            <SelectionCard
              key={type.id}
              id={type.id}
              title={type.name}
              icon={<IconComponent size={32} />}
              isSelected={selectedType === type.id}
              onClick={onSelect}
              className="p-6"
            />
          );
        })}
      </div>
    </div>
  );
};

export default PropertySelector; 