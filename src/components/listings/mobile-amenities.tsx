"use client";

import React from 'react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { AMENITY_ICONS, featureIcon, featureLabel } from './feature-icons';

interface MobileAmenitiesProps {
  /** Real Prisma `Amenity` enum values for this listing. */
  amenities?: string[];
}

export default function MobileAmenities({ amenities = [] }: MobileAmenitiesProps) {
  const dict = useDictionary();
  const labels = dict?.rental?.property?.amenities as Record<string, string> | undefined;

  // Honest-info rule: no amenities → render nothing (never an empty block).
  if (!amenities || amenities.length === 0) return null;

  return (
    <div className="md:hidden px-4 py-6 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">
        {dict?.property?.sections?.amenities ?? 'What this place offers'}
      </h3>

      <div className="grid grid-cols-1 gap-3">
        {amenities.map((a) => {
          const Icon = featureIcon(AMENITY_ICONS, a);
          return (
            <div key={a} className="flex items-center gap-3">
              <Icon className="h-5 w-5 flex-shrink-0 text-foreground" strokeWidth={1.5} />
              <span className="text-sm text-foreground leading-relaxed">{featureLabel(labels, a)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
