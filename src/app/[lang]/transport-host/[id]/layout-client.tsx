"use client"

import React, { useEffect } from 'react'
import { useParams } from 'next/navigation'
import OnboardingFooter from '@/components/onboarding/onboarding-footer'
import { TRANSPORT_FOOTER_CONFIG } from '@/components/onboarding/configs'
import { TransportHostValidationProvider, useTransportHostValidation } from '@/context/onboarding-validation-context'
import { TransportOfficeProvider, useTransportOffice } from '@/context/transport-office-context'

interface TransportHostLayoutClientProps {
  children: React.ReactNode
}

function TransportHostLayoutContent({ children }: TransportHostLayoutClientProps) {
  const params = useParams()
  const { loadOffice } = useTransportOffice()
  const officeId = params.id ? parseInt(params.id as string, 10) : null

  useEffect(() => {
    if (officeId) {
      loadOffice(officeId)
    }
  }, [officeId, loadOffice])

  return (
    <div className="px-4 sm:px-6 md:px-12 lg:px-20 bg-background min-h-screen">
      <main id="main-content" className="h-screen pt-16 sm:pt-20 pb-24">
        {children}
      </main>
      <OnboardingFooter
        config={TRANSPORT_FOOTER_CONFIG}
        useValidation={useTransportHostValidation}
      />
    </div>
  )
}

export default function TransportHostLayoutClient({ children }: TransportHostLayoutClientProps) {
  return (
    <TransportOfficeProvider>
      <TransportHostValidationProvider>
        <TransportHostLayoutContent>
          {children}
        </TransportHostLayoutContent>
      </TransportHostValidationProvider>
    </TransportOfficeProvider>
  )
}
