'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { HelpCircle, Bookmark, Bus } from 'lucide-react';
import { useTransportHostValidation } from '@/context/transport-host-validation-context';

interface TransportHostFooterProps {
  onBack?: () => void;
  onNext?: () => void;
  onHelp?: () => void;
  onSave?: () => void;
  currentStep?: number;
  backLabel?: string;
  nextLabel?: string;
  canGoBack?: boolean;
  canGoNext?: boolean;
  nextDisabled?: boolean;
}

const HOSTING_STEPS = [
  'office-info',
  'assembly-point',
  'buses',
  'routes',
  'schedule',
  'photos',
  'finish',
];

const STEP_GROUPS = {
  1: ['office-info', 'assembly-point'],
  2: ['buses', 'routes', 'schedule'],
  3: ['photos', 'finish'],
};

const TransportHostFooter: React.FC<TransportHostFooterProps> = ({
  onBack,
  onNext,
  onHelp,
  onSave,
  currentStep: propCurrentStep,
  backLabel = 'Back',
  nextLabel = 'Next',
  canGoBack = true,
  canGoNext = true,
  nextDisabled = false,
}) => {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  let contextNextDisabled = false;
  let customNavigation;
  try {
    const validationContext = useTransportHostValidation();
    contextNextDisabled = validationContext.isNextDisabled;
    customNavigation = validationContext.customNavigation;
  } catch (error) {
    contextNextDisabled = false;
    customNavigation = undefined;
  }

  const getCurrentStepFromPath = () => {
    const pathSegments = pathname.split('/');
    const currentStepSlug = pathSegments[pathSegments.length - 1];
    const stepIndex = HOSTING_STEPS.findIndex((step) => step === currentStepSlug);
    return stepIndex === -1 ? 0 : stepIndex;
  };

  const currentStepIndex = getCurrentStepFromPath();
  const currentStepSlug = HOSTING_STEPS[currentStepIndex] || HOSTING_STEPS[0];

  const getCurrentStepGroup = () => {
    for (const [group, steps] of Object.entries(STEP_GROUPS)) {
      if (steps.includes(currentStepSlug)) {
        return parseInt(group);
      }
    }
    return 1;
  };

  const currentStepGroup = getCurrentStepGroup();

  const handleBack = () => {
    if (customNavigation?.onBack) {
      customNavigation.onBack();
      return;
    }

    if (onBack) {
      onBack();
      return;
    }

    if (currentStepIndex > 0) {
      const prevStep = HOSTING_STEPS[currentStepIndex - 1];
      router.push(`/transport-host/${params.id}/${prevStep}`);
    }
  };

  const handleNext = () => {
    if (customNavigation?.onNext) {
      customNavigation.onNext();
      return;
    }

    if (onNext) {
      onNext();
      return;
    }

    if (currentStepSlug === 'finish') {
      router.push('/offices');
      return;
    }

    if (currentStepIndex < HOSTING_STEPS.length - 1) {
      const nextStep = HOSTING_STEPS[currentStepIndex + 1];
      router.push(`/transport-host/${params.id}/${nextStep}`);
    }
  };

  const getStepProgress = (stepNumber: number) => {
    if (currentStepGroup > stepNumber) return 100;
    if (currentStepGroup === stepNumber) {
      const groupSteps = STEP_GROUPS[stepNumber as keyof typeof STEP_GROUPS];
      const currentStepInGroup = groupSteps.findIndex((step) => step === currentStepSlug);
      return Math.max(10, ((currentStepInGroup + 1) / groupSteps.length) * 100);
    }
    return 0;
  };

  const stepLabels = [
    'Office details',
    'Fleet & routes',
    'Photos & publish',
  ];

  const canGoBackActual = canGoBack && currentStepIndex > 0;
  const canGoNextActual =
    canGoNext &&
    (currentStepIndex < HOSTING_STEPS.length - 1 || currentStepSlug === 'finish') &&
    !nextDisabled &&
    !contextNextDisabled &&
    !customNavigation?.nextDisabled;

  const actualNextLabel = currentStepSlug === 'finish' ? 'Publish office' : nextLabel;

  return (
    <footer className="fixed bottom-0 left-0 right-0 bg-white z-50">
      <div className="">
        <div className="grid grid-cols-3 gap-1 sm:gap-2 px-4 sm:px-6 md:px-12 lg:px-20">
          {stepLabels.map((label, index) => (
            <Progress
              key={index}
              value={getStepProgress(index + 1)}
              className="h-1 w-full"
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 sm:px-6 md:px-12 lg:px-20 py-3 sm:py-4">
        <div className="flex items-center">
          <div className="relative w-5 h-5 text-primary">
            <Bus className="h-5 w-5" />
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

        <div className="flex items-center gap-2 sm:gap-4">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={!canGoBackActual}
            size="sm"
            className="h-8 sm:h-9 px-3 sm:px-4"
          >
            {backLabel}
          </Button>

          <Button
            onClick={handleNext}
            disabled={!canGoNextActual}
            size="sm"
            variant="default"
            className="h-8 sm:h-9 px-4 sm:px-6"
          >
            {actualNextLabel}
          </Button>
        </div>
      </div>
    </footer>
  );
};

export default TransportHostFooter;
