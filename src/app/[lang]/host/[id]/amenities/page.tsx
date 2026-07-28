"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import HostStepLayout from '@/components/host/host-step-layout';
import AmenitySelector, { mapAmenityToPrisma } from '@/components/host/amenity-selector';
import { useListing } from '@/components/host/use-listing';
import { useHostValidation } from '@/context/onboarding-validation-context';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface AmenitiesPageProps {
  params: Promise<{ id: string }>;
}

const AmenitiesPageContent = ({ params }: AmenitiesPageProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const dict = useDictionary();
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

    // Convert the picker's ids to enum values. An id the map doesn't know
    // yields null and is dropped — persisting a guess would put an amenity on
    // the listing that the host never selected. Dedupe because two ids can
    // share a value (free and paid parking are both Parking).
    try {
      const backendAmenities = [
        ...new Set(
          newSelectedAmenities
            .map(mapAmenityToPrisma)
            .filter((a): a is NonNullable<typeof a> => a !== null)
        ),
      ];

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
        <h3>{dict.hosting.pages.amenities.title}</h3>
      }
      subtitle={dict.hosting.pages.amenities.subtitle}
    >
      <AmenitySelector
        selectedAmenities={selectedAmenities}
        onToggle={toggleAmenity}
      />
    </HostStepLayout>
  );
};

export default AmenitiesPageContent; 