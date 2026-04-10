import { create } from "zustand";

export interface FiltersState {
  location: string;
  beds: string;
  baths: string;
  propertyType: string;
  amenities: string[];
  availableFrom: string;
  priceRange: [number, number] | [null, null];
  squareFeet: [number, number] | [null, null];
  coordinates: [number, number];
}

interface GlobalState {
  filters: FiltersState;
  isFiltersFullOpen: boolean;
  viewMode: "grid" | "list";
  setFilters: (filters: Partial<FiltersState>) => void;
  toggleFiltersFullOpen: () => void;
  setViewMode: (mode: "grid" | "list") => void;
}

export const initialFilters: FiltersState = {
  location: "Los Angeles",
  beds: "any",
  baths: "any",
  propertyType: "any",
  amenities: [],
  availableFrom: "any",
  priceRange: [null, null],
  squareFeet: [null, null],
  coordinates: [-118.25, 34.05],
};

export const useGlobalStore = create<GlobalState>((set) => ({
  filters: initialFilters,
  isFiltersFullOpen: false,
  viewMode: "grid",
  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    })),
  toggleFiltersFullOpen: () =>
    set((state) => ({
      isFiltersFullOpen: !state.isFiltersFullOpen,
    })),
  setViewMode: (mode) => set({ viewMode: mode }),
}));
