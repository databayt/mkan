"use client"

import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useLocation } from './use-location'
import { StepWrapper } from '../step-wrapper'
import { FormField } from '../form-field'
import { Input } from '@/components/ui/input'
import { useDictionary } from '@/components/internationalization/dictionary-context'
import { useLocale } from '@/components/internationalization/use-locale'
import { useHostValidation } from '@/context/onboarding-validation-context'
import { Skeleton } from '@/components/ui/skeleton'
import { type LocationResult } from '@/lib/mapbox'

// Dynamic import with SSR disabled since mapbox-gl touches window/document APIs
const MapboxLocationPicker = dynamic(
  () =>
    import("@/components/atom/mapbox-location-picker").then(
      (mod) => mod.MapboxLocationPicker
    ),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-[320px] w-full rounded-xl" />
      </div>
    ),
  }
)

export function LocationForm() {
  const dict = useDictionary()
  const { locale } = useLocale()
  const {
    form,
    onSubmit,
    onBack,
    isLoading,
    error,
    isFormValid,
    isDirty
  } = useLocation()

  const { setCustomNavigation } = useHostValidation()
  const hasMapbox = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Use refs to avoid triggering parent state changes / infinite loop on new onSubmit references
  const onSubmitRef = useRef(onSubmit)
  const onBackRef = useRef(onBack)

  useEffect(() => {
    onSubmitRef.current = onSubmit
    onBackRef.current = onBack
  }, [onSubmit, onBack])

  // Bind forms save/nav callback to footer buttons
  useEffect(() => {
    setCustomNavigation({
      onNext: () => onSubmitRef.current(),
      onBack: () => onBackRef.current(),
      nextDisabled: isLoading || !isFormValid,
    })

    return () => {
      setCustomNavigation(undefined)
    }
  }, [isLoading, isFormValid, setCustomNavigation])

  // Watch coordinates and address to feed picker value
  const address = form.watch('address')
  const city = form.watch('city')
  const state = form.watch('state')
  const country = form.watch('country')
  const postalCode = form.watch('postalCode')
  const latitude = form.watch('latitude')
  const longitude = form.watch('longitude')

  const pickerValue = address
    ? {
        address,
        city: city || '',
        state: state || '',
        country: country || '',
        postalCode: postalCode || '',
        latitude: latitude || 0,
        longitude: longitude || 0,
      }
    : null

  const handleLocationChange = (result: LocationResult) => {
    form.setValue('address', result.address, { shouldDirty: true, shouldValidate: true })
    form.setValue('city', result.city || 'Unknown', { shouldDirty: true, shouldValidate: true })
    form.setValue('state', result.state || 'Unknown', { shouldDirty: true, shouldValidate: true })
    form.setValue('country', result.country || 'Unknown', { shouldDirty: true, shouldValidate: true })
    form.setValue('postalCode', result.postalCode || '00000', { shouldDirty: true, shouldValidate: true })
    form.setValue('latitude', result.latitude, { shouldDirty: true, shouldValidate: true })
    form.setValue('longitude', result.longitude, { shouldDirty: true, shouldValidate: true })
  }

  // Safe localized labels
  const isAr = locale === 'ar'
  const labels = {
    searchPlaceholder: isAr ? "ابحث عن عنوان..." : "Search for an address...",
    tapToPin: isAr ? "انقر على الخريطة لتحديد الموقع دقيقاً" : "Tap on map to pin exact location",
    detectingAddress: isAr ? "جاري تحديد العنوان..." : "Detecting address...",
    mapboxNotConfigured: isAr ? "خريطة Mapbox غير مهيأة" : "Mapbox is not configured",
    locationBlocked: isAr ? "تم حظر الوصول إلى الموقع." : "Location access is blocked.",
    locationDenied: isAr ? "تم رفض الوصول إلى الموقع." : "Location access was denied.",
    locationTimeout: isAr ? "انتهت مهلة الحصول على الموقع." : "Location request timed out.",
  }

  return (
    <StepWrapper>
      {hasMapbox ? (
        <form onSubmit={onSubmit} className="space-y-8">
          <MapboxLocationPicker
            value={pickerValue}
            onChange={handleLocationChange}
            placeholder={labels.searchPlaceholder}
            labels={labels}
          />
          {error && (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={onSubmit} className="space-y-8">
          <div className="space-y-6">
            <FormField
              label={dict.host?.location?.streetAddress ?? "Street address"}
              error={form.formState.errors.address?.message}
            >
              <Input
                {...form.register('address')}
                placeholder={dict.host?.location?.streetAddressPlaceholder ?? "123 Main Street"}
                className="h-10"
              />
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label={dict.host?.location?.city ?? "City"}
                error={form.formState.errors.city?.message}
              >
                <Input
                  {...form.register('city')}
                  placeholder={dict.host?.location?.cityPlaceholder ?? "New York"}
                  className="h-10"
                />
              </FormField>

              <FormField
                label={dict.host?.location?.stateProvince ?? "State/Province"}
                error={form.formState.errors.state?.message}
              >
                <Input
                  {...form.register('state')}
                  placeholder={dict.host?.location?.stateProvincePlaceholder ?? "NY"}
                  className="h-10"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label={dict.host?.location?.country ?? "Country"}
                error={form.formState.errors.country?.message}
              >
                <Input
                  {...form.register('country')}
                  placeholder={dict.host?.location?.countryPlaceholder ?? "United States"}
                  className="h-10"
                />
              </FormField>

              <FormField
                label={dict.host?.location?.postalCode ?? "Postal code"}
                error={form.formState.errors.postalCode?.message}
              >
                <Input
                  {...form.register('postalCode')}
                  placeholder={dict.host?.location?.postalCodePlaceholder ?? "10001"}
                  className="h-10"
                />
              </FormField>
            </div>
          </div>

          {error && (
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
        </form>
      )}
    </StepWrapper>
  )
}