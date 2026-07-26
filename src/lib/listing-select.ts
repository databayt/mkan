import { Prisma } from "@prisma/client";

// Card-level Listing fields shared by search, browse, and the published API.
// A full Listing row also carries houseRules/guideInfo JSON, cancellation
// policy, check-in metadata and internal timestamps — listing the card
// fields here cuts the row payload by ~30-40%, which matters when 20-50
// rows ship per request.
//
// Keep this list in sync with `Listing` in src/types/listing.ts. Prisma
// payload types derive from this select, so a typo here surfaces
// immediately as a tsc error in pages that consume it.
//
// Lives in its own module (not search-actions.ts) because "use server"
// files may only export async functions.
export const SEARCH_LISTING_SELECT = {
  id: true,
  title: true,
  description: true,
  pricePerNight: true,
  securityDeposit: true,
  applicationFee: true,
  cleaningFee: true,
  weeklyDiscount: true,
  monthlyDiscount: true,
  photoUrls: true,
  amenities: true,
  highlights: true,
  isPetsAllowed: true,
  isParkingIncluded: true,
  bedrooms: true,
  bathrooms: true,
  squareFeet: true,
  guestCount: true,
  propertyType: true,
  postedDate: true,
  averageRating: true,
  numberOfReviews: true,
  isGuestFavorite: true,
  draft: true,
  isPublished: true,
  instantBook: true,
  location: {
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      country: true,
      postalCode: true,
      latitude: true,
      longitude: true,
    },
  },
  host: {
    select: { id: true, email: true, username: true },
  },
} as const satisfies Prisma.ListingSelect;
