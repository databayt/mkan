"use client"

import { usePathname } from 'next/navigation'
import { useLocation } from './use-location'
import { StepWrapper } from '../step-wrapper'
import { StepNavigation } from '../step-navigation'
import { FormField } from '../form-field'
import { Input } from '@/components/ui/input'

export function LocationForm() {
  const pathname = usePathname()
  const isAr = pathname?.startsWith("/ar")
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
            label={isAr ? "عنوان الشارع" : "Street address"}
            error={form.formState.errors.address?.message}
          >
            <Input
              {...form.register('address')}
              placeholder={isAr ? "١٢٣ شارع الرئيسي" : "123 Main Street"}
              className="h-10"
            />
          </FormField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label={isAr ? "المدينة" : "City"}
              error={form.formState.errors.city?.message}
            >
              <Input
                {...form.register('city')}
                placeholder={isAr ? "الرياض" : "New York"}
                className="h-10"
              />
            </FormField>

            <FormField
              label={isAr ? "المنطقة / المحافظة" : "State/Province"}
              error={form.formState.errors.state?.message}
            >
              <Input
                {...form.register('state')}
                placeholder={isAr ? "الرياض" : "NY"}
                className="h-10"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              label={isAr ? "الدولة" : "Country"}
              error={form.formState.errors.country?.message}
            >
              <Input
                {...form.register('country')}
                placeholder={isAr ? "المملكة العربية السعودية" : "United States"}
                className="h-10"
              />
            </FormField>

            <FormField
              label={isAr ? "الرمز البريدي" : "Postal code"}
              error={form.formState.errors.postalCode?.message}
            >
              <Input
                {...form.register('postalCode')}
                placeholder={isAr ? "١٢٢٧١" : "10001"}
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