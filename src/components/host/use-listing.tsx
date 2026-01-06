"use client"

import React, { createContext, useContext, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ListingFormData, createListing, updateListing, getListing } from './actions'

// Types
export interface Listing extends ListingFormData {
  id?: number
  createdAt?: Date
  updatedAt?: Date
  postedDate?: Date | null
}

interface ListingContextType {
  listing: Listing | null
  isLoading: boolean
  error: string | null
  setListing: (listing: Listing | null) => void
  updateListingData: (data: Partial<ListingFormData>) => Promise<void>
  createNewListing: (data?: Partial<ListingFormData>) => Promise<number | null>
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
  const router = useRouter()

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const createNewListing = useCallback(async (data: Partial<ListingFormData> = {}) => {
    setIsLoading(true)
    setError(null)
    
    try {
      console.log('🎯 Creating new listing with data:', data)
      const result = await createListing({ draft: true, ...data })
      
      if (result.success && result.listing) {
        const newListing: Listing = {
          id: result.listing.id,
          title: result.listing.title ?? undefined,
          description: result.listing.description ?? undefined,
          pricePerNight: result.listing.pricePerNight ?? undefined,
          securityDeposit: result.listing.securityDeposit ?? undefined,
          applicationFee: result.listing.applicationFee ?? undefined,
          bedrooms: result.listing.bedrooms ?? undefined,
          bathrooms: result.listing.bathrooms ?? undefined,
          squareFeet: result.listing.squareFeet ?? undefined,
          guestCount: result.listing.guestCount ?? undefined,
          propertyType: result.listing.propertyType ?? undefined,
          isPetsAllowed: result.listing.isPetsAllowed ?? undefined,
          isParkingIncluded: result.listing.isParkingIncluded ?? undefined,
          instantBook: result.listing.instantBook ?? undefined,
          amenities: result.listing.amenities ?? undefined,
          highlights: result.listing.highlights ?? undefined,
          photoUrls: result.listing.photoUrls ?? undefined,
          draft: result.listing.draft ?? undefined,
          isPublished: result.listing.isPublished ?? undefined,
          // Location data
          address: result.listing.location?.address ?? undefined,
          city: result.listing.location?.city ?? undefined,
          state: result.listing.location?.state ?? undefined,
          country: result.listing.location?.country ?? undefined,
          postalCode: result.listing.location?.postalCode ?? undefined,
          latitude: result.listing.location?.latitude ?? undefined,
          longitude: result.listing.location?.longitude ?? undefined,
        }
        
        setListing(newListing)
        console.log('✅ New listing created:', newListing.id)
        return newListing.id!
      }
      
      throw new Error('Failed to create listing')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      console.error('❌ Error creating listing:', errorMessage)
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadListing = useCallback(async (id: number) => {
    setIsLoading(true)
    setError(null)
    
    try {
      console.log('📥 Loading listing:', id)
      const result = await getListing(id)
      
      const loadedListing: Listing = {
        id: result.id,
        title: result.title ?? undefined,
        description: result.description ?? undefined,
        pricePerNight: result.pricePerNight ?? undefined,
        securityDeposit: result.securityDeposit ?? undefined,
        applicationFee: result.applicationFee ?? undefined,
        bedrooms: result.bedrooms ?? undefined,
        bathrooms: result.bathrooms ?? undefined,
        squareFeet: result.squareFeet ?? undefined,
        guestCount: result.guestCount ?? undefined,
        propertyType: result.propertyType ?? undefined,
        isPetsAllowed: result.isPetsAllowed ?? undefined,
        isParkingIncluded: result.isParkingIncluded ?? undefined,
        instantBook: result.instantBook ?? undefined,
        amenities: result.amenities ?? undefined,
        highlights: result.highlights ?? undefined,
        photoUrls: result.photoUrls ?? undefined,
        draft: result.draft ?? undefined,
        isPublished: result.isPublished ?? undefined,
        // Location data
        address: result.location?.address ?? undefined,
        city: result.location?.city ?? undefined,
        state: result.location?.state ?? undefined,
        country: result.location?.country ?? undefined,
        postalCode: result.location?.postalCode ?? undefined,
        latitude: result.location?.latitude ?? undefined,
        longitude: result.location?.longitude ?? undefined,
      }
      
      setListing(loadedListing)
      console.log('✅ Listing loaded successfully')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load listing'
      console.error('❌ Error loading listing:', errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateListingData = useCallback(async (data: Partial<ListingFormData>) => {
    if (!listing?.id) {
      console.warn('⚠️ No listing ID available for update')
      return
    }

    setIsLoading(true)
    setError(null)
    
    try {
      console.log('🔄 Updating listing:', listing.id, 'with data:', data)
      const result = await updateListing(listing.id, data)
      
      if (result.success && result.listing) {
        const updatedListing: Listing = {
          id: result.listing.id,
          title: result.listing.title ?? undefined,
          description: result.listing.description ?? undefined,
          pricePerNight: result.listing.pricePerNight ?? undefined,
          securityDeposit: result.listing.securityDeposit ?? undefined,
          applicationFee: result.listing.applicationFee ?? undefined,
          bedrooms: result.listing.bedrooms ?? undefined,
          bathrooms: result.listing.bathrooms ?? undefined,
          squareFeet: result.listing.squareFeet ?? undefined,
          guestCount: result.listing.guestCount ?? undefined,
          propertyType: result.listing.propertyType ?? undefined,
          isPetsAllowed: result.listing.isPetsAllowed ?? undefined,
          isParkingIncluded: result.listing.isParkingIncluded ?? undefined,
          instantBook: result.listing.instantBook ?? undefined,
          amenities: result.listing.amenities ?? undefined,
          highlights: result.listing.highlights ?? undefined,
          photoUrls: result.listing.photoUrls ?? undefined,
          draft: result.listing.draft ?? undefined,
          isPublished: result.listing.isPublished ?? undefined,
          // Location data
          address: result.listing.location?.address ?? undefined,
          city: result.listing.location?.city ?? undefined,
          state: result.listing.location?.state ?? undefined,
          country: result.listing.location?.country ?? undefined,
          postalCode: result.listing.location?.postalCode ?? undefined,
          latitude: result.listing.location?.latitude ?? undefined,
          longitude: result.listing.location?.longitude ?? undefined,
        }
        
        setListing(updatedListing)
        console.log('✅ Listing updated successfully')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update listing'
      console.error('❌ Error updating listing:', errorMessage)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [listing?.id])

  const contextValue: ListingContextType = {
    listing,
    isLoading,
    error,
    setListing,
    updateListingData,
    createNewListing,
    loadListing,
    clearError,
  }

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
  }, [listing?.id, router])

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