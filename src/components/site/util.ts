import { Listing } from "@/types/listing";
import { CATEGORY_KEYWORDS } from "./constant";

export function filterByLocation(listings: Listing[], location: string): Listing[] {
  if (!location) return listings;

  const locationLower = location.toLowerCase();
  return listings.filter(listing => {
    const searchableText = `${listing.location?.address || ''} ${listing.title || ''} ${listing.location?.city || ''} ${listing.location?.country || ''}`.toLowerCase();
    return searchableText.includes(locationLower);
  });
}

export function filterByGuests(listings: Listing[], guestCount: number): Listing[] {
  if (guestCount <= 0) return listings;

  return listings.filter(listing =>
    (listing.guestCount ?? 0) >= guestCount
  );
}

export function filterByCategory(listings: Listing[], category: string): Listing[] {
  if (!category) return listings;

  const keywords = CATEGORY_KEYWORDS[category];
  if (!keywords) return listings;

  return listings.filter(listing => {
    const searchableText = `${listing.title || ''} ${listing.description || ''} ${listing.propertyType || ''} ${listing.amenities?.join(' ') || ''}`.toLowerCase();
    return keywords.some(keyword => searchableText.includes(keyword.toLowerCase()));
  });
}

export function buildSearchUrl(params: Record<string, string | number>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value.toString());
    }
  });
  
  return searchParams.toString() ? `?${searchParams.toString()}` : "";
}