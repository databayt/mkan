'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface TransportHostValidationContextType {
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

const TransportHostValidationContext = createContext<TransportHostValidationContextType | undefined>(undefined);

export const useTransportHostValidation = () => {
  const context = useContext(TransportHostValidationContext);
  if (!context) {
    throw new Error('useTransportHostValidation must be used within a TransportHostValidationProvider');
  }
  return context;
};

interface TransportHostValidationProviderProps {
  children: ReactNode;
}

export const TransportHostValidationProvider: React.FC<TransportHostValidationProviderProps> = ({ children }) => {
  const [isNextDisabled, setIsNextDisabled] = useState(false);
  const [customNavigation, setCustomNavigation] = useState<{
    onBack?: () => void;
    onNext?: () => void;
    nextDisabled?: boolean;
  } | undefined>(undefined);

  const enableNext = () => setIsNextDisabled(false);
  const disableNext = () => setIsNextDisabled(true);

  const value: TransportHostValidationContextType = {
    isNextDisabled,
    setIsNextDisabled,
    enableNext,
    disableNext,
    customNavigation,
    setCustomNavigation
  };

  return (
    <TransportHostValidationContext.Provider value={value}>
      {children}
    </TransportHostValidationContext.Provider>
  );
};
