"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import ListingCard from './listing-card';
import NewListingOptions from './new-listing-options';

interface Listing {
  id: string;
  title: string;
  startDate: string;
  type: 'house' | 'listing';
}

interface HostDashboardProps {
  hostName?: string;
  listings?: Listing[];
  onListingClick?: (id: string) => void;
  onCreateNew?: () => void;
  onCreateFromExisting?: () => void;
}

const HostDashboard: React.FC<HostDashboardProps> = ({
  hostName = "Abdout",
  listings = [
    {
      id: "1",
      title: "Your House listing started June 7, 2025",
      startDate: "June 7, 2025",
      type: "house"
    },
    {
      id: "2", 
      title: "Your listing started June 7, 2025",
      startDate: "June 7, 2025",
      type: "listing"
    }
  ],
  onListingClick,
  onCreateNew,
  onCreateFromExisting
}) => {
  const pathname = usePathname();
  const isAr = pathname?.startsWith("/ar");

  return (
    <div className="w-full max-w-xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
      {/* Welcome Header */}
      <div>
        <h3 className="mb-3 sm:mb-4 text-lg sm:text-xl lg:text-2xl">
          {isAr ? `مرحباً بعودتك، ${hostName}` : `Welcome back, ${hostName}`}
        </h3>
      </div>

      {/* Finish your listing section */}
      <div className="space-y-2 sm:space-y-3">
        <h5 className="text-base sm:text-lg font-semibold">
          {isAr ? "أكمل إعلانك" : "Finish your listing"}
        </h5>
        
        <div className="space-y-2">
          {listings.map((listing) => (
            <ListingCard
              key={listing.id}
              id={listing.id}
              title={listing.title}
              startDate={listing.startDate}
              type={listing.type}
              onClick={onListingClick}
            />
          ))}
        </div>
      </div>

      {/* Start a new listing section */}
      <NewListingOptions
        onCreateNew={onCreateNew}
        onCreateFromExisting={onCreateFromExisting}
      />
    </div>
  );
};

export default HostDashboard; 