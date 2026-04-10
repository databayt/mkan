"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';

interface AirbnbReserveProps {
  pricePerNight?: number;
  rating?: number;
  reviewCount?: number;
  className?: string;
}

const AirbnbReserve: React.FC<AirbnbReserveProps> = ({
  pricePerNight = 700,
  rating = 5.0,
  reviewCount = 7,
  className = "",
}) => {
  const [checkIn, setCheckIn] = useState('2/19/2022');
  const [checkOut, setCheckOut] = useState('2/26/2022');
  const [guests, setGuests] = useState(2);

  // Calculate nights and pricing
  const nights = 7; // This would be calculated from dates
  const basePrice = 79; // Actual nightly rate
  const subtotal = basePrice * nights;
  const weeklyDiscount = -28;
  const cleaningFee = 62;
  const serviceFee = 83;
  const occupancyTaxes = 29;
  const total = subtotal + weeklyDiscount + cleaningFee + serviceFee + occupancyTaxes;

  return (
    <div className={`rounded-sm bg-neutral-50 p-4  max-w-xs ${className}`}>
      {/* Header with price and rating */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline space-x-1">
          <span className="text-lg font-bold underline">SR{pricePerNight}</span>
          <span className="text-gray-600 text-sm"> for 2 night</span>
        </div>
        {/* <div className="flex items-center space-x-1">
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
            <path d="M7.99996 3.16675L9.16663 6.83341H12.8333L9.83329 9.16675L10.8333 12.8334L7.99996 10.5001L5.16663 12.8334L6.16663 9.16675L3.16663 6.83341H6.83329L7.99996 3.16675Z" stroke="#DE3151" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="#DE3151"/>
          </svg>
          <span className="text-xs font-normal text-gray-900">{rating}</span>
          <span className="text-xs text-gray-500 underline">· {reviewCount} reviews</span>
        </div> */}
      </div>

      {/* Date inputs and Guest selector - unified container */}
      <div className="border border-gray-400 rounded-md mb-4">
        {/* Date inputs */}
        <div className="grid grid-cols-2 border-b border-gray-400">
          <div className="p-2 border-e border-gray-400">
            <label className="block text-[10px] font-medium text-gray-900 uppercase tracking-wide">
              CHECK-IN
            </label>
            <input
              type="text"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full text-xs text-gray-600 bg-transparent border-none outline-none"
            />
          </div>
          <div className="p-2">
            <label className="block text-[10px] font-medium text-gray-900 uppercase tracking-wide">
              CHECKOUT
            </label>
            <input
              type="text"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full text-xs text-gray-600 bg-transparent border-none outline-none"
            />
          </div>
        </div>
        
        {/* Guest selector */}
        <div className="p-2 flex items-center justify-between cursor-pointer">
          <div>
            <label className="block text-[10px] font-medium text-gray-900 uppercase tracking-wide">
              GUESTS
            </label>
            <span className="text-xs text-gray-600">{guests} guests</span>
          </div>
          <ChevronDown className="w-3 h-3 text-gray-600" />
        </div>
      </div>

      {/* Reserve button */}
      <Button 
        className="w-full bg-[#E91E63] hover:bg-[#D81B60] text-white font-medium h-10 mb-3 text-sm"
        size="sm"
      >
        Reserve
      </Button>

      {/* Notice */}
      <p className="text-center text-xs text-gray-600 mb-4">
        You won't be charged yet
      </p>

      {/* Price breakdown */}
      {/* <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-gray-900 underline text-xs">${basePrice} × {nights} nights</span>
          <span className="text-gray-900 text-xs">${subtotal}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-900 underline text-xs">Weekly discount</span>
          <span className="text-green-600 text-xs">${weeklyDiscount}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-900 underline text-xs">Cleaning fee</span>
          <span className="text-gray-900 text-xs">${cleaningFee}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-900 underline text-xs">Service fee</span>
          <span className="text-gray-900 text-xs">${serviceFee}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="text-gray-900 underline text-xs">Occupancy taxes and fees</span>
          <span className="text-gray-900 text-xs">${occupancyTaxes}</span>
        </div>
        
        <hr className="border-gray-200 my-3" />
        
        <div className="flex justify-between items-center">
          <span className="text-gray-900 font-medium text-sm">Total</span>
          <span className="text-gray-900 font-medium text-sm">${total}</span>
        </div>
      </div> */}
    </div>
  );
};

export default AirbnbReserve;
