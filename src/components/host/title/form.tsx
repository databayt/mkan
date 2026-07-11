"use client"

import { useTitle } from './use-title'
import { StepWrapper } from '../step-wrapper'
import { StepNavigation } from '../step-navigation'
import { FormField } from '../form-field'
import { useDictionary } from '@/components/internationalization/use-dictionary'

export function TitleForm() {
  const { 
    form, 
    onSubmit, 
    onBack,
    isLoading, 
    error, 
    isFormValid,
    title,
    characterCount,
    remainingCharacters
  } = useTitle()
  const dict = useDictionary()

  return (
    <StepWrapper>
      <form onSubmit={onSubmit} className="space-y-8">
        <FormField
          label={dict?.listingEditor?.title?.cardTitle ?? "Create your title"}
          description={dict?.listingEditor?.title?.subtitle ?? "Short titles work best. Have fun with it—you can always change it later."}
          error={form.formState.errors.title?.message}
        >
          <textarea
            {...form.register('title')}
            placeholder={dict?.host?.title?.placeholder ?? "Bright, cozy apartment with great view"}
            rows={3}
            className="w-full p-4 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          />
          
          <div className="flex justify-between items-center mt-2">
            <div className="text-sm text-muted-foreground">
              {dict?.host?.title?.hint ?? "Great titles are short and memorable"}
            </div>
            <div className={`text-sm ${remainingCharacters < 10 ? 'text-orange-600' : 'text-muted-foreground'}`}>
              {characterCount}/50
            </div>
          </div>
        </FormField>

        {/* Title Preview */}
        {title && (
          <div className="bg-muted/50 p-6 rounded-lg">
            <h3 className="text-lg font-medium mb-2">{dict?.listingEditor?.title?.previewTitle ?? "Preview"}</h3>
            <div className="bg-white p-4 rounded border">
              <h4 className="font-medium text-lg">{title}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {dict?.listingEditor?.title?.previewHint ?? "This is how your title will appear to guests"}
              </p>
            </div>
          </div>
        )}

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