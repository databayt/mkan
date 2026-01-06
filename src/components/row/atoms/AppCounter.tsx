"use client";

import React, { FC } from 'react';
// Using simple symbols instead of icons for demo

interface AppCounterProps {
  value: number;
  maxValue?: number;
  minValue?: number;
  onIncrease: () => void;
  onDecrease?: () => void;
  onDescrease?: () => void; // Allow typo for compatibility
}

const AppCounter: FC<AppCounterProps> = ({
  value,
  maxValue = 16,
  minValue = 0,
  onIncrease,
  onDecrease,
  onDescrease,
}) => {
  const handleDecrease = onDecrease || onDescrease || (() => {});
  return (
    <div className="flex items-center gap-4">
      <button
        onClick={handleDecrease}
        disabled={value <= minValue}
        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        −
      </button>
      <span className="text-gray-800 font-medium w-8 text-center">
        {value}
      </span>
      <button
        onClick={onIncrease}
        disabled={value >= maxValue}
        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:border-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  );
};

export default AppCounter;
