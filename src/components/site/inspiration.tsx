"use client";
import { cdn } from "@/lib/cdn";

import React from 'react';
import { BlurImage } from '@/components/atom/blur-image';
import Link from 'next/link';
import { useLocale } from '@/components/internationalization/use-locale';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface Destination {
  id: string;
  title: string;
  titleAr: string;
  distance: string;
  distanceAr: string;
  image: string;
  /** 16px WebP LQIP of `image` (sharp, generated once — the set is fixed). */
  blur?: string;
  backgroundColor: string;
}

const KHARTOUM_BLUR =
  'data:image/webp;base64,UklGRoYAAABXRUJQVlA4IHoAAAAwAgCdASoQAAsAAsBMJbACdADiW3XdJ3goAAD6NeNBMfB6MifmxmvzfGdIVtFBjAyEaSXw4yaLUfuFu7LopDVsysG2NGUOQfGb7XnAXr02RWAoOrCXOIc1DryvMtsorMdvYTIaennZYs/zsWmF5TnbJ0XaAY93dFYEAA==';
const PORT_SUDAN_BLUR =
  'data:image/webp;base64,UklGRnIAAABXRUJQVlA4IGYAAAAQAgCdASoQAAsAAsBMJbACdAEUrwuRUFHgAP6yOu2ALzlrim/UsJ1MXnTFMstxpINKojY71K8eUIJef9FCwOo6bSY1QTQbKz8Kq+i1n8WjmJ+vnpJbBalcUTYGt0CDnUzhES4AAAA=';
const OMDURMAN_BLUR =
  'data:image/webp;base64,UklGRoQAAABXRUJQVlA4IHgAAAAwAgCdASoQAAsAAsBMJbACdADxOaF3+gyYAAD+2GHRSZ2YYECNppx8J1as3W5NinyG6nxiVm2is9s6izACrqMAVWBOon9KBjH7iY3Ih5KX9vXk/p/H2akMzt6KJtkHVRNKJysPC+XCSnqHi+RqpICKN9w0BbSWgAA=';

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
    image: cdn.product("destinations/khartoum.jpg"),
    blur: KHARTOUM_BLUR,
    backgroundColor: '#CC2D4A'
  },
  {
    id: '2',
    title: 'Port Sudan',
    titleAr: 'بورتسودان',
    distance: 'Red Sea coast',
    distanceAr: 'ساحل البحر الأحمر',
    image: cdn.product("destinations/port-sudan.jpg"),
    blur: PORT_SUDAN_BLUR,
    backgroundColor: '#BC1A6E'
  },
  {
    id: '3',
    title: 'Omdurman',
    titleAr: 'أم درمان',
    distance: 'Historic city',
    distanceAr: 'مدينة تاريخية',
    image: cdn.product("destinations/omdurman.jpg"),
    blur: OMDURMAN_BLUR,
    backgroundColor: '#DE3151'
  },
  {
    id: '4',
    title: 'Juba',
    titleAr: 'جوبا',
    distance: 'Southern region',
    distanceAr: 'المنطقة الجنوبية',
    image: cdn.product("destinations/khartoum.jpg"),
    blur: KHARTOUM_BLUR,
    backgroundColor: '#D93B30'
  }
];

const AirbnbInspiration: React.FC<AirbnbInspirationProps> = ({
  destinations = defaultDestinations,
  className = "",
}) => {
  const { locale } = useLocale();
  const dict = useDictionary();

  return (
    <div className={`w-full ${className}`}>
      {/* Section Title */}
      <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 mb-6">
        {dict.home?.inspiration?.title}
      </h2>

      {/* Destination Cards Grid — each card navigates to /search scoped to that
          city. The city's ENGLISH name is the canonical URL token (matches the
          DB `location.city` the search action filters on); display stays
          localized. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        {destinations.map((destination) => (
          <Link
            key={destination.id}
            href={`/${locale}/search?location=${encodeURIComponent(destination.title)}`}
            aria-label={locale === 'ar' ? destination.titleAr : destination.title}
            className="cursor-pointer rounded-sm overflow-hidden flex flex-col h-80 transition-transform duration-200 hover:-translate-y-0.5"
          >
            {/* Image Section */}
            <div className="relative h-40 overflow-hidden bg-muted">
              <BlurImage
                src={destination.image}
                alt={destination.title}
                blurDataURL={destination.blur}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
              />
            </div>

            {/* Info Section with Custom Color */}
            <div 
              className="h-40 p-4 text-white flex flex-col "
              style={{ backgroundColor: destination.backgroundColor }}
            >
              <h3 className="text-lg font-semibold mb-1">
                {locale === 'ar' ? destination.titleAr : destination.title}
              </h3>
              <p className="text-sm opacity-90 text-white">
                {locale === 'ar' ? destination.distanceAr : destination.distance}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AirbnbInspiration; 