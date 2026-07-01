"use client";

import React from 'react';
import { Button } from '@/components/ui/button';

interface MobileReserveProps {
  pricePerNight?: number;
  className?: string;
  onReserve?: () => void;
}

const MobileReserve: React.FC<MobileReserveProps> = ({
  pricePerNight = 700,
  className = "",
  onReserve
}) => {
  return (
    <div className={`md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 p-4 ${className}`}>
      <div className="flex items-center justify-between">
        {/* Price */}
        <div className="flex flex-col">
          <span className="text-lg font-bold text-gray-900">
            SR{pricePerNight}
          </span>
          <span className="text-sm text-gray-600">
            night
          </span>
        </div>

        {/* Reserve Button */}
        <Button 
          onClick={onReserve}
          className="bg-[#E91E63] hover:bg-[#D81B60] text-white font-medium px-8 py-3 rounded-lg"
        >
          Reserve
        </Button>
      </div>
    </div>
  );
};

export default MobileReserve; 