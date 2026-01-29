"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ListView, GridView } from '@/components/atom/airbnb-icons';
import { getHostListings } from '@/components/host/actions';
import { useSession } from 'next-auth/react';
import ListingCard from '@/components/hosting/listing/listing-card';
import { Listing } from '@/types/listing';

const HostingListingsPage = () => {
  const router = useRouter();
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
          <div className="text-gray-500">Loading your listings...</div>
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
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 space-y-4 sm:space-y-0">
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900">Your listings</h1>
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button className="p-3 sm:p-2 bg-muted rounded-full hover:bg-muted/80 transition-colors min-h-[44px] sm:min-h-[32px] min-w-[44px] sm:min-w-[32px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <button 
              onClick={toggleViewType}
              className="p-3 sm:p-2 bg-muted rounded-full hover:bg-muted/80 transition-colors min-h-[44px] sm:min-h-[32px] min-w-[44px] sm:min-w-[32px]"
            >
              {viewType === 'grid' ? (
                <ListView size={16} />
              ) : (
                <GridView size={16} />
              )}
            </button>
            <button 
              onClick={() => router.push('/host/overview')}
              className="p-3 sm:p-2 bg-muted rounded-full hover:bg-muted/80 transition-colors min-h-[44px] sm:min-h-[32px] min-w-[44px] sm:min-w-[32px]"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Empty State */}
        {listings.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <div className="mx-auto h-12 w-12 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No listings yet</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating your first listing.</p>
            <div className="mt-4 sm:mt-6">
              <button
                onClick={() => router.push('/host/overview')}
                className="inline-flex items-center px-6 py-3 sm:px-4 sm:py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 min-h-[44px] sm:min-h-[32px]"
              >
                <Plus className="-ml-1 mr-2 h-5 w-5" />
                Create Listing
              </button>
            </div>
          </div>
        )}

        {/* Listings Grid */}
        {listings.length > 0 && (
          <div className={`grid ${viewType === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1'} gap-3 sm:gap-4`}>
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
};

export default HostingListingsPage; 