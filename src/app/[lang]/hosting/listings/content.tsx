"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ListView, GridView } from '@/components/atom/property-icons';
import { getHostListings } from '@/components/host/actions';
import { useSession } from 'next-auth/react';
import ListingCard from '@/components/hosting/listing/listing-card';
import { Listing } from '@/types/listing';
import { useDictionary } from '@/components/internationalization/dictionary-context';

export default function HostingListingsContent() {
  const router = useRouter();
  const dict = useDictionary();
  const { data: session, status } = useSession();
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid');
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListings = async () => {
      if (status === 'loading') return;

      try {
        setIsLoading(true);
        setError(null);
        const hostListings = await getHostListings(session?.user?.id);
        setListings(hostListings);
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError('Failed to load your listings. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchListings();
  }, [session, status]);

  const toggleViewType = () => {
    setViewType(viewType === 'grid' ? 'list' : 'grid');
  };

  if (status === 'loading' || isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">{dict.hosting?.listingsPage?.loading ?? "Loading your listings..."}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-red-500 text-center">
            <p className="mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {dict.hosting?.listingsPage?.tryAgain ?? "Try Again"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6 sm:py-8">
        {/* Airbnb host header — big serifless title start-aligned, 40px circle
            actions trailing on the SAME row (mobile keeps title + [search, plus]
            like the Airbnb app; the grid/list toggle is desktop-only). */}
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <h1 className="text-[26px] sm:text-3xl font-semibold tracking-tight text-gray-900">{dict.hosting?.listingsPage?.title ?? "Your listings"}</h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              aria-label={dict.hosting?.listingsPage?.search ?? "Search"}
              className="flex size-10 items-center justify-center bg-muted rounded-full hover:bg-muted/80 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={toggleViewType}
              aria-label={dict.hosting?.listingsPage?.toggleView ?? "Toggle view"}
              className="hidden sm:flex size-10 items-center justify-center bg-muted rounded-full hover:bg-muted/80 transition-colors"
            >
              {viewType === 'grid' ? (
                <ListView size={16} />
              ) : (
                <GridView size={16} />
              )}
            </button>
            <button
              onClick={() => router.push('/host/overview')}
              aria-label={dict.hosting?.listingsPage?.createListing ?? "Create listing"}
              className="flex size-10 items-center justify-center bg-muted rounded-full hover:bg-muted/80 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Empty state — centered copy + quiet muted button, like the live
            "Create a listing with Airbnb Setup" screen. */}
        {listings.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center sm:py-20">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-foreground">
              <Plus className="size-7" strokeWidth={1.5} />
            </div>
            <p className="mt-8 max-w-[300px] text-base text-foreground">
              {dict.hosting?.listingsPage?.noListingsDescription ?? "Get started by creating your first listing."}
            </p>
            <button
              onClick={() => router.push('/host/overview')}
              className="mt-6 rounded-lg bg-muted px-5 py-[11px] text-sm font-medium text-foreground transition-colors hover:bg-muted/70"
            >
              {dict.hosting?.listingsPage?.createListing ?? "Create Listing"}
            </button>
          </div>
        )}

        {/* Listings Grid */}
        {listings.length > 0 && (
          <div className={`grid ${viewType === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'} gap-8 sm:gap-4`}>
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                viewType={viewType}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
