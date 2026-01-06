"use client"

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { amenitiesSchema, AmenitiesFormData } from './validation'
import { useListing, useHostNavigation } from '../use-listing'
import { STEP_NAVIGATION } from '../constants'
import { Amenity } from '@prisma/client'

export function useAmenities() {
  const { listing, updateListingData, isLoading, error } = useListing()
  const { goToNextStep, goToPreviousStep } = useHostNavigation('amenities')

  const form = useForm<AmenitiesFormData>({
    resolver: zodResolver(amenitiesSchema),
    defaultValues: {
      amenities: listing?.amenities || [],
    },
    mode: 'onChange',
  })

  const selectedAmenities = form.watch('amenities')

  const toggleAmenity = (amenity: Amenity) => {
    const currentAmenities = form.getValues('amenities')
    const isSelected = currentAmenities.includes(amenity)
    
    const newAmenities = isSelected
      ? currentAmenities.filter(a => a !== amenity)
      : [...currentAmenities, amenity]
    
    form.setValue('amenities', newAmenities, { shouldValidate: true })
  }

  const onSubmit = async (data: AmenitiesFormData) => {
    try {
      console.log('🏠 Amenities - Submitting:', data)
      
      // Update the listing with the amenities
      await updateListingData({
        amenities: data.amenities,
      })

      // Navigate to next step
      const nextStep = STEP_NAVIGATION['amenities']?.next
      if (nextStep) {
        goToNextStep(nextStep)
      }
    } catch (error) {
      console.error('❌ Error submitting amenities form:', error)
    }
  }

  const onBack = () => {
    const previousStep = STEP_NAVIGATION['amenities']?.previous
    if (previousStep) {
      goToPreviousStep(previousStep)
    }
  }

  const isFormValid = form.formState.isValid
  const isDirty = form.formState.isDirty

  return {
    form,
    onSubmit: form.handleSubmit(onSubmit),
    onBack,
    toggleAmenity,
    selectedAmenities,
    isLoading,
    error,
    isFormValid,
    isDirty,
  }
} 