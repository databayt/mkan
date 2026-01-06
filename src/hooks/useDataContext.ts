// Stub file for unused row components
"use client";

import { useContext } from 'react';
import { DataContext, DataState, DataAction } from '@/context/DataContext';

export function useDataContext(): [DataState, React.Dispatch<DataAction>] {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useDataContext must be used within a DataProvider');
  }
  return context;
}
