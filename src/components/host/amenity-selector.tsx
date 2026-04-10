"use client";

import React from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import SelectionCard from './selection-card';
import { cn } from '@/lib/utils';
import { Amenity } from '@prisma/client';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface AmenityOption {
  id: string;
  label: string;
  icon: () => React.ReactNode;
}

interface AmenitySelectorProps {
  selectedAmenities: string[];
  onToggle: (amenityId: string) => void;
  className?: string;
}

// Custom component for SVG amenity icons
const SvgIcon = ({ src, alt, size = 24 }: { src: string; alt: string; size?: number }) => (
  <Image
    src={src}
    alt={alt}
    width={size}
    height={size}
    className="object-contain"
  />
);

// Mapping function to convert UI amenity IDs to Prisma enum values
export const mapAmenityToPrisma = (amenityId: string): Amenity => {
  const mapping: Record<string, Amenity> = {
    'wifi': Amenity.WiFi,
    'tv': Amenity.HighSpeedInternet, // Assuming TV is mapped to HighSpeedInternet
    'kitchen': Amenity.Dishwasher, // Assuming kitchen is mapped to Dishwasher
    'washer': Amenity.WasherDryer,
    'free-parking': Amenity.Parking,
    'paid-parking': Amenity.Parking,
    'air-conditioning': Amenity.AirConditioning,
    'dedicated-workspace': Amenity.HighSpeedInternet, // Assuming workspace is mapped to HighSpeedInternet
    'pool': Amenity.Pool,
    'hot-tub': Amenity.Pool, // Assuming hot tub is mapped to Pool
    'patio': Amenity.HardwoodFloors, // Assuming patio is mapped to HardwoodFloors
    'bbq-grill': Amenity.HardwoodFloors, // Assuming BBQ grill is mapped to HardwoodFloors
  };
  
  return mapping[amenityId] || Amenity.WiFi; // Default to WiFi if not found
};

const AmenitySelector: React.FC<AmenitySelectorProps> = ({
  selectedAmenities,
  onToggle,
  className,
}) => {
  const pathname = usePathname();
  const dict = useDictionary();

  const guestFavorites: AmenityOption[] = [
    { id: 'wifi', label: dict.hosting.pages.amenities.wifi, icon: () => <SvgIcon src="/amenities/Wifi.svg" alt="Wifi" /> },
    { id: 'tv', label: dict.hosting.pages.amenities.tv, icon: () => <SvgIcon src="/amenities/TV.svg" alt="TV" /> },
    { id: 'kitchen', label: dict.hosting.pages.amenities.kitchen, icon: () => <SvgIcon src="/amenities/Kitchen.svg" alt="Kitchen" /> },
    { id: 'washer', label: dict.hosting.pages.amenities.washer, icon: () => <SvgIcon src="/amenities/Washing machine.svg" alt="Washing machine" /> },
    { id: 'free-parking', label: dict.hosting.pages.amenities.freeParking, icon: () => <SvgIcon src="/amenities/Parking.svg" alt="Free parking" /> },
    { id: 'paid-parking', label: dict.hosting.pages.amenities.paidParking, icon: () => <SvgIcon src="/amenities/Paid parking.svg" alt="Paid parking" /> },
    { id: 'air-conditioning', label: dict.hosting.pages.amenities.ac, icon: () => <SvgIcon src="/amenities/Air conditioning.svg" alt="Air conditioning" /> },
    { id: 'dedicated-workspace', label: dict.hosting.pages.amenities.workspace, icon: () => <SvgIcon src="/amenities/Workspace.svg" alt="Workspace" /> },
  ];

  const standoutAmenities: AmenityOption[] = [
    { id: 'pool', label: dict.hosting.pages.amenities.pool, icon: () => <SvgIcon src="/amenities/Pool.svg" alt="Pool" /> },
    { id: 'hot-tub', label: dict.hosting.pages.amenities.hotTub, icon: () => <SvgIcon src="/amenities/Hot tub.svg" alt="Hot tub" /> },
    { id: 'patio', label: dict.hosting.pages.amenities.patio, icon: () => <SvgIcon src="/amenities/Patio.svg" alt="Patio" /> },
    { id: 'bbq-grill', label: dict.hosting.pages.amenities.bbqGrill, icon: () => <SvgIcon src="/amenities/BBQ grill.svg" alt="BBQ grill" /> },
  ];

  return (
    <div className={cn('space-y-4 sm:space-y-4', className)}>
      {/* Guest Favorites */}
      <div>
        <h5 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
          {dict.hosting.pages.amenities.guestFavorites}
        </h5>
        <div className="grid grid-cols-4 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 pt-2 ">
          {guestFavorites.map((amenity) => (
            <SelectionCard
              key={amenity.id}
              id={amenity.id}
              title={amenity.label}
              icon={<amenity.icon />}
              isSelected={selectedAmenities.includes(amenity.id)}
              onClick={onToggle}
              compact={true}
              className="p-2 sm:p-3"
            />
          ))}
        </div>
      </div>

      {/* Standout Amenities */}
      <div>
        <h5 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
          {dict.hosting.pages.amenities.standoutAmenities}
        </h5>
        <div className="grid grid-cols-4 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 pt-2">
          {standoutAmenities.map((amenity) => (
            <SelectionCard
              key={amenity.id}
              id={amenity.id}
              title={amenity.label}
              icon={<amenity.icon />}
              isSelected={selectedAmenities.includes(amenity.id)}
              onClick={onToggle}
              compact={true}
              className="p-2 sm:p-3"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AmenitySelector; 