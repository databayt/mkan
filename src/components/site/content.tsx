"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import HeroSection from "./HeroSection";
import { PropertyContent } from "./property/content";
import PropertyFilter from "./property-filter";
import AirbnbInspiration from "./airbnb-inspiration";
import GiftCard from "./airbnb-gift-card";
import Ask from "./airbnb-ask";
import { useSite } from "./use-site";
import { useLocale } from "@/components/internationalization/use-locale";

export function SiteContent() {
  const { locale } = useLocale();
  const { state, actions, refs, filteredCount, hasActiveFilters } = useSite();
  
  const {
    filteredListings,
    selectedCategory,
    isLoading,
    error,
    isFilterSticky,
  } = state;

  const {
    handleCategoryClick,
    clearFilters,
    scrollToResults,
  } = actions;

  const {
    resultsRef,
    filterRef,
    propertyContentRef,
    propertyEndRef,
  } = refs;

  return (
    <div className='bg-background'>
      <HeroSection onSearch={scrollToResults} />
      <div className='layout-container space-y-10 pb-20 pt-10'>
        <div 
          ref={filterRef}
          className={`${isFilterSticky ? 'sticky top-0' : 'relative'} bg-background z-40 py-1`}
        >
          <PropertyFilter 
            onIconClick={handleCategoryClick}
            selectedIcon={selectedCategory}
          />
          {hasActiveFilters && (
            <div className="flex items-center justify-between mt-2 px-2">
              <p className="text-sm text-muted-foreground">
                {filteredCount} {filteredCount === 1 ? 'property' : 'properties'} found
              </p>
              <button
                onClick={clearFilters}
                className="text-sm text-primary hover:underline"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
        
        <div ref={resultsRef}>
          <div ref={propertyContentRef}>
            <PropertyContent 
              properties={filteredListings} 
              isLoading={isLoading}
            />
          </div>
          {error && (
            <div className="text-center py-10">
              <p className="text-red-500 mb-4">{error}</p>
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
              >
                Try Again
              </Button>
            </div>
          )}
          {/* Property end marker for filter sticky behavior */}
          <div ref={propertyEndRef} className="h-1"></div>
        </div>
        
        {filteredCount > 0 && !isLoading && (
          <Link href={`/${locale}/listings`} className='flex my-14'>
            <Button
              size='lg'
              className='bg-foreground text-background hover:bg-foreground/90 h-12 px-10'>
              Explore All Listings
            </Button>
          </Link>
        )}
        <AirbnbInspiration />
        <GiftCard />
        <Ask />
      </div>
    </div>
  );
}