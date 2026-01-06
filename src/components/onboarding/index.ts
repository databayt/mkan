// Types
export type {
  OnboardingStepConfig,
  StepsOverviewConfig,
  OnboardingFooterConfig,
  OnboardingFooterProps,
  OnboardingStepsOverviewProps,
  OnboardingValidationContextType,
} from './types';

// Components
export { default as OnboardingFooter } from './onboarding-footer';
export { default as OnboardingStepsOverview } from './onboarding-steps-overview';

// Configurations
export {
  HOST_FOOTER_CONFIG,
  TRANSPORT_FOOTER_CONFIG,
  HOST_OVERVIEW_CONFIG,
  TRANSPORT_OVERVIEW_CONFIG,
  TRANSPORT_OVERVIEW_CONFIG_WITH_ILLUSTRATIONS,
} from './configs';

// Re-export validation contexts from the context folder
export {
  HostValidationProvider,
  useHostValidation,
  useHostValidationOptional,
  TransportHostValidationProvider,
  useTransportHostValidation,
  useTransportHostValidationOptional,
  createOnboardingValidationContext,
} from '@/context/onboarding-validation-context';
