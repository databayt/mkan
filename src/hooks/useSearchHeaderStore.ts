"use client";

import { create } from "zustand";

interface SearchHeaderStore {
  // View state
  isExpanded: boolean; // BigSearch is visible (either from scroll top or user click)
  isOverlayActive: boolean; // Overlay is shown (only when user clicked SmallSearch)

  // Actions
  setScrollExpanded: (expanded: boolean) => void; // Scroll-triggered
  expandFromSmallSearch: () => void; // User clicked SmallSearch
  collapse: () => void; // Close BigSearch (from overlay click or escape)
}

const useSearchHeaderStore = create<SearchHeaderStore>((set) => ({
  isExpanded: true,
  isOverlayActive: false,

  setScrollExpanded: (expanded) =>
    set((state) => ({
      // Only change if overlay is not active (user hasn't clicked)
      isExpanded: state.isOverlayActive ? state.isExpanded : expanded,
    })),

  expandFromSmallSearch: () =>
    set({
      isExpanded: true,
      isOverlayActive: true,
    }),

  collapse: () =>
    set({
      isExpanded: false,
      isOverlayActive: false,
    }),
}));

export default useSearchHeaderStore;
