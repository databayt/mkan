"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import type { OnboardingValidationContextType } from '@/components/onboarding/types';

/**
 * Factory function to create an onboarding validation context
 * This allows reusing the same validation logic for different onboarding flows
 * (e.g., host onboarding, transport office onboarding)
 */
export function createOnboardingValidationContext(contextName: string) {
  const Context = createContext<OnboardingValidationContextType | undefined>(undefined);

  function Provider({ children }: { children: ReactNode }) {
    const [isNextDisabled, setIsNextDisabled] = useState(false);
    const [customNavigation, setCustomNavigation] = useState<
      OnboardingValidationContextType['customNavigation']
    >(undefined);

    const enableNext = useCallback(() => {
      setIsNextDisabled(false);
    }, []);

    const disableNext = useCallback(() => {
      setIsNextDisabled(true);
    }, []);

    const value = useMemo(
      () => ({
        isNextDisabled,
        setIsNextDisabled,
        enableNext,
        disableNext,
        customNavigation,
        setCustomNavigation,
      }),
      [isNextDisabled, enableNext, disableNext, customNavigation]
    );

    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useValidation(): OnboardingValidationContextType {
    const context = useContext(Context);
    if (context === undefined) {
      throw new Error(
        `use${contextName}Validation must be used within a ${contextName}ValidationProvider`
      );
    }
    return context;
  }

  // Optional hook that returns undefined instead of throwing if context not available
  function useValidationOptional(): OnboardingValidationContextType | undefined {
    return useContext(Context);
  }

  return {
    Provider,
    useValidation,
    useValidationOptional,
    Context,
  };
}

// Pre-created instances for host and transport onboarding
export const {
  Provider: HostValidationProvider,
  useValidation: useHostValidation,
  useValidationOptional: useHostValidationOptional,
  Context: HostValidationContext,
} = createOnboardingValidationContext('Host');

export const {
  Provider: TransportHostValidationProvider,
  useValidation: useTransportHostValidation,
  useValidationOptional: useTransportHostValidationOptional,
  Context: TransportHostValidationContext,
} = createOnboardingValidationContext('TransportHost');
