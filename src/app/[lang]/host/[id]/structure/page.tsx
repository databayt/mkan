"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import HostStepLayout from '@/components/host/host-step-layout';
import PropertySelector, { mapPropertyTypeToPrisma } from '@/components/host/property-type-selector';
import { useListing } from '@/components/host/use-listing';
import { useHostValidation } from '@/context/host-validation-context';

interface StructurePageProps {
  params: Promise<{ id: string }>;
}

const StructurePageContent = ({ params }: StructurePageProps) => {
  const router = useRouter();
  const [id, setId] = React.useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const { enableNext, disableNext } = useHostValidation();
  const { listing, updateListingData, loadListing } = useListing();

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

  // Load existing property type from listing
  React.useEffect(() => {
    if (listing?.propertyType) {
      setSelectedType(listing.propertyType.toLowerCase());
    }
  }, [listing]);

  // Initialize with disabled state since no property type is selected
  React.useEffect(() => {
    disableNext();
  }, [disableNext]);

  // Enable/disable next button based on property selection
  React.useEffect(() => {
    if (selectedType) {
      enableNext();
    } else {
      disableNext();
    }
  }, [selectedType, enableNext, disableNext]);

  const handlePropertySelect = async (typeId: string) => {
    setSelectedType(typeId);
    
    // Update backend data using the mapping function
    try {
      const prismaPropertyType = mapPropertyTypeToPrisma(typeId);
      await updateListingData({
        propertyType: prismaPropertyType
      });
    } catch (error) {
      console.error('Error updating property type:', error);
    }
  };

  return (
    <HostStepLayout
      title={
        <h3>Which of these best <br /> describes your place?</h3>
      }
    >
      <PropertySelector
        selectedType={selectedType}
        onSelect={handlePropertySelect}
        compact={true}
      />
    </HostStepLayout>
  );
};

export default StructurePageContent; 