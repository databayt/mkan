"use client";

import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import HeroSection from "@/components/site/HeroSection";
import { PropertyContent } from "@/components/site/property/content";
import { ListingCarouselSection } from "@/components/site/property/listing-carousel-section";
import PropertyFilter from "@/components/site/property-filter";
import { Listing } from "@/types/listing";
import AirbnbInspiration from "@/components/site/inspiration";
import GiftCard from "@/components/site/gift-card";
import Ask from "@/components/site/ask";
import Footer from "@/components/site/footer";

const translations = {
  en: {
    popular: "Popular homes in Khartoum",
    recent: "Recently added",
    topRated: "Top rated",
  },
  ar: {
    popular: "منازل شائعة في الخرطوم",
    recent: "أضيفت مؤخراً",
    topRated: "الأعلى تقييماً",
  },
} as const;

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
  const searchParams = useSearchParams();
  const t = translations[locale as "en" | "ar"] || translations.en;
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
        {selectedCategory ? (
          <PropertyContent properties={filteredListings} />
        ) : (
          <div className="space-y-12">
            <ListingCarouselSection
              title={t.popular}
              href={`/${locale}/search`}
              listings={listings.slice(0, 12)}
            />
            <ListingCarouselSection
              title={t.recent}
              href={`/${locale}/search?sort=newest`}
              listings={getRecentListings(listings, 12)}
            />
            <ListingCarouselSection
              title={t.topRated}
              href={`/${locale}/search?sort=rating`}
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
