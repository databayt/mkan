"use client";

import React from 'react';
import { useDictionary } from '@/components/internationalization/dictionary-context';
import AirbnbIcon from '../atom/property-icon';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

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
      {/* Desktop Layout */}
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

      {/* Mobile Layout with Carousel */}
      <div className="md:hidden relative">
        <Carousel
          opts={{
            align: "start",
            loop: false,
          }}
          className="w-full"
        >
          <CarouselContent className="-ms-2">
            {AIRBNB_ICONS.map((icon) => (
              <CarouselItem key={icon.filename} className="ps-2 basis-auto">
                <div
                  onClick={() => onIconClick?.(icon.filename)}
                  className="flex flex-col items-center cursor-pointer group transition-all duration-200 px-2 py-1"
                >
                  {/* Icon Container */}
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg">
                    <AirbnbIcon 
                      name={icon.filename} 
                      size={20}
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
                    style={{ width: 'fit-content', minWidth: '16px' }}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          
          {/* Navigation Arrows - Only show if needed */}
          <CarouselPrevious className="left-2 h-8 w-8" />
          <CarouselNext className="right-2 h-8 w-8" />
        </Carousel>
      </div>
    </div>
  );
};

export default PropertyFilter; 