"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
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
  label: string;
  labelAr: string;
  description?: string;
  descriptionAr?: string;
}

const AIRBNB_ICONS: IconItem[] = [
  { filename: 'Islands', label: 'Islands', labelAr: 'جزر', description: 'Private islands', descriptionAr: 'جزر خاصة' },
  { filename: 'Mension', label: 'Mansions', labelAr: 'قصور', description: 'Luxury homes', descriptionAr: 'منازل فاخرة' },
  { filename: 'Beach', label: 'Beach', labelAr: 'شاطئ', description: 'Beachfront', descriptionAr: 'واجهة بحرية' },
  { filename: 'Boat', label: 'Boats', labelAr: 'قوارب', description: 'Unique stays', descriptionAr: 'إقامات فريدة' },
  { filename: 'Containers', label: 'Containers', labelAr: 'حاويات', description: 'Modern design', descriptionAr: 'تصميم عصري' },
  { filename: 'New', label: 'New', labelAr: 'جديد', description: 'Latest additions', descriptionAr: 'أحدث الإضافات' },
  { filename: 'Beauty Pools', label: 'Pools', labelAr: 'مسابح', description: 'Pool paradise', descriptionAr: 'جنة المسابح' },
  { filename: 'Group', label: 'Groups', labelAr: 'مجموعات', description: 'Large groups', descriptionAr: 'مجموعات كبيرة' },
  { filename: 'layer1', label: 'Featured', labelAr: 'مميز', description: 'Top picks', descriptionAr: 'أفضل الخيارات' },
  { filename: 'Calque 2', label: 'Special', labelAr: 'خاص', description: 'Unique stays', descriptionAr: 'إقامات فريدة' },
  { filename: 'Windmill', label: 'Windmills', labelAr: 'طواحين', description: 'Unique stays', descriptionAr: 'إقامات فريدة' },
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
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");

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
                {isAr ? icon.labelAr : icon.label}
              </div>
              
              {/* Optional Description */}
              {showDescriptions && icon.description && (
                <div className="text-[10px] text-gray-700">
                  {isAr ? icon.descriptionAr : icon.description}
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
                      {isAr ? icon.labelAr : icon.label}
                    </div>
                    
                    {/* Optional Description */}
                    {showDescriptions && icon.description && (
                      <div className="text-[10px] text-gray-700">
                        {isAr ? icon.descriptionAr : icon.description}
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