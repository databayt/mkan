"use client";

import React from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import SelectionCard from './selection-card';
import { cn } from '@/lib/utils';
import { Amenity } from '@prisma/client';

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
  const isAr = pathname?.startsWith("/ar");

  const guestFavorites: AmenityOption[] = [
    { id: 'wifi', label: isAr ? 'واي فاي' : 'Wifi', icon: () => <SvgIcon src="/amenities/Wifi.svg" alt="Wifi" /> },
    { id: 'tv', label: isAr ? 'تلفزيون' : 'TV', icon: () => <SvgIcon src="/amenities/TV.svg" alt="TV" /> },
    { id: 'kitchen', label: isAr ? 'مطبخ' : 'Kitchen', icon: () => <SvgIcon src="/amenities/Kitchen.svg" alt="Kitchen" /> },
    { id: 'washer', label: isAr ? 'غسالة' : 'Washer', icon: () => <SvgIcon src="/amenities/Washing machine.svg" alt="Washing machine" /> },
    { id: 'free-parking', label: isAr ? 'موقف مجاني' : 'Free parking', icon: () => <SvgIcon src="/amenities/Parking.svg" alt="Free parking" /> },
    { id: 'paid-parking', label: isAr ? 'موقف مدفوع' : 'Paid parking', icon: () => <SvgIcon src="/amenities/Paid parking.svg" alt="Paid parking" /> },
    { id: 'air-conditioning', label: isAr ? 'تكييف' : 'AC', icon: () => <SvgIcon src="/amenities/Air conditioning.svg" alt="Air conditioning" /> },
    { id: 'dedicated-workspace', label: isAr ? 'مساحة عمل' : 'Workspace', icon: () => <SvgIcon src="/amenities/Workspace.svg" alt="Workspace" /> },
  ];

  const standoutAmenities: AmenityOption[] = [
    { id: 'pool', label: isAr ? 'مسبح' : 'Pool', icon: () => <SvgIcon src="/amenities/Pool.svg" alt="Pool" /> },
    { id: 'hot-tub', label: isAr ? 'جاكوزي' : 'Hot tub', icon: () => <SvgIcon src="/amenities/Hot tub.svg" alt="Hot tub" /> },
    { id: 'patio', label: isAr ? 'فناء' : 'Patio', icon: () => <SvgIcon src="/amenities/Patio.svg" alt="Patio" /> },
    { id: 'bbq-grill', label: isAr ? 'شواية' : 'BBQ grill', icon: () => <SvgIcon src="/amenities/BBQ grill.svg" alt="BBQ grill" /> },
  ];

  return (
    <div className={cn('space-y-4 sm:space-y-4', className)}>
      {/* Guest Favorites */}
      <div>
        <h5 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">
          {isAr ? "ماذا عن مفضلات الضيوف هذه؟" : "What about these guest favorites?"}
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
          {isAr ? "هل لديك أي مرافق مميزة؟" : "Do you have any standout amenities?"}
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