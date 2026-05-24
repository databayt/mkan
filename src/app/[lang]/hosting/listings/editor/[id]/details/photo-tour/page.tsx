"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React from 'react';
import PhotoTour from '@/components/hosting/listing/photo-tour';
import { useDictionary } from '@/components/internationalization/dictionary-context';

interface PhotoTourPageProps {
  params: Promise<{ id: string }>;
}

const PhotoTourPage = ({ params }: PhotoTourPageProps) => {
  // Subscribe so PhotoTour and child components can read the dictionary.
  useDictionary();
  const [listingId, setListingId] = React.useState<string>('');

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setListingId(resolvedParams.id);
    });
  }, [params]);

  return <PhotoTour listingId={listingId} />;
};

export default PhotoTourPage;