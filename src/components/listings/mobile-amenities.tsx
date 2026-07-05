"use client";

import React, { useState } from 'react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { useLocale } from '@/components/internationalization/use-locale';
import { AMENITY_ICONS, featureIcon, featureLabel } from './feature-icons';

interface MobileAmenitiesProps {
  /** Real Prisma `Amenity` enum values for this listing. */
  amenities?: string[];
}

// Airbnb caps the mobile amenities list and shows a "Show all N" button (which
// opens the full modal on Airbnb; we expand inline). Matches AMENITIES_DEFAULT.
const CAP = 10;

export default function MobileAmenities({ amenities = [] }: MobileAmenitiesProps) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const labels = dict?.rental?.property?.amenities as Record<string, string> | undefined;

  // Honest-info rule: no amenities → render nothing (never an empty block).
  if (!amenities || amenities.length === 0) return null;

  const shown = expanded ? amenities : amenities.slice(0, CAP);
  const overflow = amenities.length > CAP;

  return (
    <div className="space-y-6">
      <h3 className="text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {dict?.property?.sections?.amenities ?? 'What this place offers'}
      </h3>

      <div className="flex flex-col gap-4">
        {shown.map((a) => {
          const Icon = featureIcon(AMENITY_ICONS, a);
          return (
            <div key={a} className="flex items-center gap-4">
              <Icon className="h-6 w-6 flex-shrink-0 text-[#222222]" strokeWidth={1.5} />
              <span className="text-base text-[#222222] leading-5">{featureLabel(labels, a)}</span>
            </div>
          );
        })}
      </div>

      {overflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex h-12 w-full items-center justify-center rounded-[12px] bg-[#F2F2F2] text-base font-medium text-[#222222]"
        >
          {expanded
            ? (locale === 'ar' ? 'عرض أقل' : 'Show less')
            : (locale === 'ar'
                ? `عرض جميع وسائل الراحة (${amenities.length})`
                : `Show all ${amenities.length} amenities`)}
        </button>
      )}
    </div>
  );
}
