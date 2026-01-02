'use client';

import React, { useEffect } from 'react';
import { useParams } from 'next/navigation';
import TransportHostFooter from '@/components/transport/onboarding/transport-host-footer';
import { TransportHostValidationProvider } from '@/context/transport-host-validation-context';
import { TransportOfficeProvider, useTransportOffice } from '@/context/transport-office-context';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';

interface TransportHostLayoutProps {
  children: React.ReactNode;
}

function TransportHostLayoutContent({ children }: TransportHostLayoutProps) {
  const params = useParams();
  const { session, status } = useAuthRedirect();
  const { loadOffice } = useTransportOffice();
  const officeId = params.id ? parseInt(params.id as string, 10) : null;

  useEffect(() => {
    if (officeId) {
      loadOffice(officeId);
    }
  }, [officeId, loadOffice]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6 md:px-12 lg:px-20 bg-background min-h-screen">
      <main className="h-screen pt-16 sm:pt-20 pb-24">
        {children}
      </main>
      <TransportHostFooter />
    </div>
  );
}

const TransportHostLayout = ({ children }: TransportHostLayoutProps) => {
  return (
    <TransportOfficeProvider>
      <TransportHostValidationProvider>
        <TransportHostLayoutContent>
          {children}
        </TransportHostLayoutContent>
      </TransportHostValidationProvider>
    </TransportOfficeProvider>
  );
};

export default TransportHostLayout;
