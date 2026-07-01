"use client";

import React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface AirbnbImagesProps {
  images: string[];
  onSave?: () => void;
  isSaved?: boolean;
  onShowAllPhotos?: () => void;
  className?: string;
}

const AirbnbImages: React.FC<AirbnbImagesProps> = ({
  images,
  onSave,
  isSaved = false,
  onShowAllPhotos,
  className = "",
}) => {
  const dict = useDictionary();
  const t = dict?.atom?.propertyImages;
  const imageAlt = (n: number) => (t?.imageAlt ?? "Property image {n}").replace("{n}", String(n));
  const viewPhotoN = (n: number) => (t?.viewPhotoN ?? "View property photo {n}").replace("{n}", String(n));

  if (!images || images.length === 0) {
    return (
      <div className={`w-full h-96 bg-gray-200 rounded-xl flex items-center justify-center ${className}`}>
        <span className="text-gray-500">{t?.noImages ?? "No images available"}</span>
      </div>
    );
  }

  const mainImage = images[0]!;
  const thumbnailImages = images.slice(1, 5);
  const totalImages = images.length;

  return (
    <div className={`w-full ${className}`}>
      {/* Mobile version */}
      <div className="md:hidden relative h-[400px] overflow-hidden rounded-xl">
        <Image
          src={mainImage}
          alt={t?.mainImageAlt ?? "Property main image"}
          fill
          className="object-cover"
          sizes="100vw"
        />
        {onSave && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            className="absolute top-4 end-4 bg-white/90 hover:bg-white shadow-md rounded-full p-2"
            aria-label={isSaved ? (t?.removeFromSaved ?? "Remove from saved") : (t?.saveProperty ?? "Save property")}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
              <path 
                d="M7.99996 3.16675L9.16663 6.83341H12.8333L9.83329 9.16675L10.8333 12.8334L7.99996 10.5001L5.16663 12.8334L6.16663 9.16675L3.16663 6.83341H6.83329L7.99996 3.16675Z" 
                stroke={isSaved ? '#DE3151' : '#484848'} 
                strokeWidth="1.5" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                fill={isSaved ? '#DE3151' : 'none'}
              />
            </svg>
          </Button>
        )}
      </div>

      {/* Desktop version */}
      <div className="hidden md:block">
        <div className="grid grid-cols-2 gap-2 h-[400px] overflow-hidden rounded-xl">
          {/* Left half - large image */}
          <button type="button" className="relative h-full cursor-pointer" onClick={onShowAllPhotos} aria-label={t?.viewAllPhotos ?? "View all property photos"}>
            <Image
              src={mainImage}
              alt={t?.mainImageAlt ?? "Property main image"}
              fill
              className="object-cover rounded-ss-md rounded-es-md"
              sizes="(min-width: 768px) 50vw, 100vw"
            />
            {onSave && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSave();
                }}
                className="absolute top-4 end-4 bg-white/90 hover:bg-white shadow-md rounded-full p-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                  <path 
                    d="M7.99996 3.16675L9.16663 6.83341H12.8333L9.83329 9.16675L10.8333 12.8334L7.99996 10.5001L5.16663 12.8334L6.16663 9.16675L3.16663 6.83341H6.83329L7.99996 3.16675Z" 
                    stroke={isSaved ? '#DE3151' : '#484848'} 
                    strokeWidth="1.5" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    fill={isSaved ? '#DE3151' : 'none'}
                  />
                </svg>
              </Button>
            )}
          </button>

          {/* Right half - 2x2 grid of smaller images */}
          <div className="grid grid-cols-2 grid-rows-2 gap-2 h-full">
            <button type="button" className="relative cursor-pointer" onClick={onShowAllPhotos} aria-label={viewPhotoN(2)}>
              <Image
                src={thumbnailImages[0] || mainImage}
                alt={imageAlt(2)}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 25vw, 50vw"
              />
            </button>
            <button type="button" className="relative cursor-pointer" onClick={onShowAllPhotos} aria-label={viewPhotoN(3)}>
              <Image
                src={thumbnailImages[1] || mainImage}
                alt={imageAlt(3)}
                fill
                className="object-cover rounded-se-md"
                sizes="(min-width: 768px) 25vw, 50vw"
              />
            </button>
            <button type="button" className="relative cursor-pointer" onClick={onShowAllPhotos} aria-label={viewPhotoN(4)}>
              <Image
                src={thumbnailImages[2] || mainImage}
                alt={imageAlt(4)}
                fill
                className="object-cover"
                sizes="(min-width: 768px) 25vw, 50vw"
              />
            </button>
            <button type="button" className="relative cursor-pointer" onClick={onShowAllPhotos} aria-label={t?.viewAllPhotos ?? "View all property photos"}>
              <Image
                src={thumbnailImages[3] || mainImage}
                alt={imageAlt(5)}
                fill
                className="object-cover rounded-ee-md"
                sizes="(min-width: 768px) 25vw, 50vw"
              />
              <span className="absolute bottom-4 end-4 bg-white px-3 py-2 rounded-md flex items-center gap-2 text-sm font-medium" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M8 6a2 2 0 1 1-4 0a2 2 0 0 1 4 0m0 6a2 2 0 1 1-4 0a2 2 0 0 1 4 0m-2 8a2 2 0 1 0 0-4a2 2 0 0 0 0 4m8-14a2 2 0 1 1-4 0a2 2 0 0 1 4 0m-2 8a2 2 0 1 0 0-4a2 2 0 0 0 0 4m2 4a2 2 0 1 1-4 0a2 2 0 0 1 4 0m4-10a2 2 0 1 0 0-4a2 2 0 0 0 0 4m2 4a2 2 0 1 1-4 0a2 2 0 0 1 4 0m-2 8a2 2 0 1 0 0-4a2 2 0 0 0 0 4"/>
                </svg>
                {t?.showAllPhotos ?? "Show all photos"}
              </span>
            </button>
          </div>
        </div>
      </div>
      {totalImages > 1 && (
        <Button
          variant="ghost"
          onClick={onShowAllPhotos}
          className="md:hidden absolute bottom-4 end-4 bg-white/90 hover:bg-white shadow-md rounded-lg px-3 py-2 text-sm font-medium text-gray-900"
        >
          <svg className="w-4 h-4 me-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
          </svg>
          {(t?.morePhotos ?? "{count}+ photos").replace("{count}", String(totalImages))}
        </Button>
      )}
    </div>
  );
};

export default AirbnbImages; 