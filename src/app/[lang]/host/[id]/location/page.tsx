"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React from 'react';
import { useRouter } from 'next/navigation';
import { HostStepLayout } from '@/components/host';
import { useHostValidation } from '@/components/onboarding';
import { ListingProvider, useListing } from '@/components/host/use-listing';
import { LocationForm } from '@/components/host/location/form';

interface LocationPageProps {
  params: Promise<{ id: string }>;
}

const LocationPageContent = ({ params }: LocationPageProps) => {
  const router = useRouter();
  const [id, setId] = React.useState<string>('');
  const { listing, loadListing } = useListing();

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

  return (
    <div className="">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
          {/* Left side - Text content */}
          <div className="space-y-4">
            <h3>
              Where's your place
              <br />
              located?
            </h3>
            <p>
              Your address is only shared with guests after they make a reservation.
            </p>
          </div>

          {/* Right side - Location Form */}
          <div>
            <LocationForm />
          </div>
        </div>
      </div>
    </div>
  );
};

const LocationPage = ({ params }: LocationPageProps) => {
  return (
    <ListingProvider>
      <LocationPageContent params={params} />
    </ListingProvider>
  );
};

export default LocationPage; 