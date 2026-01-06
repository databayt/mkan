"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import HostStepLayout from '@/components/host/host-step-layout';
import AmenitySelector, { mapAmenityToPrisma } from '@/components/host/amenity-selector';
import { useListing } from '@/components/host/use-listing';
import { useHostValidation } from '@/context/host-validation-context';

interface AmenitiesPageProps {
  params: Promise<{ id: string }>;
}

const AmenitiesPageContent = ({ params }: AmenitiesPageProps) => {
  const router = useRouter();
  const [id, setId] = React.useState<string>('');
  const { enableNext } = useHostValidation();
  const { listing, updateListingData, loadListing } = useListing();
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

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

  // Load existing amenities from listing
  React.useEffect(() => {
    if (listing?.amenities) {
      setSelectedAmenities(listing.amenities.map(a => a.toLowerCase().replace(/_/g, '-')));
    }
  }, [listing]);

  // Enable next button since amenities are optional
  React.useEffect(() => {
    enableNext();
  }, [enableNext]);

  const toggleAmenity = async (amenityId: string) => {
    const newSelectedAmenities = selectedAmenities.includes(amenityId)
      ? selectedAmenities.filter(id => id !== amenityId)
      : [...selectedAmenities, amenityId];
    
    setSelectedAmenities(newSelectedAmenities);

    // Update backend data using the mapping function
    try {
      // Convert frontend amenity IDs to backend enum values
      const backendAmenities = newSelectedAmenities.map(amenityId => 
        mapAmenityToPrisma(amenityId)
      );
      
      await updateListingData({
        amenities: backendAmenities
      });
    } catch (error) {
      console.error('Error updating amenities:', error);
    }
  };

  return (
    <HostStepLayout
      title={
        <h3>Tell guests what <br /> your place has to offer</h3>
      }
      subtitle="You can add more amenities after you publish your listing."
    >
      <AmenitySelector
        selectedAmenities={selectedAmenities}
        onToggle={toggleAmenity}
      />
    </HostStepLayout>
  );
};

export default AmenitiesPageContent; 