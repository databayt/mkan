import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useDebounce } from "@/hooks/useDebounce";
import { Listing } from "@/types/listing";
import { SiteState, SiteActions, SiteRefs } from "./type";
import { CATEGORY_KEYWORDS } from "./constant";

export function useSite() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // State
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterSticky, setIsFilterSticky] = useState(false);
  
  // Refs
  const resultsRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const propertyContentRef = useRef<HTMLDivElement>(null);
  const propertyEndRef = useRef<HTMLDivElement>(null);
  
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Fetch listings
  const fetchListings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/listings/published');
      if (!response.ok) {
        throw new Error(`Failed to fetch listings: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid data format');
      }
      
      setListings(data);
      setFilteredListings(data);
    } catch (error) {
      console.error("Error fetching listings:", error);
      setError(error instanceof Error ? error.message : 'Failed to load listings');
      setListings([]);
      setFilteredListings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter listings
  const filterListingsBySearch = useCallback((params: {
    location: string | null;
    checkIn: string | null;
    checkOut: string | null;
    guests: string | null;
    category: string | null;
  }) => {
    let filtered = [...listings];

    // Location filter
    if (params.location) {
      const locationLower = params.location.toLowerCase();
      filtered = filtered.filter(listing => {
        const searchableText = `${listing.location?.address || ''} ${listing.title || ''} ${listing.location?.city || ''} ${listing.location?.country || ''}`.toLowerCase();
        return searchableText.includes(locationLower);
      });
    }

    // Guest capacity filter
    if (params.guests) {
      const guestCount = parseInt(params.guests);
      if (!isNaN(guestCount)) {
        filtered = filtered.filter(listing =>
          (listing.guestCount ?? 0) >= guestCount
        );
      }
    }

    // Category filter
    if (params.category) {
      const keywords = CATEGORY_KEYWORDS[params.category];
      if (keywords) {
        filtered = filtered.filter(listing => {
          const searchableText = `${listing.title || ''} ${listing.description || ''} ${listing.propertyType || ''} ${listing.amenities?.join(' ') || ''}`.toLowerCase();
          return keywords.some(keyword => searchableText.includes(keyword.toLowerCase()));
        });
      }
    }

    setFilteredListings(filtered);
  }, [listings]);

  // Handle category click
  const handleCategoryClick = useCallback((category: string) => {
    setSelectedCategory(category);
    
    // Update URL with category
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set('category', category);
    } else {
      params.delete('category');
    }
    
    // Update URL without navigation
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.pushState({}, '', newUrl);
    
    // Apply filters
    const location = params.get('location');
    const checkIn = params.get('checkIn');
    const checkOut = params.get('checkOut');
    const guests = params.get('guests');
    
    filterListingsBySearch({ location, checkIn, checkOut, guests, category });
    
    // Scroll to results
    if (category) {
      setTimeout(() => scrollToResults(), 300);
    }
  }, [searchParams, filterListingsBySearch]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setSelectedCategory("");
    setSearchTerm("");
    router.push(window.location.pathname);
    setFilteredListings(listings);
  }, [router, listings]);

  // Scroll to results
  const scrollToResults = useCallback(() => {
    if (resultsRef.current) {
      const offset = 100; // Offset to account for sticky header
      const elementPosition = resultsRef.current.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }, []);

  // Filter sticky behavior
  useEffect(() => {
    const handleScroll = () => {
      if (!filterRef.current || !propertyEndRef.current) return;
      
      const filterRect = filterRef.current.getBoundingClientRect();
      const propertyEndRect = propertyEndRef.current.getBoundingClientRect();
      
      // Filter should stick when it reaches top of screen
      const shouldStick = filterRect.top <= 0;
      
      // Filter should unstick when property area ends
      const shouldUnstick = propertyEndRect.top <= 0;
      
      if (shouldUnstick) {
        setIsFilterSticky(false);
      } else if (shouldStick) {
        setIsFilterSticky(true);
      } else {
        setIsFilterSticky(false);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Check initial state
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle search parameters
  useEffect(() => {
    if (listings.length === 0) return;
    
    const location = searchParams.get('location') || debouncedSearchTerm;
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const guests = searchParams.get('guests');
    const category = searchParams.get('category');

    if (category) {
      setSelectedCategory(category);
    }

    if (location || checkIn || checkOut || guests || category) {
      filterListingsBySearch({ location, checkIn, checkOut, guests, category });
      // Only scroll if we have active search params
      if (location || guests || category) {
        setTimeout(() => scrollToResults(), 300);
      }
    } else {
      setFilteredListings(listings);
    }
  }, [searchParams, listings, debouncedSearchTerm, filterListingsBySearch, scrollToResults]);

  // Fetch listings on mount
  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Computed values
  const filteredCount = useMemo(() => filteredListings.length, [filteredListings]);
  const hasActiveFilters = useMemo(() => {
    return searchParams.toString() !== '' || selectedCategory !== '';
  }, [searchParams, selectedCategory]);

  const state: SiteState = {
    listings,
    filteredListings,
    selectedCategory,
    isLoading,
    error,
    isFilterSticky,
  };

  const actions: SiteActions = {
    handleCategoryClick,
    clearFilters,
    scrollToResults,
  };

  const refs: SiteRefs = {
    resultsRef,
    filterRef,
    propertyContentRef,
    propertyEndRef,
  };

  return {
    state,
    actions,
    refs,
    filteredCount,
    hasActiveFilters,
  };
}