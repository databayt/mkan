"use client";

import React from 'react';
import { usePathname } from 'next/navigation';

interface Destination {
  id: string;
  title: string;
  titleAr: string;
  distance: string;
  distanceAr: string;
  image: string;
  backgroundColor: string;
}

interface AirbnbInspirationProps {
  destinations?: Destination[];
  className?: string;
}

const defaultDestinations: Destination[] = [
  {
    id: '1',
    title: 'Khartoum',
    titleAr: 'الخرطوم',
    distance: 'Capital city',
    distanceAr: 'العاصمة',
    image: '/assets/Rectangle 1.svg',
    backgroundColor: '#CC2D4A'
  },
  {
    id: '2',
    title: 'Port Sudan',
    titleAr: 'بورتسودان',
    distance: 'Red Sea coast',
    distanceAr: 'ساحل البحر الأحمر',
    image: '/assets/Rectangle 1 (2).svg',
    backgroundColor: '#BC1A6E'
  },
  {
    id: '3',
    title: 'Omdurman',
    titleAr: 'أم درمان',
    distance: 'Historic city',
    distanceAr: 'مدينة تاريخية',
    image: '/assets/Rectangle 1 (3).svg',
    backgroundColor: '#DE3151'
  },
  {
    id: '4',
    title: 'Juba',
    titleAr: 'جوبا',
    distance: 'Southern region',
    distanceAr: 'المنطقة الجنوبية',
    image: '/assets/Rectangle 1.svg',
    backgroundColor: '#D93B30'
  }
];

const AirbnbInspiration: React.FC<AirbnbInspirationProps> = ({
  destinations = defaultDestinations,
  className = "",
}) => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");

  return (
    <div className={`w-full ${className}`}>
      {/* Section Title */}
      <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-6">
        {isAr ? "إلهام لرحلتك القادمة في السودان" : "Inspiration for your next trip in Sudan"}
      </h2>

      {/* Destination Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {destinations.map((destination) => (
          <div
            key={destination.id}
            className="cursor-pointer rounded-sm overflow-hidden flex flex-col h-80"
          >
            {/* Image Section */}
            <div className="relative h-40 overflow-hidden">
              <img
                src={destination.image}
                alt={destination.title}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Info Section with Custom Color */}
            <div 
              className="h-40 p-4 text-white flex flex-col "
              style={{ backgroundColor: destination.backgroundColor }}
            >
              <h3 className="text-lg font-semibold mb-1">
                {isAr ? destination.titleAr : destination.title}
              </h3>
              <p className="text-sm opacity-90 text-white">
                {isAr ? destination.distanceAr : destination.distance}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AirbnbInspiration; 