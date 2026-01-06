"use client"

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { floorPlanSchema, FloorPlanFormData } from './validation'
import { useListing, useHostNavigation } from '../use-listing'
import { STEP_NAVIGATION } from '../constants'

export function useFloorPlan() {
  const { listing, updateListingData, isLoading, error } = useListing()
  const { goToNextStep, goToPreviousStep } = useHostNavigation('floor-plan')

  const form = useForm<FloorPlanFormData>({
    resolver: zodResolver(floorPlanSchema),
    defaultValues: {
      bedrooms: listing?.bedrooms || 1,
      bathrooms: listing?.bathrooms || 1,
      guestCount: listing?.guestCount || 2,
    },
    mode: 'onChange',
  })

  const onSubmit = async (data: FloorPlanFormData) => {
    try {
      console.log('🏠 Floor Plan - Submitting:', data)
      
      // Update the listing with the floor plan data
      await updateListingData({
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        guestCount: data.guestCount,
      })

      // Navigate to next step
      const nextStep = STEP_NAVIGATION['floor-plan']?.next
      if (nextStep) {
        goToNextStep(nextStep)
      }
    } catch (error) {
      console.error('❌ Error submitting floor plan form:', error)
    }
  }

  const onBack = () => {
    const previousStep = STEP_NAVIGATION['floor-plan']?.previous
    if (previousStep) {
      goToPreviousStep(previousStep)
    }
  }

  const increment = (field: keyof FloorPlanFormData) => {
    const currentValue = form.getValues(field)
    form.setValue(field, currentValue + (field === 'bathrooms' ? 0.5 : 1), { shouldValidate: true })
  }

  const decrement = (field: keyof FloorPlanFormData) => {
    const currentValue = form.getValues(field)
    const newValue = field === 'bathrooms' 
      ? Math.max(0.5, currentValue - 0.5)
      : Math.max(field === 'bedrooms' ? 0 : 1, currentValue - 1)
    form.setValue(field, newValue, { shouldValidate: true })
  }

  const isFormValid = form.formState.isValid
  const isDirty = form.formState.isDirty

  return {
    form,
    onSubmit: form.handleSubmit(onSubmit),
    onBack,
    increment,
    decrement,
    isLoading,
    error,
    isFormValid,
    isDirty,
    bedrooms: form.watch('bedrooms'),
    bathrooms: form.watch('bathrooms'),
    guestCount: form.watch('guestCount'),
  }
} 