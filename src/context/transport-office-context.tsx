'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createTransportOffice,
  updateTransportOffice,
  getTransportOffice,
} from '@/lib/actions/transport-actions';

export interface TransportOfficeData {
  id?: number;
  name: string;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  logoUrl?: string | null;
  phone: string;
  email: string;
  licenseNumber?: string | null;
  assemblyPointId?: number | null;
  isVerified?: boolean;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TransportOfficeContextType {
  office: TransportOfficeData | null;
  isLoading: boolean;
  error: string | null;
  setOffice: (office: TransportOfficeData | null) => void;
  updateOfficeData: (data: Partial<TransportOfficeData>) => Promise<void>;
  createNewOffice: (data?: Partial<TransportOfficeData>) => Promise<number | null>;
  loadOffice: (id: number) => Promise<void>;
  clearError: () => void;
}

const TransportOfficeContext = createContext<TransportOfficeContextType | undefined>(undefined);

interface TransportOfficeProviderProps {
  children: React.ReactNode;
  initialOffice?: TransportOfficeData | null;
}

export function TransportOfficeProvider({ children, initialOffice = null }: TransportOfficeProviderProps) {
  const [office, setOffice] = useState<TransportOfficeData | null>(initialOffice);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const createNewOffice = useCallback(async (data: Partial<TransportOfficeData> = {}) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await createTransportOffice({
        name: data.name || 'New Office',
        phone: data.phone || '',
        email: data.email || '',
        ...data,
      });

      if (result) {
        const newOffice: TransportOfficeData = {
          id: result.id,
          name: result.name,
          nameAr: result.nameAr,
          description: result.description,
          descriptionAr: result.descriptionAr,
          logoUrl: result.logoUrl,
          phone: result.phone,
          email: result.email,
          licenseNumber: result.licenseNumber,
          assemblyPointId: result.assemblyPointId,
          isVerified: result.isVerified,
          isActive: result.isActive,
        };

        setOffice(newOffice);
        return newOffice.id!;
      }

      throw new Error('Failed to create office');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadOffice = useCallback(async (id: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await getTransportOffice(id);

      if (result) {
        const loadedOffice: TransportOfficeData = {
          id: result.id,
          name: result.name,
          nameAr: result.nameAr,
          description: result.description,
          descriptionAr: result.descriptionAr,
          logoUrl: result.logoUrl,
          phone: result.phone,
          email: result.email,
          licenseNumber: result.licenseNumber,
          assemblyPointId: result.assemblyPointId,
          isVerified: result.isVerified,
          isActive: result.isActive,
        };

        setOffice(loadedOffice);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load office';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateOfficeData = useCallback(async (data: Partial<TransportOfficeData>) => {
    if (!office?.id) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await updateTransportOffice(office.id, data);

      if (result) {
        const updatedOffice: TransportOfficeData = {
          id: result.id,
          name: result.name,
          nameAr: result.nameAr,
          description: result.description,
          descriptionAr: result.descriptionAr,
          logoUrl: result.logoUrl,
          phone: result.phone,
          email: result.email,
          licenseNumber: result.licenseNumber,
          assemblyPointId: result.assemblyPointId,
          isVerified: result.isVerified,
          isActive: result.isActive,
        };

        setOffice(updatedOffice);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update office';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [office?.id]);

  const contextValue: TransportOfficeContextType = {
    office,
    isLoading,
    error,
    setOffice,
    updateOfficeData,
    createNewOffice,
    loadOffice,
    clearError,
  };

  return (
    <TransportOfficeContext.Provider value={contextValue}>
      {children}
    </TransportOfficeContext.Provider>
  );
}

export function useTransportOffice() {
  const context = useContext(TransportOfficeContext);
  if (context === undefined) {
    throw new Error('useTransportOffice must be used within a TransportOfficeProvider');
  }
  return context;
}

export function useTransportHostNavigation(currentStep: string) {
  const router = useRouter();
  const { office } = useTransportOffice();

  const goToStep = useCallback((step: string) => {
    if (!office?.id) {
      return;
    }
    router.push(`/transport-host/${office.id}/${step}`);
  }, [office?.id, router]);

  const goToNextStep = useCallback((nextStep: string) => {
    goToStep(nextStep);
  }, [goToStep]);

  const goToPreviousStep = useCallback((previousStep: string) => {
    goToStep(previousStep);
  }, [goToStep]);

  const goToOverview = useCallback(() => {
    router.push('/transport-host');
  }, [router]);

  return {
    goToStep,
    goToNextStep,
    goToPreviousStep,
    goToOverview,
    currentOfficeId: office?.id,
  };
}
