"use client"

import { useFloorPlan } from './use-floor-plan'
import { StepWrapper } from '../step-wrapper'
import { StepNavigation } from '../step-navigation'
import { FormField } from '../form-field'
import { Counter } from '../../atom/counter'
import { useDictionary } from '@/components/internationalization/use-dictionary'

export function FloorPlanForm() {
  const { 
    form, 
    onSubmit, 
    onBack,
    increment,
    decrement,
    isLoading, 
    error, 
    isFormValid, 
    bedrooms,
    bathrooms,
    guestCount
  } = useFloorPlan()
  const dict = useDictionary()

  return (
    <StepWrapper>
      <form onSubmit={onSubmit} className="space-y-8">
        <div className="space-y-6">
          <FormField
            label={dict?.hosting?.pages?.floorPlan?.bedrooms ?? "Bedrooms"}
            description={dict?.host?.floorPlan?.bedroomsDesc ?? "How many bedrooms can guests use?"}
          >
            <Counter
              value={bedrooms}
              onIncrement={() => increment('bedrooms')}
              onDecrement={() => decrement('bedrooms')}
              min={0}
              max={50}
            />
          </FormField>

          <FormField
            label={dict?.hosting?.pages?.floorPlan?.bathrooms ?? "Bathrooms"}
            description={dict?.host?.floorPlan?.bathroomsDesc ?? "How many bathrooms can guests use?"}
          >
            <Counter
              value={bathrooms}
              onIncrement={() => increment('bathrooms')}
              onDecrement={() => decrement('bathrooms')}
              min={0.5}
              max={50}
              step={0.5}
            />
          </FormField>

          <FormField
            label={dict?.hosting?.pages?.floorPlan?.guests ?? "Guests"}
            description={dict?.host?.floorPlan?.guestsDesc ?? "How many guests can your place accommodate?"}
          >
            <Counter
              value={guestCount}
              onIncrement={() => increment('guestCount')}
              onDecrement={() => decrement('guestCount')}
              min={1}
              max={50}
            />
          </FormField>
        </div>

        {error && (
          <div className="p-4 border border-red-200 rounded-lg bg-red-50">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        <StepNavigation
          onNext={onSubmit}
          onPrevious={onBack}
          isNextDisabled={!isFormValid || isLoading}
          nextLabel={isLoading ? (dict?.host?.stepNavigation?.saving ?? 'Saving...') : (dict?.host?.stepNavigation?.next ?? 'Next')}
          showPrevious={true}
        />
      </form>
    </StepWrapper>
  )
} 