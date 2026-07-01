"use client"

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ListingFormData, updateListing, getListing } from './actions'

// Types
export interface Listing extends ListingFormData {
  id?: number
  createdAt?: Date
  updatedAt?: Date
  postedDate?: Date | null
}

// The Prisma payload returned by the listing actions. createListing,
// getListing and updateListing all use the same `include: { location, host }`,
// so deriving the mapper's input from getListing keeps it in lockstep with the
// server contract — add a field server-side and the type surfaces it here.
type ListingPayload = Awaited<ReturnType<typeof getListing>>

/**
 * Single source of truth for the Prisma listing → client `Listing` mapping.
 * This block used to be copy-pasted in create/load/update; a new field had to
 * be added in three places or it silently vanished from the onboarding UI.
 */
function mapPrismaListingToClient(src: ListingPayload): Listing {
  return {
    id: src.id,
    title: src.title ?? undefined,
    description: src.description ?? undefined,
    pricePerNight: src.pricePerNight ?? undefined,
    securityDeposit: src.securityDeposit ?? undefined,
    applicationFee: src.applicationFee ?? undefined,
    bedrooms: src.bedrooms ?? undefined,
    bathrooms: src.bathrooms ?? undefined,
    squareFeet: src.squareFeet ?? undefined,
    guestCount: src.guestCount ?? undefined,
    propertyType: src.propertyType ?? undefined,
    isPetsAllowed: src.isPetsAllowed ?? undefined,
    isParkingIncluded: src.isParkingIncluded ?? undefined,
    instantBook: src.instantBook ?? undefined,
    amenities: src.amenities ?? undefined,
    highlights: src.highlights ?? undefined,
    photoUrls: src.photoUrls ?? undefined,
    draft: src.draft ?? undefined,
    isPublished: src.isPublished ?? undefined,
    // Location data (flattened from the related Location row)
    address: src.location?.address ?? undefined,
    city: src.location?.city ?? undefined,
    state: src.location?.state ?? undefined,
    country: src.location?.country ?? undefined,
    postalCode: src.location?.postalCode ?? undefined,
    latitude: src.location?.latitude ?? undefined,
    longitude: src.location?.longitude ?? undefined,
  }
}

interface ListingContextType {
  listing: Listing | null
  isLoading: boolean
  error: string | null
  setListing: (listing: Listing | null) => void
  updateListingData: (data: Partial<ListingFormData>) => Promise<void>
  loadListing: (id: number) => Promise<void>
  clearError: () => void
}

const ListingContext = createContext<ListingContextType | undefined>(undefined)

// Provider component
interface ListingProviderProps {
  children: React.ReactNode
  initialListing?: Listing | null
}

export function ListingProvider({ children, initialListing = null }: ListingProviderProps) {
  const [listing, setListing] = useState<Listing | null>(initialListing)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dedupe loads. The host layout loads the listing once on mount, and every
  // step page also calls loadListing on its own mount — without a guard that is
  // N+1 identical getListing round-trips per onboarding session. Track the id
  // already loaded (or in flight) and skip repeat fetches for the same id.
  const loadedIdRef = useRef<number | null>(initialListing?.id ?? null)
  const inFlightIdRef = useRef<number | null>(null)

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const loadListing = useCallback(async (id: number) => {
    // Already have this listing in context, or a load for it is already running.
    if (loadedIdRef.current === id || inFlightIdRef.current === id) return

    inFlightIdRef.current = id
    setIsLoading(true)
    setError(null)

    try {
      const result = await getListing(id)
      setListing(mapPrismaListingToClient(result))
      loadedIdRef.current = id
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load listing'
      setError(errorMessage)
    } finally {
      if (inFlightIdRef.current === id) inFlightIdRef.current = null
      setIsLoading(false)
    }
  }, [])

  const updateListingData = useCallback(async (data: Partial<ListingFormData>) => {
    const id = listing?.id
    if (!id) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await updateListing(id, data)

      if (result.success && result.listing) {
        setListing(mapPrismaListingToClient(result.listing))
        // The mutation already returned fresh data — mark it loaded so a step
        // page mounting afterwards doesn't re-fetch and clobber it.
        loadedIdRef.current = id
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update listing'
      console.error('❌ Error updating listing:', errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [listing?.id])

  // Memoize context value so consumers don't re-render on unrelated parent renders.
  const contextValue = useMemo<ListingContextType>(
    () => ({
      listing,
      isLoading,
      error,
      setListing,
      updateListingData,
      loadListing,
      clearError,
    }),
    [listing, isLoading, error, updateListingData, loadListing, clearError]
  )

  return (
    <ListingContext.Provider value={contextValue}>
      {children}
    </ListingContext.Provider>
  )
}

// Hook to use the listing context
export function useListing() {
  const context = useContext(ListingContext)
  if (context === undefined) {
    throw new Error('useListing must be used within a ListingProvider')
  }
  return context
}

// Helper hook for navigation between steps
export function useHostNavigation(currentStep: string) {
  const router = useRouter()
  const { listing } = useListing()

  const goToStep = useCallback((step: string) => {
    if (!listing?.id) {
      console.warn('⚠️ No listing ID available for navigation')
      return
    }
    router.push(`/host/${listing.id}/${step}`)
  }, [listing, router])

  // Wrap goToStep one level — the new react-hooks/preserve-manual-memoization rule
  // wants both wrappers themselves memoized (not just the inner one they call).
  const goToNextStep = useCallback((nextStep: string) => {
    goToStep(nextStep)
  }, [goToStep])

  const goToPreviousStep = useCallback((previousStep: string) => {
    goToStep(previousStep)
  }, [goToStep])

  const goToOverview = useCallback(() => {
    router.push('/host/overview')
  }, [router])

  return {
    goToStep,
    goToNextStep,
    goToPreviousStep,
    goToOverview,
    currentListingId: listing?.id,
  }
} 