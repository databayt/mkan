"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import HeroSection from "@/components/site/HeroSection";
import { PropertyContent } from "@/components/site/property/content";
import PropertyFilter from "@/components/site/property-filter";
import { Listing } from "@/types/listing";
import AirbnbInspiration from "@/components/site/airbnb-inspiration";
import GiftCard from "@/components/site/airbnb-gift-card";
import Ask from "@/components/site/airbnb-ask";
import Footer from "@/components/row/Footer";

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Islands': ['island', 'private island', 'tropical', 'paradise', 'exotic'],
  'Mension': ['mansion', 'luxury', 'estate', 'villa', 'palace'],
  'Beach': ['beach', 'beachfront', 'ocean', 'coastal', 'seaside', 'waterfront'],
  'Boat': ['boat', 'yacht', 'houseboat', 'marine', 'sailing', 'nautical'],
  'Containers': ['container', 'modern', 'industrial', 'minimalist', 'shipping container'],
  'New': ['new', 'recent', 'latest', 'brand new', 'just added'],
  'Beauty Pools': ['pool', 'swimming pool', 'infinity pool', 'poolside', 'private pool'],
  'Group': ['group', 'large', 'family', 'multiple bedrooms', 'sleeps 8+', 'spacious'],
  'layer1': ['featured', 'popular', 'trending', 'top rated', 'best seller'],
  'Calque 2': ['unique', 'special', 'unusual', 'extraordinary', 'one of a kind'],
  'Windmill': ['windmill', 'rural', 'countryside', 'farm', 'rustic']
};

function HomeContent() {
  const searchParams = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [filteredListings, setFilteredListings] = useState<Listing[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const scrollToResults = () => {
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const filterListingsBySearch = ({
    location,
    guests,
    category
  }: {
    location?: string | null;
    guests?: string | null;
    category?: string | null;
  }) => {
    let filtered = [...listings];

    if (location) {
      const locationLower = location.toLowerCase();
      filtered = filtered.filter(listing =>
        listing.title?.toLowerCase().includes(locationLower) ||
        listing.location?.city?.toLowerCase().includes(locationLower) ||
        listing.location?.country?.toLowerCase().includes(locationLower)
      );
    }

    if (category && CATEGORY_KEYWORDS[category]) {
      const keywords = CATEGORY_KEYWORDS[category];
      filtered = filtered.filter(listing => {
        const searchText = `${listing.title} ${listing.description} ${listing.propertyType}`.toLowerCase();
        return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
      });
    }

    if (guests) {
      const parsedGuestCount = parseInt(guests, 10);
      if (!isNaN(parsedGuestCount)) {
        filtered = filtered.filter(listing =>
          (listing.guestCount || 0) >= parsedGuestCount
        );
      }
    }

    setFilteredListings(filtered);
  };

  useEffect(() => {
    const fetchListings = async () => {
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
    };

    fetchListings();
  }, []);

  useEffect(() => {
    if (listings.length === 0) return;

    const location = searchParams.get('location');
    const guests = searchParams.get('guests');
    const category = searchParams.get('category');

    if (category) {
      setSelectedCategory(category);
    }

    if (location || guests || category) {
      filterListingsBySearch({ location, guests, category });
      if (location || guests || category) {
        setTimeout(() => scrollToResults(), 300);
      }
    } else {
      setFilteredListings(listings);
    }
  }, [searchParams, listings]);

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);

    if (category) {
      filterListingsBySearch({ category });
    } else {
      setFilteredListings(listings);
    }
  };

  return (
    <div className="min-h-screen">
      <HeroSection onSearch={scrollToResults} />

      <div className="sticky top-0 z-40 bg-white border-b">
        <div className="layout-container">
          <PropertyFilter
            onIconClick={handleCategorySelect}
            selectedIcon={selectedCategory}
          />
        </div>
      </div>

      <div ref={resultsRef} className="layout-container py-8">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-500">{error}</p>
          </div>
        ) : (
          <PropertyContent properties={filteredListings} />
        )}
      </div>

      <div className="layout-container py-12">
        <AirbnbInspiration />
      </div>
      <div className="layout-container py-12">
        <GiftCard />
      </div>
      <div className="layout-container py-12">
        <Ask />
      </div>
      <Footer />
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
