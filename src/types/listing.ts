export interface Listing {
  id: number;
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
  } | null;
  host: {
    id: string;
    email: string;
    username: string | null;
  };
} 