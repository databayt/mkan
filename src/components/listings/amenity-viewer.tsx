"use client";

import React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface AmenityItem {
  id: string;
  label: string;
  icon: string;
  alt: string;
}

interface AmenityViewerProps {
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

const AmenityViewer: React.FC<AmenityViewerProps> = ({
  className,
}) => {
  // Static amenities data matching the image exactly
  const staticAmenities: AmenityItem[] = [
    { id: 'wifi', label: 'Wifi', icon: '/amenities/Wifi.svg', alt: 'Wifi' },
    { id: 'tv', label: 'TV', icon: '/amenities/TV.svg', alt: 'TV' },
    { id: 'kitchen', label: 'Kitchen', icon: '/amenities/Kitchen.svg', alt: 'Kitchen' },
    { id: 'free-parking', label: 'Free parking on premises', icon: '/amenities/Parking.svg', alt: 'Free parking' },
    { id: 'air-conditioning', label: 'Air conditioning', icon: '/amenities/Air conditioning.svg', alt: 'Air conditioning' },
    { id: 'smoke-alarm', label: 'Smoke alarm', icon: '/amenities/Smoke alarm.svg', alt: 'Smoke alarm' },
  ];

  return (
    <div className={cn('space-y-6', className)}>
      {/* Heading */}
      <h3 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
        What this place offers
      </h3>

      {/* Amenities Grid */}
      <div className="grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
        {staticAmenities.map((amenity) => (
          <div key={amenity.id} className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <SvgIcon src={amenity.icon} alt={amenity.alt} size={24} />
            </div>
            <span className="text-base text-[#222222]">
              {amenity.label}
            </span>
          </div>
        ))}
      </div>

      {/* Show all amenities button — Airbnb's bordered secondary button */}
      <Button
        variant="outline"
        className="h-auto w-auto rounded-lg border border-[#222222] bg-transparent px-6 py-3.5 text-base font-semibold text-[#222222] hover:bg-[#F7F7F7]"
      >
        Show all 23 amenities
      </Button>
    </div>
  );
};

export default AmenityViewer; 