"use client"

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { priceSchema, PriceFormData } from './validation'
import { useListing, useHostNavigation } from '../use-listing'
import { STEP_NAVIGATION } from '../constants'

export function usePrice() {
  const { listing, updateListingData, isLoading, error } = useListing()
  const { goToNextStep, goToPreviousStep } = useHostNavigation('price')

  const form = useForm<PriceFormData>({
    resolver: zodResolver(priceSchema),
    defaultValues: {
      pricePerNight: listing?.pricePerNight || 50,
      securityDeposit: listing?.securityDeposit || 0,
      applicationFee: listing?.applicationFee || 0,
    },
    mode: 'onChange',
  })

  const onSubmit = async (data: PriceFormData) => {
    try {
      console.log('💰 Price - Submitting:', data)
      
      // Update the listing with the pricing data
      await updateListingData({
        pricePerNight: data.pricePerNight,
        securityDeposit: data.securityDeposit,
        applicationFee: data.applicationFee,
      })

      // Navigate to next step
      const nextStep = STEP_NAVIGATION['price']?.next
      if (nextStep) {
        goToNextStep(nextStep)
      }
    } catch (error) {
      console.error('❌ Error submitting price form:', error)
    }
  }

  const onBack = () => {
    const previousStep = STEP_NAVIGATION['price']?.previous
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
    isLoading,
    error,
    isFormValid,
    isDirty,
    // eslint-disable-next-line react-hooks/incompatible-library -- RHF's watch() is a subscription; standard pattern for RHF-driven UI.
    pricePerNight: form.watch('pricePerNight'),
    securityDeposit: form.watch('securityDeposit'),
    applicationFee: form.watch('applicationFee'),
  }
}