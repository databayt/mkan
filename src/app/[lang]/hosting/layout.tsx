"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import HostingHeader from '@/components/hosting/hosting-header';
import NotificationCard from '@/components/hosting/notification-card';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';

interface HostingLayoutProps {
  children: React.ReactNode;
}

const HostingLayout = ({ children }: HostingLayoutProps) => {
  const router = useRouter();
  const { session, status } = useAuthRedirect();

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
    <div className="min-h-screen">
      <NotificationCard
            subtitle="hello mkan"
            title="Confirm a few key details"
            description="Required to publish"
          />
      <HostingHeader />
      
      <main className="px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
};

export default HostingLayout;
