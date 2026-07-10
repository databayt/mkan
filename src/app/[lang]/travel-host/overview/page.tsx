"use client";

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import OnboardingStepsOverview from '@/components/onboarding/onboarding-steps-overview';
import { TRANSPORT_OVERVIEW_CONFIG } from '@/components/onboarding/configs';
import { createTransportOffice } from '@/lib/actions/travel-actions';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import Loading from '@/components/atom/loading';
import { useDictionary } from '@/components/internationalization/dictionary-context';

export const dynamic = 'force-dynamic';

const TransportOverviewPage = () => {
  const router = useRouter();
  const params = useParams();
  const lang = (params.lang as string) ?? 'en';
  const { session, status } = useAuthRedirect();
  const [isLoading, setIsLoading] = useState(false);
  const dict = useDictionary();
  const t = dict?.transportHost?.onboardingLanding;

  const handleGetStarted = () => {
    router.push(`/${lang}/travel-host/new/office-info`);
  };

  if (status === 'loading') {
    return <Loading variant="fullscreen" text={t?.loadingText ?? 'Loading...'} />;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="h-screen overflow-hidden">
      <OnboardingStepsOverview
        config={TRANSPORT_OVERVIEW_CONFIG}
        onGetStarted={handleGetStarted}
        isLoading={isLoading}
      />
    </div>
  );
};

export default TransportOverviewPage;
