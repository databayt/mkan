"use client";

import React from 'react';
import { useLocale } from '@/components/internationalization/use-locale';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import { formatCurrency } from '@/lib/i18n/formatters';

interface MobileReserveProps {
  pricePerNight?: number;
  className?: string;
  onReserve?: () => void;
  hostEmail?: string;
}

const MobileReserve: React.FC<MobileReserveProps> = ({
  pricePerNight = 700,
  className = "",
  onReserve,
  hostEmail = "+249915494649"
}) => {
  const { locale } = useLocale();
  const dict = useDictionary();
  const isAr = locale === 'ar';
  return (
    <div className={`md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Price */}
        <div className="flex flex-col">
          <span className="text-lg font-bold text-gray-900">
            {formatCurrency(pricePerNight, locale)}
          </span>
          <span className="text-sm text-gray-600">
            {dict?.property?.card?.night ?? "night"}
          </span>
        </div>

        {/* Call Button — native click-to-call, styled like search */}
        <a
          href={`tel:${hostEmail}`}
          className={`inline-flex items-center justify-center bg-[#de3151] hover:bg-[#de3151]/90 text-white text-sm font-semibold ${
            isAr ? 'px-6' : 'px-4'
          } h-12 rounded-sm shadow-[0_2px_8px_rgba(222,49,81,0.25)]`}
        >
          {dict?.property?.contactHost?.call ?? "Call"}
        </a>
      </div>
    </div>
  );
};

export default MobileReserve; 