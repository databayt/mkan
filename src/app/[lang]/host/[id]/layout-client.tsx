"use client"

import React, { useEffect } from 'react'
import { useParams } from 'next/navigation'
import OnboardingFooter from '@/components/onboarding/onboarding-footer'
import { HOST_FOOTER_CONFIG } from '@/components/onboarding/configs'
import { HostValidationProvider, useHostValidation } from '@/context/onboarding-validation-context'
import { ListingProvider, useListing } from '@/components/host/use-listing'

interface HostLayoutClientProps {
  children: React.ReactNode
}

function HostLayoutContent({ children }: HostLayoutClientProps) {
  const params = useParams()
  const { loadListing } = useListing()
  const listingId = params.id ? parseInt(params.id as string, 10) : null

  useEffect(() => {
    if (listingId) {
      loadListing(listingId)
    }
  }, [listingId, loadListing])

  return (
    <div className="px-4 sm:px-6 md:px-12 lg:px-20 bg-background min-h-screen">
      {/* Main content with padding to account for fixed footer */}
      <main id="main-content" className="h-screen pt-16 sm:pt-20">
        {children}
      </main>

      {/* Footer with embedded navigation */}
      <OnboardingFooter
        config={HOST_FOOTER_CONFIG}
        useValidation={useHostValidation}
      />
    </div>
  )
}

export default function HostLayoutClient({ children }: HostLayoutClientProps) {
  return (
    <ListingProvider>
      <HostValidationProvider>
        <HostLayoutContent>
          {children}
        </HostLayoutContent>
      </HostValidationProvider>
    </ListingProvider>
  )
}
