"use client";

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import HostDashboard from '@/components/host/host-dashboard';
import { getHostListings, createListing } from '@/components/host/actions';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';

export default function BecomeAHostContent() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = pathname.startsWith('/ar') ? 'ar' : 'en';
  const { session, status } = useAuthRedirect();
  const [backendListings, setBackendListings] = useState<any[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Load backend data but don't show loading state to match frontend
  React.useEffect(() => {
    async function loadListings() {
      try {
        const hostListings = await getHostListings();
        setBackendListings(hostListings);
      } catch (error) {
        console.error('Error loading listings:', error);
      }
    }
    loadListings();
  }, []);

  const handleListingClick = (id: string) => {
    // Use backend functionality but preserve frontend behavior
    const backendListing = backendListings.find(listing => listing.id.toString() === id);
    if (backendListing) {
      router.push(`/${currentLocale}/host/${id}/about-place`);
    }
  };

  const handleCreateNew = async () => {
    if (isCreating) return;

    setIsCreating(true);
    // Always navigate to overview page
    router.push(`/${currentLocale}/host/overview`);
    setIsCreating(false);
  };

  const handleCreateFromExisting = () => {
    // TODO: implement create from existing listing
  };

  // Show loading while checking session
  if (status === 'loading') {
    return <Loading variant="fullscreen" text="Loading..." />;
  }

  // Don't render if not authenticated
  if (!session) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen pt-4 sm:pt-6">
      <HostDashboard
        hostName={session.user?.name || "Host"}
        onListingClick={handleListingClick}
        onCreateNew={handleCreateNew}
        onCreateFromExisting={handleCreateFromExisting}
      />
    </div>
  );
}
