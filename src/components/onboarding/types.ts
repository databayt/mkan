import { ReactNode } from 'react';

/**
 * Configuration for a single step in the onboarding flow
 */
export interface OnboardingStepConfig {
  number: number;
  title: string;
  description: string;
  illustration: ReactNode;
}

/**
 * Configuration for the steps overview component
 */
export interface StepsOverviewConfig {
  steps: OnboardingStepConfig[];
  headline?: ReactNode;
  subheadline?: string;
  buttonLabel?: string;
}

/**
 * Configuration for the onboarding footer component
 */
export interface OnboardingFooterConfig {
  /** Ordered list of step slugs */
  steps: string[];
  /** Steps grouped by phase (1, 2, 3) for progress bars */
  stepGroups: Record<number, string[]>;
  /** Labels for each progress bar phase */
  stepLabels: string[];
  /** Base route path (e.g., '/host' or '/transport-host') */
  routeBase: string;
  /** The final step slug that triggers the final action */
  finalStep: string;
  /** URL to redirect after completing the final step */
  finalRedirect: string;
  /** Label for the final step button */
  finalButtonLabel: string;
  /** Icon/logo displayed in the footer */
  icon: ReactNode;
  /** Button variant for the Next/Final button */
  buttonVariant?: 'default' | 'black';
}

/**
 * Props for the onboarding footer component
 */
export interface OnboardingFooterProps {
  config: OnboardingFooterConfig;
  onBack?: () => void;
  onNext?: () => void;
  onHelp?: () => void;
  onSave?: () => void;
  backLabel?: string;
  nextLabel?: string;
  canGoBack?: boolean;
  canGoNext?: boolean;
  nextDisabled?: boolean;
  /** Validation hook to check if next step is allowed */
  useValidation?: () => {
    isNextDisabled: boolean;
    customNavigation?: {
      onBack?: () => void;
      onNext?: () => void;
      nextDisabled?: boolean;
    };
  };
}

/**
 * Props for the steps overview component
 */
export interface OnboardingStepsOverviewProps {
  config: StepsOverviewConfig;
  onGetStarted?: () => void;
  isLoading?: boolean;
  loadingLabel?: string;
  className?: string;
}

/**
 * Validation context type for onboarding flows
 */
export interface OnboardingValidationContextType {
  isNextDisabled: boolean;
  setIsNextDisabled: (disabled: boolean) => void;
  enableNext: () => void;
  disableNext: () => void;
  customNavigation?: {
    onBack?: () => void;
    onNext?: () => void;
    nextDisabled?: boolean;
  };
  setCustomNavigation: (navigation?: {
    onBack?: () => void;
    onNext?: () => void;
    nextDisabled?: boolean;
  }) => void;
}
