"use client"

import { useAmenities } from './use-amenities'
import { StepWrapper } from '../step-wrapper'
import { StepNavigation } from '../step-navigation'
import { FormField } from '../form-field'
import { ALL_AMENITIES, ESSENTIAL_AMENITIES, FEATURE_AMENITIES, KITCHEN_AMENITIES, SAFETY_AMENITIES } from '../constants'
import { Check } from 'lucide-react'
import { Amenity } from '@prisma/client'
import { useDictionary } from '@/components/internationalization/use-dictionary'

interface AmenityCardProps {
  amenity: Amenity
  title: string
  isSelected: boolean
  onToggle: () => void
}

function AmenityCard({ amenity, title, isSelected, onToggle }: AmenityCardProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`
        w-full p-4 rounded-lg border-2 transition-colors text-start
        ${isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground'
        }
      `}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{title}</span>
        {isSelected && (
          <div className="rounded-full bg-primary p-1">
            <Check className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
      </div>
    </button>
  )
}

export function AmenitiesForm() {
  const { 
    form, 
    onSubmit, 
    onBack,
    toggleAmenity,
    selectedAmenities,
    isLoading, 
    error, 
    isFormValid
  } = useAmenities()
  const dict = useDictionary()

  const renderAmenitySection = (title: string, amenities: typeof ESSENTIAL_AMENITIES) => (
    <div className="space-y-3">
      <h3 className="text-lg font-medium">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {amenities.map((amenity) => (
          <AmenityCard
            key={amenity.id}
            amenity={amenity.id}
            title={amenity.title}
            isSelected={selectedAmenities.includes(amenity.id)}
            onToggle={() => toggleAmenity(amenity.id)}
          />
        ))}
      </div>
    </div>
  )

  return (
    <StepWrapper>
      <form onSubmit={onSubmit} className="space-y-8">
        <FormField
          label={dict?.hosting?.onboarding?.amenities?.subtitle ?? "What amenities do you offer?"}
          description={dict?.host?.amenities?.description ?? "Choose all that apply. You can add more amenities after you publish your listing."}
        >
          <div className="space-y-8">
            {renderAmenitySection(dict?.host?.amenities?.essential ?? "Essential", ESSENTIAL_AMENITIES)}
            {renderAmenitySection(dict?.host?.amenities?.features ?? "Features", FEATURE_AMENITIES)}
            {renderAmenitySection(dict?.hosting?.pages?.amenities?.kitchen ?? "Kitchen", KITCHEN_AMENITIES)}
            {renderAmenitySection(dict?.hosting?.pages?.amenities?.safetyItems ?? "Safety", SAFETY_AMENITIES)}
          </div>
        </FormField>

        {error && (
          <div className="p-4 border border-red-200 rounded-lg bg-red-50">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          {(dict?.host?.amenities?.selectedCount ?? "{count} amenities selected").replace("{count}", String(selectedAmenities.length))}
        </div>

        <StepNavigation
          onNext={onSubmit}
          onPrevious={onBack}
          isNextDisabled={isLoading}
          nextLabel={isLoading ? (dict?.host?.stepNavigation?.saving ?? 'Saving...') : (dict?.host?.stepNavigation?.next ?? 'Next')}
          showPrevious={true}
        />
      </form>
    </StepWrapper>
  )
} 