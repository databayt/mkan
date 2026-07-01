"use client";

import { create } from "zustand";

// The three facets of the search the user can deep-link into when opening the
// big search from the compact pill. Values map 1:1 to BigSearch's
// `activeButton`, so the store value can be handed straight to it.
export type SearchSegment = "location" | "dates" | "guests";

// The search category tabs (mirrors airbnb.com). Switching tabs changes the
// BigSearch fields/menus: Experiences shows a different "Where" placeholder,
// Services swaps the third segment from "Who/guests" to "Type of service".
export type SearchTab = "homes" | "experiences" | "services";

interface SearchHeaderStore {
  // View state
  isExpanded: boolean; // BigSearch is visible (either from scroll top or user click)
  isOverlayActive: boolean; // Overlay is shown (only when user clicked SmallSearch)

  // Which dropdown the big search should auto-open once it finishes expanding
  // from a compact-pill click. `null` means it was expanded by scroll (top of
  // page) and should open with no dropdown active.
  initialSegment: SearchSegment | null;

  // Active category tab — drives which fields/menus BigSearch renders.
  activeTab: SearchTab;

  // Actions
  setScrollExpanded: (expanded: boolean) => void; // Scroll-triggered
  expandFromSmallSearch: (segment?: SearchSegment) => void; // User clicked SmallSearch
  collapse: () => void; // Close BigSearch (from overlay click or escape)
  setActiveTab: (tab: SearchTab) => void; // Switch Homes/Experiences/Services
}

const useSearchHeaderStore = create<SearchHeaderStore>((set) => ({
  isExpanded: true,
  isOverlayActive: false,
  initialSegment: null,
  activeTab: "homes",

  setScrollExpanded: (expanded) =>
    set((state) => ({
      // Only change if overlay is not active (user hasn't clicked)
      isExpanded: state.isOverlayActive ? state.isExpanded : expanded,
    })),

  // Default to the "location" panel when the pill is clicked on its body /
  // search button — mirrors Airbnb, where tapping the compact bar opens the
  // expanded bar focused on "Where".
  expandFromSmallSearch: (segment = "location") =>
    set({
      isExpanded: true,
      isOverlayActive: true,
      initialSegment: segment,
    }),

  collapse: () =>
    set({
      isExpanded: false,
      isOverlayActive: false,
      initialSegment: null,
    }),

  setActiveTab: (tab) =>
    set({
      activeTab: tab,
    }),
}));

export default useSearchHeaderStore;
