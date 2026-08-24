export interface Listing {
  id: number;
  code?: string | null;
  sourceListingId?: string | null;
  title: string | null;
  description: string | null;
  pricePerNight: number | null;
  securityDeposit?: number | null;
  applicationFee?: number | null;
  cleaningFee?: number | null;
  weeklyDiscount?: number | null;
  monthlyDiscount?: number | null;
  photoUrls: string[];
  amenities?: string[];
  highlights?: string[];
  isPetsAllowed?: boolean;
  isParkingIncluded?: boolean;
  bedrooms?: number | null;
  bathrooms?: number | null;
  squareFeet?: number | null;
  guestCount?: number;
  propertyType?: string | null;
  postedDate: Date | null;
  averageRating?: number | null;
  numberOfReviews?: number | null;
  isGuestFavorite?: boolean;
  draft: boolean;
  isPublished: boolean;
  instantBook?: boolean;
  location: {
    id: number;
    address: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
    latitude: number;
    longitude: number;
    zoneKey?: string | null;
  } | null;
  host: {
    id: string;
    email: string;
    phoneNumber: string | null;
    username: string | null;
  };
} 