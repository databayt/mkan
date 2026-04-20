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

// Khartoum, Sudan — matches mkan's primary market. Used only as a fallback
// map center when the user hasn't granted geolocation and hasn't typed a
// location. Previously "Los Angeles" which silently filtered all listings
// to LA on first visit.
export const initialFilters: FiltersState = {
  location: "",
  beds: "any",
  baths: "any",
  propertyType: "any",
  amenities: [],
  availableFrom: "any",
  priceRange: [null, null],
  squareFeet: [null, null],
  coordinates: [32.5599, 15.5007],
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
