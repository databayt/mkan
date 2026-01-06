// Stub types for unused row components

export interface CountrySelectValue {
  flag: string;
  label: string;
  latlng: [number, number];
  region: string;
  value: string;
}

export interface SafeUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface safeListing {
  id: string;
  title: string;
  description: string;
  imageSrc: string;
  createdAt: string;
  category: string;
  roomCount: number;
  bathroomCount: number;
  guestCount: number;
  locationValue: string;
  userId: string;
  price: number;
}

export interface SafeReservation {
  id: string;
  userId: string;
  listingId: string;
  startDate: string;
  endDate: string;
  totalPrice: number;
  createdAt: string;
  listing: safeListing;
}

export interface HomesType {
  id: string | number;
  title: string;
  city: string;
  country: string;
  price: number;
  image: string | null;
  description?: string;
  guests?: number;
  rooms?: number;
  bathrooms?: number;
  locationValue?: string;
  categories?: string[];
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string;
  };
}

export interface ReservationType {
  id: string;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  listingId: string;
  userId: string;
}

export interface SearchFormData {
  location: string;
  guests: number;
  rooms: number;
  bathrooms: number;
  startDate?: Date;
  endDate?: Date;
}
