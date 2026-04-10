"use client"

import { useLocation } from './use-location'
import { StepWrapper } from '../step-wrapper'
import { StepNavigation } from '../step-navigation'
import { FormField } from '../form-field'
import { Input } from '@/components/ui/input'
import { useDictionary } from '@/components/internationalization/dictionary-context'

export function LocationForm() {
  const dict = useDictionary()
  const {
    form,
    onSubmit,
    onBack,
    isLoading,
    error,
    isFormValid
  } = useLocation()

  return (
    <StepWrapper>
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
    </StepWrapper>
  )
} 