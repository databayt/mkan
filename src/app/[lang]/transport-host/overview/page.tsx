"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import TransportStepsOverview from '@/components/transport/transport-steps-overview';
import { createTransportOffice } from '@/lib/actions/transport-actions';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';

export const dynamic = 'force-dynamic';

const TransportOverviewPage = () => {
  const router = useRouter();
  const { session, status } = useAuthRedirect();
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

  if (status === 'loading') {
    return <Loading variant="fullscreen" text="Loading..." />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="h-screen overflow-hidden">
      <TransportStepsOverview onGetStarted={handleGetStarted} isLoading={isLoading} />
    </div>
  );
};

export default TransportOverviewPage;
