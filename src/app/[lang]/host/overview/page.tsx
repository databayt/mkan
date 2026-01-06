"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingStepsOverview, HOST_OVERVIEW_CONFIG } from '@/components/onboarding';
import { createListing } from '@/components/host/actions';

// Disable static generation for this page
export const dynamic = 'force-dynamic';

const OverviewPage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = async () => {
    setIsLoading(true);
    try {
      // Create a new listing in the database
      const result = await createListing({ draft: true });

      if (result.success && result.listing) {
        // Navigate to the first step with the actual listing ID
        router.push(`/host/${result.listing.id}/about-place`);
      } else {
        console.error('Failed to create listing');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error creating listing:', error);
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      <OnboardingStepsOverview
        config={HOST_OVERVIEW_CONFIG}
        onGetStarted={handleGetStarted}
        isLoading={isLoading}
      />
    </div>
  );
};

export default OverviewPage; 