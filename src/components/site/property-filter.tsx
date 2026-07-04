"use client";

import React from 'react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import AirbnbIcon from '../atom/property-icon';

interface IconItem {
  filename: string;
  labelKey: string;
}

const AIRBNB_ICONS: IconItem[] = [
  { filename: 'Islands', labelKey: 'Islands' },
  { filename: 'Mension', labelKey: 'Mansions' },
  { filename: 'Beach', labelKey: 'Beach' },
  { filename: 'Boat', labelKey: 'Boats' },
  { filename: 'Containers', labelKey: 'Containers' },
  { filename: 'New', labelKey: 'New' },
  { filename: 'Beauty Pools', labelKey: 'Pools' },
  { filename: 'Group', labelKey: 'Groups' },
  { filename: 'layer1', labelKey: 'Featured' },
  { filename: 'Calque 2', labelKey: 'Special' },
  { filename: 'Windmill', labelKey: 'Windmills' },
];

interface PropertyFilterProps {
  onIconClick?: (iconFilename: string) => void;
  selectedIcon?: string;
  className?: string;
  showDescriptions?: boolean;
}

const PropertyFilter: React.FC<PropertyFilterProps> = ({
  onIconClick,
  selectedIcon,
  className = "",
  showDescriptions = false
}) => {
  const dict = useDictionary();
  const filter = dict.home?.filter as Record<string, any> | undefined;

  return (
    <div className={`w-full ${className}`}>
      {/* Desktop Layout (Unchanged) */}
      <div className="hidden md:flex items-start justify-between py-1">
        {AIRBNB_ICONS.map((icon) => (
          <div
            key={icon.filename}
            onClick={() => onIconClick?.(icon.filename)}
            className="flex flex-col items-center flex-1 cursor-pointer group transition-all duration-200"
          >
            {/* Icon Container */}
            <div className="flex items-center justify-center w-12 h-12 rounded-lg">
              <AirbnbIcon 
                name={icon.filename} 
                size={24}
                className={`transition-all duration-200 ${
                  selectedIcon === icon.filename 
                    ? 'brightness-0 saturate-0' 
                    : 'group-hover:brightness-0 group-hover:saturate-0'
                }`}
              />
            </div>
            
            {/* Label */}
            <div className="-mt-1 text-center">
              <div 
                className={`text-xs font-normal transition-colors duration-200 inline-block ${
                  selectedIcon === icon.filename
                    ? 'text-black'
                    : 'text-gray-700 group-hover:text-black'
                }`}
              >
                {filter?.[icon.labelKey] ?? icon.labelKey}
              </div>
              
              {/* Optional Description */}
              {showDescriptions && filter?.desc?.[icon.labelKey] && (
                <div className="text-[10px] text-gray-700">
                  {filter?.desc?.[icon.labelKey] ?? icon.labelKey}
                </div>
              )}
            </div>

            {/* Underline - Selected Only */}
            <div 
              className={`mt-1 h-0.5 bg-gray-900 transition-opacity duration-200 mx-auto ${
                selectedIcon === icon.filename
                  ? 'opacity-100'
                  : 'opacity-0'
              }`}
              style={{ width: 'fit-content', minWidth: '20px' }}
            />
          </div>
        ))}
      </div>

      {/* Mobile Layout — native horizontal scroll. A momentum-scroll strip is
          smoother than a JS carousel for a short category row (no snap fighting
          the swipe), and it mirrors automatically with the document dir, so it's
          RTL/LTR-aware for free. `-mx-3` + the inner `px-3` lets the row bleed to
          the screen edges while the first/last chip still lines up with the page
          gutter (layout-container is 12px on mobile). */}
      <div className="md:hidden -mx-3 overflow-x-auto no-scrollbar overscroll-x-contain">
        <div className="flex w-max px-3">
          {AIRBNB_ICONS.map((icon) => (
            <div
              key={icon.filename}
              onClick={() => onIconClick?.(icon.filename)}
              className="flex flex-col items-center shrink-0 cursor-pointer group transition-all duration-200 px-2 py-1"
            >
              {/* Icon Container */}
              <div className="flex items-center justify-center w-12 h-12 rounded-lg">
                <AirbnbIcon
                  name={icon.filename}
                  size={24}
                  className={`transition-all duration-200 ${
                    selectedIcon === icon.filename
                      ? 'brightness-0 saturate-0'
                      : 'group-hover:brightness-0 group-hover:saturate-0'
                  }`}
                />
              </div>

              {/* Label */}
              <div className="-mt-1 text-center">
                <div
                  className={`text-xs font-medium transition-colors duration-200 inline-block whitespace-nowrap ${
                    selectedIcon === icon.filename
                      ? 'text-black'
                      : 'text-gray-700 group-hover:text-black'
                  }`}
                >
                  {filter?.[icon.labelKey] ?? icon.labelKey}
                </div>

                {/* Optional Description */}
                {showDescriptions && filter?.desc?.[icon.labelKey] && (
                  <div className="text-[10px] text-gray-700 whitespace-nowrap">
                    {filter?.desc?.[icon.labelKey] ?? icon.labelKey}
                  </div>
                )}
              </div>

              {/* Underline - Selected Only */}
              <div
                className={`mt-1 h-0.5 bg-gray-900 transition-opacity duration-200 mx-auto ${
                  selectedIcon === icon.filename
                    ? 'opacity-100'
                    : 'opacity-0'
                }`}
                style={{ width: 'fit-content', minWidth: '20px' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PropertyFilter;