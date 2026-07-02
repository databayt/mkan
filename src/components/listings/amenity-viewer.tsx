"use client";

import React from 'react';
import { cn } from '@/lib/utils';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { AMENITY_ICONS, featureIcon, featureLabel } from './feature-icons';

interface AmenityViewerProps {
  /** Real Prisma `Amenity` enum values for this listing. */
  amenities?: string[];
  className?: string;
}

const AmenityViewer: React.FC<AmenityViewerProps> = ({ amenities = [], className }) => {
  const dict = useDictionary();
  const labels = dict?.rental?.property?.amenities as Record<string, string> | undefined;

  // Honest-info rule: no amenities → render nothing (never an empty block).
  if (!amenities || amenities.length === 0) return null;

  return (
    <div className={cn('space-y-6', className)}>
      <h3 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
        {dict?.property?.sections?.amenities ?? 'What this place offers'}
      </h3>

      <div className="grid grid-cols-1 gap-x-12 gap-y-4 md:grid-cols-2">
        {amenities.map((a) => {
          const Icon = featureIcon(AMENITY_ICONS, a);
          return (
            <div key={a} className="flex items-center gap-4">
              <Icon className="h-6 w-6 flex-shrink-0 text-[#222222]" strokeWidth={1.5} />
              <span className="text-base text-[#222222]">{featureLabel(labels, a)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AmenityViewer;
