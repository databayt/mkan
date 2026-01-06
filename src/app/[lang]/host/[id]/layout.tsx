"use client";

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  OnboardingFooter,
  HOST_FOOTER_CONFIG,
  HostValidationProvider,
  useHostValidation,
} from '@/components/onboarding';
import { ListingProvider, useListing } from '@/components/host/use-listing';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';

interface HostLayoutProps {
  children: React.ReactNode;
}

function HostLayoutContent({ children }: HostLayoutProps) {
  const params = useParams();
  const router = useRouter();
  const { session, status } = useAuthRedirect();
  const { loadListing } = useListing();
  const listingId = params.id ? parseInt(params.id as string, 10) : null;

  useEffect(() => {
    if (listingId) {
      loadListing(listingId);
    }
  }, [listingId, loadListing]);

  // Show loading while checking session
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!session) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="px-4 sm:px-6 md:px-12 lg:px-20 bg-background min-h-screen">
      {/* Main content with padding to account for fixed footer */}
      <main className="h-screen pt-16 sm:pt-20">
        {children}
      </main>

      {/* Footer with embedded navigation */}
      <OnboardingFooter
        config={HOST_FOOTER_CONFIG}
        useValidation={useHostValidation}
      />
    </div>
  );
}

const HostLayout = ({ children }: HostLayoutProps) => {
  return (
    <ListingProvider>
      <HostValidationProvider>
        <HostLayoutContent>
          {children}
        </HostLayoutContent>
      </HostValidationProvider>
    </ListingProvider>
  );
};

export default HostLayout;
