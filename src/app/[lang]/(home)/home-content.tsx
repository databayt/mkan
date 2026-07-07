"use client";

import { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import HeroSection from "@/components/site/HeroSection";
import { PropertyContent } from "@/components/site/property/content";
import { ListingCarouselSection } from "@/components/site/property/listing-carousel-section";
import PropertyFilter from "@/components/site/property-filter";
import { Listing } from "@/types/listing";
import Footer from "@/components/site/footer";

// Below-fold marketing sections and the once-per-user pricing popup are split
// out of the page's initial chunk — they still server-render (SEO), but their
// JS downloads after the hero/grid instead of competing with hydration.
const AirbnbInspiration = dynamic(() => import("@/components/site/inspiration"));
const GiftCard = dynamic(() => import("@/components/site/gift-card"));
const Ask = dynamic(() => import("@/components/site/ask"));
const PriceTransparencyDialog = dynamic(
  () =>
    import("@/components/site/price-transparency-dialog").then(
      (m) => m.PriceTransparencyDialog
    ),
  // Renders nothing until its own consent/localStorage logic opens it — no SSR
  // output to preserve, so keep it fully client-side and off the critical path.
  { ssr: false }
);

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Islands: ["island", "private island", "tropical", "paradise", "exotic"],
  Mension: ["mansion", "luxury", "estate", "villa", "palace"],
  Beach: ["beach", "beachfront", "ocean", "coastal", "seaside", "waterfront"],
  Boat: ["boat", "yacht", "houseboat", "marine", "sailing", "nautical"],
  Containers: ["container", "modern", "industrial", "minimalist", "shipping container"],
  New: ["new", "recent", "latest", "brand new", "just added"],
  "Beauty Pools": ["pool", "swimming pool", "infinity pool", "poolside", "private pool"],
  Group: ["group", "large", "family", "multiple bedrooms", "sleeps 8+", "spacious"],
  layer1: ["featured", "popular", "trending", "top rated", "best seller"],
  "Calque 2": ["unique", "special", "unusual", "extraordinary", "one of a kind"],
  Windmill: ["windmill", "rural", "countryside", "farm", "rustic"],
};

const getRecentListings = (listings: Listing[], limit: number) =>
  [...listings].sort((a, b) => b.id - a.id).slice(0, limit);

const getTopRatedListings = (listings: Listing[], limit: number) =>
  [...listings]
    .filter((l) => l.averageRating)
    .sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0))
    .slice(0, limit);

interface HomeContentProps {
  listings: Listing[];
  locale: string;
}

export default function HomeContent({ listings, locale }: HomeContentProps) {
  const dict = useDictionary();
  const sections = dict?.home?.sections;
  const [filteredListings, setFilteredListings] = useState<Listing[]>(listings);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const resultsRef = useRef<HTMLDivElement>(null);

  const scrollToResults = () => {
    if (resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const filterListingsBySearch = ({
    location,
    guests,
    category,
  }: {
    location?: string | null;
    guests?: string | null;
    category?: string | null;
  }) => {
    let filtered = [...listings];

    if (location) {
      const locationLower = location.toLowerCase();
      filtered = filtered.filter(
        (listing) =>
          listing.title?.toLowerCase().includes(locationLower) ||
          listing.location?.city?.toLowerCase().includes(locationLower) ||
          listing.location?.country?.toLowerCase().includes(locationLower)
      );
    }

    if (category && CATEGORY_KEYWORDS[category]) {
      const keywords = CATEGORY_KEYWORDS[category];
      filtered = filtered.filter((listing) => {
        const searchText =
          `${listing.title} ${listing.description} ${listing.propertyType}`.toLowerCase();
        return keywords.some((keyword) => searchText.includes(keyword.toLowerCase()));
      });
    }

    if (guests) {
      const parsedGuestCount = parseInt(guests, 10);
      if (!isNaN(parsedGuestCount)) {
        filtered = filtered.filter(
          (listing) => (listing.guestCount || 0) >= parsedGuestCount
        );
      }
    }

    setFilteredListings(filtered);
  };

  useEffect(() => {
    // Read the query string off window instead of useSearchParams(): the hook
    // opts a statically-rendered page out of prerendering (CSR bailout), which
    // would strip the hero from the HTML. Deep-linked ?category/?location
    // arrivals are full page loads, so a mount-time read covers them.
    const searchParams = new URLSearchParams(window.location.search);
    const location = searchParams.get("location");
    const guests = searchParams.get("guests");
    const category = searchParams.get("category");

    if (category) {
      setSelectedCategory(category);
    }

    if (location || guests || category) {
      filterListingsBySearch({ location, guests, category });
      setTimeout(() => scrollToResults(), 300);
    } else {
      setFilteredListings(listings);
    }
  }, [listings]);

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
      {/* The visual hero is imagery + search with no heading element; give
          crawlers and screen readers the page's one h1 without altering it. */}
      <h1 className="sr-only">
        {dict?.home?.metadata?.title ?? "Mkan - Rentals & Housing"}
      </h1>
      <PriceTransparencyDialog />

      <HeroSection />

      <div className="sticky top-0 z-40 bg-white border-b">
        <div className="layout-container">
          <PropertyFilter
            onIconClick={handleCategorySelect}
            selectedIcon={selectedCategory}
          />
        </div>
      </div>

      <div ref={resultsRef} className="layout-container py-8">
        {selectedCategory ? (
          <PropertyContent properties={filteredListings} />
        ) : (
          <div className="space-y-12">
            <ListingCarouselSection
              title={sections?.popular ?? "Popular homes in Portsudan"}
              href={`/${locale}/listings`}
              listings={listings.slice(0, 12)}
              priorityCount={4}
            />
            <ListingCarouselSection
              title={sections?.recent ?? "Recently added"}
              href={`/${locale}/listings?sort=newest`}
              listings={getRecentListings(listings, 12)}
            />
            <ListingCarouselSection
              title={sections?.topRated ?? "Top rated"}
              href={`/${locale}/listings?sort=rating`}
              listings={getTopRatedListings(listings, 12)}
            />
          </div>
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
