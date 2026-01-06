"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus } from 'lucide-react';
import { useHostValidation } from '@/context/host-validation-context';
import { ListingProvider, useListing } from '@/components/host/use-listing';

interface FloorPlanPageProps {
  params: Promise<{ id: string }>;
}

const FloorPlanPageContent = ({ params }: FloorPlanPageProps) => {
  const router = useRouter();
  const [id, setId] = React.useState<string>('');
  const { enableNext } = useHostValidation();
  const { listing, updateListingData, loadListing } = useListing();
  const [counts, setCounts] = useState({
    guests: 4,
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
  });

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
      // Load the listing data in the background
      const listingId = parseInt(resolvedParams.id);
      if (!isNaN(listingId)) {
        loadListing(listingId).catch(console.error);
      }
    });
  }, [params, loadListing]);

  // Load existing values from listing
  React.useEffect(() => {
    if (listing) {
      setCounts({
        guests: listing.guestCount || 4,
        bedrooms: listing.bedrooms || 1,
        beds: 1, // beds field doesn't exist in schema, keep default
        bathrooms: listing.bathrooms || 1,
      });
    }
  }, [listing]);

  // Enable next button since we have default values
  React.useEffect(() => {
    enableNext();
  }, [enableNext]);

  const updateCount = async (field: keyof typeof counts, delta: number) => {
    const newCounts = {
      ...counts,
      [field]: Math.max(1, counts[field] + delta)
    };
    setCounts(newCounts);

    // Update backend data
    try {
      const updateData: any = {};
      if (field === 'guests') updateData.guestCount = newCounts.guests;
      if (field === 'bedrooms') updateData.bedrooms = newCounts.bedrooms;
      if (field === 'bathrooms') updateData.bathrooms = newCounts.bathrooms;
      // beds field doesn't exist in schema, skip backend update for it
      
      if (Object.keys(updateData).length > 0) {
        await updateListingData(updateData);
      }
    } catch (error) {
      console.error('Error updating floor plan data:', error);
    }
  };

  const CounterRow = ({ 
    label, 
    value, 
    onDecrease, 
    onIncrease 
  }: { 
    label: string; 
    value: number; 
    onDecrease: () => void; 
    onIncrease: () => void; 
  }) => (
    <div className="flex items-center justify-between py-4 sm:py-6 border-b border-border last:border-b-0">
      <div className="text-foreground text-sm sm:text-base font-medium">
        {label}
      </div>
      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={onDecrease}
          disabled={value <= 1}
          className={`w-10 h-10 sm:w-7 sm:h-7 rounded-full border flex items-center justify-center transition-colors min-h-[40px] sm:min-h-[28px] ${
            value <= 1
              ? 'border-muted text-muted-foreground cursor-not-allowed'
              : 'border-muted-foreground text-muted-foreground hover:border-foreground hover:text-foreground active:scale-95'
          }`}
        >
          <Minus size={16} strokeWidth={2} className="sm:w-3.5 sm:h-3.5" />
        </button>
        <span className="w-8 sm:w-2.5 text-center text-lg sm:text-base font-medium">
          {value}
        </span>
        <button
          onClick={onIncrease}
          className="w-10 h-10 sm:w-7 sm:h-7 rounded-full border border-muted-foreground text-muted-foreground hover:border-foreground hover:text-foreground flex items-center justify-center transition-colors min-h-[40px] sm:min-h-[28px] active:scale-95"
        >
          <Plus size={16} strokeWidth={2} className="sm:w-3.5 sm:h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="">
      <div className="items-center justify-center">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-12">
          {/* Left div - Title */}
          <div className="flex-1 flex flex-col">
            <h3 className="">
              Share some basics <br />
              about your place
            </h3>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-muted-foreground">
              You'll add more details later, like bed types.
            </p>
          </div>

          {/* Right div - Counter Controls */}
          <div className="flex-1">
            <div className="bg-background">
              <CounterRow
                label="Guests"
                value={counts.guests}
                onDecrease={() => updateCount('guests', -1)}
                onIncrease={() => updateCount('guests', 1)}
              />
              <CounterRow
                label="Bedrooms"
                value={counts.bedrooms}
                onDecrease={() => updateCount('bedrooms', -1)}
                onIncrease={() => updateCount('bedrooms', 1)}
              />
              <CounterRow
                label="Beds"
                value={counts.beds}
                onDecrease={() => updateCount('beds', -1)}
                onIncrease={() => updateCount('beds', 1)}
              />
              <CounterRow
                label="Bathrooms"
                value={counts.bathrooms}
                onDecrease={() => updateCount('bathrooms', -1)}
                onIncrease={() => updateCount('bathrooms', 1)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FloorPlanPage = ({ params }: FloorPlanPageProps) => {
  return (
    <ListingProvider>
      <FloorPlanPageContent params={params} />
    </ListingProvider>
  );
};

export default FloorPlanPage; 