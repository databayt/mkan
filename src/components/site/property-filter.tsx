"use client";

import React from 'react';
import AirbnbIcon from '../atom/airbnb-icon';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface IconItem {
  filename: string;
  label: string;
  description?: string;
}

const AIRBNB_ICONS: IconItem[] = [
  { filename: 'Islands', label: 'Islands', description: 'Private islands' },
  { filename: 'Mension', label: 'Mansions', description: 'Luxury homes' },
  { filename: 'Beach', label: 'Beach', description: 'Beachfront' },
  { filename: 'Boat', label: 'Boats', description: 'Unique stays' },
  { filename: 'Containers', label: 'Containers', description: 'Modern design' },
  { filename: 'New', label: 'New', description: 'Latest additions' },
  { filename: 'Beauty Pools', label: 'Pools', description: 'Pool paradise' },
  { filename: 'Group', label: 'Groups', description: 'Large groups' },
  { filename: 'layer1', label: 'Featured', description: 'Top picks' },
  { filename: 'Calque 2', label: 'Special', description: 'Unique stays' },
  { filename: 'Windmill', label: 'Windmills', description: 'Unique stays' },
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
                {icon.label}
              </div>
              
              {/* Optional Description */}
              {showDescriptions && icon.description && (
                <div className="text-[10px] text-gray-700">
                  {icon.description}
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
          <CarouselContent className="-ml-2">
            {AIRBNB_ICONS.map((icon) => (
              <CarouselItem key={icon.filename} className="pl-2 basis-auto">
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
                      {icon.label}
                    </div>
                    
                    {/* Optional Description */}
                    {showDescriptions && icon.description && (
                      <div className="text-[10px] text-gray-700">
                        {icon.description}
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