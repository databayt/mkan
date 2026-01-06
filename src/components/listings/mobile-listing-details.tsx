"use client";

import React, { useState, useRef, TouchEvent } from 'react';
import Image from 'next/image';
import { ArrowLeft, MapPin, Bed, Bath, Users, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShareIcon, HeartIcon, Superhost } from '@/components/atom/icons';
import { useRouter } from 'next/navigation';
import MobileMap from './mobile-map';
import MobileInfo from './mobile-info';
import MobileAmenities from './mobile-amenities';
// import MobileReviewsDetail from './mobile-reviews-detail';
import MobileMeetHost from './mobile-meet-host';

interface MobileListingDetailsProps {
  listing: any;
  images?: string[];
  onSave?: () => void;
  isSaved?: boolean;
  onShare?: () => void;
}

const MobileListingDetails: React.FC<MobileListingDetailsProps> = ({
  listing,
  images = [],
  onSave,
  isSaved = false,
  onShare
}) => {
  const router = useRouter();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const handlePrevious = () => {
    setCurrentImageIndex((prev) => 
      prev === 0 ? displayImages.length - 1 : prev - 1
    );
  };

  const handleNext = () => {
    setCurrentImageIndex((prev) => 
      prev === displayImages.length - 1 ? 0 : prev + 1
    );
  };

  // Touch handlers for swipe
  const onTouchStart = (e: TouchEvent) => {
    setTouchEnd(null);
    const touch = e.targetTouches[0];
    if (touch) {
      setTouchStart(touch.clientX);
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    const touch = e.targetTouches[0];
    if (touch) {
      setTouchEnd(touch.clientX);
    }
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      handleNext();
    }
    if (isRightSwipe) {
      handlePrevious();
    }
  };

  const handleBack = () => {
    router.back();
  };

  // If no images, use placeholder
  const displayImages = images && images.length > 0 ? images : ['/placeholder.svg?height=500&width=600'];
  
  // Debug logging
  console.log('Mobile Listing Details - Images:', images);
  console.log('Mobile Listing Details - Display Images:', displayImages);
  console.log('Mobile Listing Details - Current Index:', currentImageIndex);

  // Safely format location string
  const getLocationString = () => {
    if (!listing?.location) return 'Location';
    if (typeof listing.location === 'string') return listing.location;
    return `${listing.location.city || ''}, ${listing.location.state || ''}`.trim() || 'Location';
  };

  // Handle share functionality
  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: listing.title || "Property Listing",
        url: window.location.href,
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
    }
  };

  // Handle save functionality
  const handleSave = () => {
    console.log("Save listing:", listing.id);
  };

  return (
    <div className="md:hidden">
             {/* Full Screen Image Gallery */}
       <div 
         className="relative w-full h-[50vh] bg-black"
         onTouchStart={onTouchStart}
         onTouchMove={onTouchMove}
         onTouchEnd={onTouchEnd}
       >
        {/* Current Image */}
        <Image
          src={displayImages[currentImageIndex] ?? '/placeholder.svg?height=500&width=600'}
          alt={`Property image ${currentImageIndex + 1}`}
          fill
          className="object-cover"
          priority
          onError={(e) => {
            console.error('Image failed to load:', displayImages[currentImageIndex]);
            // Fallback to placeholder if image fails
            const target = e.target as HTMLImageElement;
            target.src = '/placeholder.svg?height=500&width=600';
          }}
        />

        {/* Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

                 {/* Top Navigation Bar */}
         <div className="absolute top-0 left-0 right-0 z-10 p-4">
           <div className="flex items-center justify-between">
             {/* Left Side - Back Button */}
             <Button
               variant="ghost"
               size="icon"
               onClick={handleBack}
               className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white"
             >
               <ArrowLeft className="w-5 h-5 text-gray-700" />
             </Button>

             {/* Right Side - Share and Love */}
             <div className="flex items-center space-x-3">
               <Button
                 variant="ghost"
                 size="icon"
                 onClick={handleShare}
                 className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white"
               >
                 <ShareIcon className="w-5 h-5 text-gray-700" />
               </Button>
               
               <Button
                 variant="ghost"
                 size="icon"
                 onClick={handleSave}
                 className="h-10 w-10 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white"
               >
                 <HeartIcon className={`w-5 h-5 ${isSaved ? 'fill-red-500 text-red-500' : 'text-gray-700'}`} />
               </Button>
             </div>
           </div>
         </div>

                 {/* Image Counter */}
         {displayImages.length > 1 && (
           <div className="absolute bottom-4 right-4">
             <div className="bg-black/50 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm">
               {currentImageIndex + 1} / {displayImages.length}
             </div>
           </div>
         )}
      </div>

      {/* Property Info */}
      <div className="px-4 py-6 space-y-6">
        {/* Title and Rating */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            {listing?.title || 'Beautiful Property'}
          </h1>
          
          <div className="flex items-center space-x-2 text-gray-600 mb-4">
            <span className="text-sm">★ 4.8</span>
            <span className="text-sm">·</span>
            <span className="text-sm underline">128 reviews</span>
            <span className="text-sm">·</span>
            <span className="text-sm underline">
              {getLocationString()}
            </span>
          </div>
        </div>

        {/* Property Details */}
        <div className="border-b border-gray-200 pb-6">
          {/* <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              {listing?.title || "Beautiful Property"}
            </h2>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-sm">
                {listing?.propertyType || "Property"}
              </Badge>
              {listing?.isPetsAllowed && (
                <Badge variant="secondary" className="text-sm">
                  Pet Friendly
                </Badge>
              )}
            </div>
          </div> */}

          {/* Property Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            {listing?.bedrooms && (
              <div className="flex items-center space-x-2">
                <Bed className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  {listing.bedrooms} bedroom{listing.bedrooms !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {listing?.bathrooms && (
              <div className="flex items-center space-x-2">
                <Bath className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  {listing.bathrooms} bathroom{listing.bathrooms !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            {listing?.guestCount && (
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  Up to {listing.guestCount} guests
                </span>
              </div>
            )}
            {listing?.squareFeet && (
              <div className="flex items-center space-x-2">
                <Square className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">
                  {listing.squareFeet} sq ft
                </span>
              </div>
            )}
          </div>

          {/* Location */}
          {listing?.location && (
            <div className="flex items-center space-x-2 mb-4">
              <MapPin className="w-4 h-4 text-gray-600" />
              <span className="text-sm text-gray-700">
                {listing.location.address}, {listing.location.city}, {listing.location.state}
              </span>
            </div>
          )}

          {/* Description */}
          {listing?.description && (
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-700 leading-relaxed">
                {listing.description}
              </p>
            </div>
          )}
        </div>

                 {/* Hosted By */}
         <div className="flex items-center gap-4 py-6">
           <div className="relative">
             <div className="w-11 h-11 rounded-full overflow-hidden">
               <img
                 src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=48&h=48&fit=crop"
                 alt="Host Faisal"
                 className="w-full h-full object-cover"
               />
             </div>
             {/* Superhost badge overlay positioned more inward */}
             <div className="absolute -bottom-0.5 -right-[5px]">
               <Superhost className="w-4 h-4" />
             </div>
           </div>
           <div className="flex flex-col">
             <h5 className="text-lg font-semibold">Hosted by Faisal</h5>
             <p className="">Superhost · 9 months hosting</p>
           </div>
         </div>

                   {/* Mobile Map */}
          <MobileMap />

          {/* Mobile Info */}
          <MobileInfo />

          {/* Mobile Amenities */}
          <MobileAmenities />

          {/* Mobile Reviews Detail */}
          {/* <MobileReviewsDetail /> */}

          {/* Mobile Meet Host */}
          <MobileMeetHost />
        </div>
      </div>
    );
  };

export default MobileListingDetails; 