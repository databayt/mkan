"use client";

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Listing } from '@/types/listing';
import { Badge } from '@/components/ui/badge';
import { getNextStep } from '@/components/hosting/listing/listing-progress';

interface ListingCardProps {
  listing: Listing;
  viewType: 'grid' | 'list';
}

const ListingCard: React.FC<ListingCardProps> = ({ listing, viewType }) => {
  const router = useRouter();

  const getListingStatus = (listing: Listing) => {
    if (!listing.draft && listing.isPublished) {
      return { 
        label: 'Published', 
        circleColor: 'bg-green-500'
      };
    } else if (listing.draft && !listing.isPublished) {
      // Check if listing has basic info filled (title, description, etc.)
      const hasBasicInfo = listing.title && listing.description && listing.pricePerNight;
      const hasLocation = listing.location;
      const hasPhotos = listing.photoUrls && listing.photoUrls.length > 0;
      
      if (hasBasicInfo && hasLocation && hasPhotos) {
        return { 
          label: 'Action required', 
          circleColor: 'bg-red-500'
        };
      } else {
        return { 
          label: 'In progress', 
          circleColor: 'bg-orange-500'
        };
      }
    } else if (listing.draft && listing.isPublished) {
      return { 
        label: 'Action required', 
        circleColor: 'bg-red-500'
      };
    } else {
      return { 
        label: 'In progress', 
        circleColor: 'bg-orange-500'
      };
    }
  };

  const getListingImage = (listing: Listing): string => {
    if (listing.photoUrls && listing.photoUrls.length > 0) {
      return listing.photoUrls[0] ?? '/assets/hero.jpg';
    }
    return '/assets/hero.jpg'; // Default fallback image
  };

  const getListingTitle = (listing: Listing) => {
    if (listing.title) {
      return listing.title;
    }
    if (listing.location) {
      return `${listing.location.city}, ${listing.location.state}`;
    }
    return 'Untitled Listing';
  };

  const getListingDescription = (listing: Listing) => {
    if (listing.description) {
      return listing.description;
    }
    if (listing.location) {
      return `${listing.location.address}, ${listing.location.city}`;
    }
    return 'No description available';
  };

  const handleCardClick = () => {
    const status = getListingStatus(listing);
    
    if (status.label === 'Published') {
      // Navigate to photo-tour for published listings
      router.push(`/hosting/listings/editor/${listing.id}/details/photo-tour`);
    } else if (status.label === 'Action required') {
      // Navigate to photo-tour for action required
      router.push(`/hosting/listings/editor/${listing.id}/details/photo-tour`);
    } else {
      // Navigate to the next step for in progress listings
      const nextStep = getNextStep(listing);
      if (nextStep === 'photo-tour') {
        router.push(`/hosting/listings/editor/${listing.id}/details/photo-tour`);
      } else {
        router.push(`/host/${listing.id}/${nextStep}`);
      }
    }
  };

  const status = getListingStatus(listing);
  const image = getListingImage(listing);
  const title = getListingTitle(listing);
  const description = getListingDescription(listing);

  return (
    <div 
      className={`cursor-pointer ${viewType === 'list' ? 'flex' : ''}`}
      onClick={handleCardClick}
    >
      <div className="relative p-2 sm:p-2">
        <div className={`${viewType === 'list' ? 'w-48 h-28' : 'aspect-[4/3]'} bg-gray-200 overflow-hidden rounded-lg`}>
          <Image 
            src={image} 
            alt={title}
            width={viewType === 'list' ? 192 : 300}
            height={viewType === 'list' ? 112 : 225}
            className="w-full h-full object-cover rounded-lg"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/assets/hero.jpg';
            }}
          />
        </div>
        <div className="absolute top-3 left-3 sm:top-5 sm:left-5">
          <Badge className="flex items-center gap-1 bg-muted text-foreground text-xs sm:text-sm">
            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${status.circleColor}`}></div>
            {status.label}
          </Badge>
        </div>
      </div>
      
      <div className="p-2 sm:p-3 flex-1">
        <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1 truncate">
          {title}
        </h3>
        
        <p className="text-xs sm:text-sm text-gray-600 mb-2 overflow-hidden text-ellipsis" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {description}
        </p>
        
        {listing.pricePerNight && (
          <p className="text-xs sm:text-sm font-medium text-gray-900">
            ${listing.pricePerNight}/night
          </p>
        )}
        

      </div>
    </div>
  );
};

export default ListingCard;
