import FiltersBar from "./filters-bar";
import FiltersFull from "./filters-full";
import Listings from "./listings";
import { getListings } from "@/components/host/actions";
import { PropertyType, Amenity } from "@prisma/client";

interface SearchPageProps {
  searchParams: Promise<{
    location?: string;
    priceMin?: string;
    priceMax?: string;
    beds?: string;
    baths?: string;
    propertyType?: string;
    amenities?: string;
  }>;
}

// Helper to validate PropertyType enum
function isValidPropertyType(value: string | undefined): value is PropertyType {
  if (!value) return false;
  return Object.values(PropertyType).includes(value as PropertyType);
}

// Helper to validate Amenity enum values
function parseAmenities(value: string | undefined): Amenity[] | undefined {
  if (!value) return undefined;
  const amenityValues = value.split(',');
  return amenityValues.filter((a): a is Amenity =>
    Object.values(Amenity).includes(a as Amenity)
  );
}

export default async function PropertyContent({ searchParams }: SearchPageProps) {
  // Await searchParams for Next.js 15 compatibility
  const params = await searchParams;

  // Parse search params for filters - show all properties by default if no location specified
  const priceMin = params.priceMin ? parseInt(params.priceMin) : undefined;
  const priceMax = params.priceMax ? parseInt(params.priceMax) : undefined;

  const filters = {
    location: params.location ?? undefined,
    priceRange: priceMin !== undefined && priceMax !== undefined ? [priceMin, priceMax] as [number, number] : undefined,
    bedrooms: params.beds ? parseInt(params.beds) : undefined,
    bathrooms: params.baths ? parseInt(params.baths) : undefined,
    propertyType: isValidPropertyType(params.propertyType) ? params.propertyType : undefined,
    amenities: parseAmenities(params.amenities),
  };

  // Fetch properties using server action with error handling
  let properties: Awaited<ReturnType<typeof getListings>> = [];
  try {
    console.log('Fetching properties with filters:', filters);
    properties = await getListings(filters);
    console.log('Properties fetched:', properties.length);
  } catch (error) {
    console.error('Error fetching properties:', error);
    // Return empty array on error to prevent page crash
    properties = [];
  }

  return (
    <div className="w-full">
      {/* <div className="border-b border-gray-200">
        <FiltersBar />
      </div> */}
      
      <div className="flex relative">
        <div className="flex-1">
          <Listings properties={properties} />
        </div>
        
        {/* <FiltersFull /> */}
      </div>
    </div>
  );
}
