"use client";

import React from 'react';
import ListingSidebar from '@/components/hosting/listing/listing-sidebar';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

const Layout = ({ children, params }: LayoutProps) => {
  const [listingId, setListingId] = React.useState<string>('');

  React.useEffect(() => {
    params.then((resolvedParams) => {
      setListingId(resolvedParams.id);
    });
  }, [params]);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <ListingSidebar listingId={listingId} />
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;
