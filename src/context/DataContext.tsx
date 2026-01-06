// Stub file for unused row components
"use client";

import React, { createContext, useReducer, ReactNode } from 'react';

export const DATA_ACTION_TYPES = {
  SET_CHECK_IN: 'SET_CHECK_IN',
  SET_CHECK_OUT: 'SET_CHECK_OUT',
  SET_LOCATION: 'SET_LOCATION',
  SET_GUESTS: 'SET_GUESTS',
  RESET_DATES: 'RESET_DATES',
  RESET_GUESTS: 'RESET_GUESTS',
  INCREASE_ADULTS: 'INCREASE_ADULTS',
  DECREASE_ADULTS: 'DECREASE_ADULTS',
  INCREASE_CHILDREN: 'INCREASE_CHILDREN',
  DECREASE_CHILDREN: 'DECREASE_CHILDREN',
  INCREASE_INFANTS: 'INCREASE_INFANTS',
  DECREASE_INFANTS: 'DECREASE_INFANTS',
  INCREASE_PETS: 'INCREASE_PETS',
  DECREASE_PETS: 'DECREASE_PETS',
} as const;

export interface GuestsState {
  adults: number;
  children: number;
  infants: number;
  pets: number;
}

export interface DataState {
  checkIn: Date | null;
  checkOut: Date | null;
  location: string;
  guests: GuestsState;
}

export type DataAction =
  | { type: typeof DATA_ACTION_TYPES.SET_CHECK_IN; payload: Date }
  | { type: typeof DATA_ACTION_TYPES.SET_CHECK_OUT; payload: Date }
  | { type: typeof DATA_ACTION_TYPES.SET_LOCATION; payload: string }
  | { type: typeof DATA_ACTION_TYPES.SET_GUESTS; payload: GuestsState }
  | { type: typeof DATA_ACTION_TYPES.RESET_DATES }
  | { type: typeof DATA_ACTION_TYPES.RESET_GUESTS }
  | { type: typeof DATA_ACTION_TYPES.INCREASE_ADULTS }
  | { type: typeof DATA_ACTION_TYPES.DECREASE_ADULTS }
  | { type: typeof DATA_ACTION_TYPES.INCREASE_CHILDREN }
  | { type: typeof DATA_ACTION_TYPES.DECREASE_CHILDREN }
  | { type: typeof DATA_ACTION_TYPES.INCREASE_INFANTS }
  | { type: typeof DATA_ACTION_TYPES.DECREASE_INFANTS }
  | { type: typeof DATA_ACTION_TYPES.INCREASE_PETS }
  | { type: typeof DATA_ACTION_TYPES.DECREASE_PETS };

const initialState: DataState = {
  checkIn: null,
  checkOut: null,
  location: '',
  guests: {
    adults: 1,
    children: 0,
    infants: 0,
    pets: 0,
  },
};

function dataReducer(state: DataState, action: DataAction): DataState {
  switch (action.type) {
    case DATA_ACTION_TYPES.SET_CHECK_IN:
      return { ...state, checkIn: action.payload };
    case DATA_ACTION_TYPES.SET_CHECK_OUT:
      return { ...state, checkOut: action.payload };
    case DATA_ACTION_TYPES.SET_LOCATION:
      return { ...state, location: action.payload };
    case DATA_ACTION_TYPES.SET_GUESTS:
      return { ...state, guests: action.payload };
    case DATA_ACTION_TYPES.RESET_DATES:
      return { ...state, checkIn: null, checkOut: null };
    case DATA_ACTION_TYPES.RESET_GUESTS:
      return { ...state, guests: initialState.guests };
    case DATA_ACTION_TYPES.INCREASE_ADULTS:
      return { ...state, guests: { ...state.guests, adults: state.guests.adults + 1 } };
    case DATA_ACTION_TYPES.DECREASE_ADULTS:
      return { ...state, guests: { ...state.guests, adults: Math.max(1, state.guests.adults - 1) } };
    case DATA_ACTION_TYPES.INCREASE_CHILDREN:
      return { ...state, guests: { ...state.guests, children: state.guests.children + 1 } };
    case DATA_ACTION_TYPES.DECREASE_CHILDREN:
      return { ...state, guests: { ...state.guests, children: Math.max(0, state.guests.children - 1) } };
    case DATA_ACTION_TYPES.INCREASE_INFANTS:
      return { ...state, guests: { ...state.guests, infants: state.guests.infants + 1 } };
    case DATA_ACTION_TYPES.DECREASE_INFANTS:
      return { ...state, guests: { ...state.guests, infants: Math.max(0, state.guests.infants - 1) } };
    case DATA_ACTION_TYPES.INCREASE_PETS:
      return { ...state, guests: { ...state.guests, pets: state.guests.pets + 1 } };
    case DATA_ACTION_TYPES.DECREASE_PETS:
      return { ...state, guests: { ...state.guests, pets: Math.max(0, state.guests.pets - 1) } };
    default:
      return state;
  }
}

export const DataContext = createContext<[DataState, React.Dispatch<DataAction>] | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dataReducer, initialState);

  return (
    <DataContext.Provider value={[state, dispatch]}>
      {children}
    </DataContext.Provider>
  );
}
