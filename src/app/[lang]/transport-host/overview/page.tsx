"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import TransportStepsOverview from '@/components/transport/transport-steps-overview';
import { createTransportOffice } from '@/lib/actions/transport-actions';

export const dynamic = 'force-dynamic';

const TransportOverviewPage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleGetStarted = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const result = await createTransportOffice({
        name: 'New Transport Office',
      });

      if (result.success && result.office) {
        router.push(`/transport-host/${result.office.id}/office-info`);
      } else {
        console.error('Failed to create office');
      }
    } catch (error) {
      console.error('Error creating office:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      <TransportStepsOverview onGetStarted={handleGetStarted} isLoading={isLoading} />
    </div>
  );
};

export default TransportOverviewPage;
