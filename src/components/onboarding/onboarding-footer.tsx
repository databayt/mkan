"use client";

import React from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { HelpCircle, Bookmark } from 'lucide-react';
import type { OnboardingFooterConfig, OnboardingFooterProps } from './types';

/**
 * Generic onboarding footer component with progress bars and navigation
 * Can be configured for different onboarding flows (host, transport, etc.)
 */
const OnboardingFooter: React.FC<OnboardingFooterProps> = ({
  config,
  onBack,
  onNext,
  onHelp,
  onSave,
  backLabel = "Back",
  nextLabel = "Next",
  canGoBack = true,
  canGoNext = true,
  nextDisabled = false,
  useValidation,
}) => {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  // Use validation context if hook is provided
  let contextNextDisabled = false;
  let customNavigation: {
    onBack?: () => void;
    onNext?: () => void;
    nextDisabled?: boolean;
  } | undefined;

  try {
    if (useValidation) {
      const validationContext = useValidation();
      contextNextDisabled = validationContext.isNextDisabled;
      customNavigation = validationContext.customNavigation;
    }
  } catch {
    // Context not available, use default values
    contextNextDisabled = false;
    customNavigation = undefined;
  }

  // Extract current step from pathname
  const getCurrentStepFromPath = () => {
    const pathSegments = pathname.split('/');
    const currentStepSlug = pathSegments[pathSegments.length - 1];
    const stepIndex = config.steps.findIndex(step => step === currentStepSlug);
    return stepIndex === -1 ? 0 : stepIndex;
  };

  const currentStepIndex = getCurrentStepFromPath();
  const currentStepSlug = config.steps[currentStepIndex] ?? config.steps[0] ?? '';

  // Determine which step group we're in
  const getCurrentStepGroup = () => {
    for (const [group, steps] of Object.entries(config.stepGroups)) {
      if (steps.includes(currentStepSlug)) {
        return parseInt(group);
      }
    }
    return 1;
  };

  const currentStepGroup = getCurrentStepGroup();

  // Navigation functions
  const handleBack = () => {
    // Use custom navigation if available
    if (customNavigation?.onBack) {
      customNavigation.onBack();
      return;
    }

    if (onBack) {
      onBack();
      return;
    }

    if (currentStepIndex > 0) {
      const prevStep = config.steps[currentStepIndex - 1];
      router.push(`${config.routeBase}/${params.id}/${prevStep}`);
    }
  };

  const handleNext = () => {
    // Use custom navigation if available
    if (customNavigation?.onNext) {
      customNavigation.onNext();
      return;
    }

    if (onNext) {
      onNext();
      return;
    }

    // If we're on the final step, redirect to final destination
    if (currentStepSlug === config.finalStep) {
      router.push(config.finalRedirect);
      return;
    }

    if (currentStepIndex < config.steps.length - 1) {
      const nextStep = config.steps[currentStepIndex + 1];
      router.push(`${config.routeBase}/${params.id}/${nextStep}`);
    }
  };

  // Calculate progress for each step group
  const getStepProgress = (stepNumber: number) => {
    if (currentStepGroup > stepNumber) return 100; // Completed
    if (currentStepGroup === stepNumber) {
      // Calculate progress within current group
      const groupSteps = config.stepGroups[stepNumber as keyof typeof config.stepGroups];
      if (!groupSteps) return 0;
      const currentStepInGroup = groupSteps.findIndex(step => step === currentStepSlug);
      // Add 1 to currentStepInGroup to make it 1-indexed, so the last step shows 100%
      return Math.max(10, ((currentStepInGroup + 1) / groupSteps.length) * 100);
    }
    return 0; // Not started
  };

  // Check if back/next are available
  const canGoBackActual = canGoBack && (currentStepIndex > 0);
  const canGoNextActual = canGoNext &&
    (currentStepIndex < config.steps.length - 1 || currentStepSlug === config.finalStep) &&
    !nextDisabled &&
    !contextNextDisabled &&
    !(customNavigation?.nextDisabled);

  // Set the next button label based on current step
  const actualNextLabel = currentStepSlug === config.finalStep ? config.finalButtonLabel : nextLabel;

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white">
      {/* Three separate progress bars */}
      <div className="">
        <div className="grid grid-cols-3 gap-1 sm:gap-2 px-4 sm:px-6 md:px-12 lg:px-20">
          {config.stepLabels.map((label, index) => (
            <Progress
              key={index}
              value={getStepProgress(index + 1)}
              className="h-1 w-full"
            />
          ))}
        </div>
      </div>

      {/* All controls in one row */}
      <div className="flex items-center justify-between px-4 sm:px-6 md:px-12 lg:px-20 py-3 sm:py-4">
        {/* Left side - Logo, Help, Save */}
        <div className="flex items-center">
          <div className="relative w-5 h-5 flex items-center justify-center">
            {config.icon}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onHelp}
            className="rounded-full ml-2 w-10 h-10 sm:w-8 sm:h-8"
          >
            <HelpCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSave}
            className="rounded-full w-10 h-10 sm:w-8 sm:h-8"
          >
            <Bookmark className="h-5 w-5 sm:h-6 sm:w-6" />
          </Button>
        </div>

        {/* Right side - Back and Next buttons */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={!canGoBackActual}
            size='sm'
            className="h-8 sm:h-9 px-3 sm:px-4"
          >
            {backLabel}
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canGoNextActual}
            size='sm'
            variant={config.buttonVariant || 'default'}
            className="h-8 sm:h-9 px-4 sm:px-6"
          >
            {actualNextLabel}
          </Button>
        </div>
      </div>
    </footer>
  );
};

export default OnboardingFooter;
