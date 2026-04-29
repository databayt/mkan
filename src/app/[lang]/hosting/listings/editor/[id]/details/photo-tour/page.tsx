"use client";

// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { use } from 'react';
import PhotoTour from '@/components/hosting/listing/photo-tour';

interface PhotoTourPageProps {
  params: Promise<{ id: string }>;
}

const PhotoTourPage = ({ params }: PhotoTourPageProps) => {
  // React 19 / Next 16: unwrap the params promise via `use()` instead of
  // useEffect+setState. The previous implementation flashed an empty
  // listing id on first paint and threw "params is a Promise" warnings.
  const { id: listingId } = use(params);
  return <PhotoTour listingId={listingId} />;
};

export default PhotoTourPage;
