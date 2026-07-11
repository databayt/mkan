"use client";

import React, { useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import HostDashboard from '@/components/host/host-dashboard';
import { getHostListings } from '@/components/host/actions';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';
import { useDictionary } from '@/components/internationalization/use-dictionary';

type HostListing = Awaited<ReturnType<typeof getHostListings>>[number];

export default function BecomeAHostContent() {
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = pathname.startsWith('/ar') ? 'ar' : 'en';
  const { session, status } = useAuthRedirect();
  const dict = useDictionary();
  const [backendListings, setBackendListings] = useState<HostListing[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  // Load the host's real listings once the session is confirmed. getHostListings
  // resolves the host from auth() server-side, so it needs the session cookie.
  const userId = session?.user?.id;
  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadListings() {
      try {
        const hostListings = await getHostListings();
        if (!cancelled) setBackendListings(hostListings);
      } catch (error) {
        console.error('Error loading listings:', error);
      }
    }
    loadListings();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Only in-progress (unpublished) listings belong in "Finish your listing" —
  // published ones are managed under /hosting/listings. Mapped to the shape the
  // dashboard card renders (title + start date), newest first (query order).
  const dashboardListings = useMemo(() => {
    const dateLocale = currentLocale === 'ar' ? 'ar' : 'en-US';
    return backendListings
      .filter((listing) => !listing.isPublished)
      .map((listing) => {
        const title =
          listing.title ||
          (listing.location
            ? `${listing.location.city}, ${listing.location.state}`
            : '');
        const startDate = new Date(listing.createdAt).toLocaleDateString(
          dateLocale,
          { year: 'numeric', month: 'long', day: 'numeric' }
        );
        const houseTypes = ['Villa', 'Townhouse', 'Cottage', 'Tinyhouse'];
        const type: 'house' | 'listing' =
          listing.propertyType && houseTypes.includes(listing.propertyType)
            ? 'house'
            : 'listing';
        return { id: String(listing.id), title, startDate, type };
      });
  }, [backendListings, currentLocale]);

  const handleListingClick = (id: string) => {
    const backendListing = backendListings.find(
      (listing) => listing.id.toString() === id
    );
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
    return <Loading variant="fullscreen" text={dict?.common?.loading ?? "Loading..."} />;
  }

  // Don't render if not authenticated
  if (!session) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <HostDashboard
        hostName={session.user?.name || "Host"}
        listings={dashboardListings}
        onListingClick={handleListingClick}
        onCreateNew={handleCreateNew}
        onCreateFromExisting={handleCreateFromExisting}
      />
    </div>
  );
}
