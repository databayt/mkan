"use client";
// Disable static generation for this page
export const dynamic = 'force-dynamic';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import NotificationCard from '@/components/hosting/notification-card';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';

const HostingPage = () => {
  const router = useRouter();
  const { session, status } = useAuthRedirect();
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming'>('today');

  // Show loading while checking session
  if (status === 'loading') {
    return <Loading variant="fullscreen" text="Loading..." />;
  }

  // Don't render if not authenticated
  if (!session) {
    return null; // Will redirect in useEffect
  }

  return (
    <>
      {/* Notification Row */}
      {/* <NotificationCard
            subtitle="hello mkan"
            title="Confirm a few key details"
            description="Required to publish"
          /> */}
          
       

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 bg-white">
        {/* Toggle Buttons */}
        <div className="flex justify-center items-center space-x-4 mb-8 sm:mb-16">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-6 py-3 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all border min-h-[44px] sm:min-h-[32px] ${
              activeTab === 'today'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:text-gray-900 hover:border-gray-400'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-6 py-3 sm:px-4 sm:py-2 rounded-full text-sm font-medium transition-all border min-h-[44px] sm:min-h-[32px] ${
              activeTab === 'upcoming'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:text-gray-900 hover:border-gray-400'
            }`}
          >
            Upcoming
          </button>
        </div>

        {/* Content Area */}
        <div className="flex flex-col items-center justify-center ">
          {/* Today Image */}
          <div className="">
            <Image
              src="/hosting/today.png"
              alt="Today illustration"
              width={150}
              height={150}
              className="object-contain sm:w-[200px] sm:h-[200px]"
            />
          </div>

          {/* Empty State Text */}
          <div className="text-center">
            <p className="text-gray-500 text-base sm:text-lg">
              {activeTab === 'today' ? 'You don\'t have any reservations' : 'You don\'t have any upcoming reservations'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default HostingPage;