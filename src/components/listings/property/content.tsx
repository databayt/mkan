"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Listing } from "@/types/listing";
import { PropertyListings } from "./listings";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface PropertyContentProps {
  properties: Listing[];
}

// The server action (`searchListings`) already applied every filter in the URL
// — location, price, beds, baths, amenities, etc. Rendering the server output
// directly avoids the former client-side re-filter that silently dropped rows
// when the client logic diverged from the server's shape.
export const PropertyContent = ({ properties }: PropertyContentProps) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const dict = useDictionary();

  const filterKeys = [
    "location",
    "checkIn",
    "checkOut",
    "guests",
    "adults",
    "children",
    "infants",
    "priceMin",
    "priceMax",
    "priceRange",
    "beds",
    "baths",
    "propertyType",
    "amenities",
  ];
  const hasActiveFilters = filterKeys.some((k) => {
    const v = searchParams.get(k);
    return v != null && v.length > 0 && v !== "0";
  });

  const clearAllFilters = () => {
    router.push("/listings");
  };

  return (
    <div className="w-full">
      {hasActiveFilters && (
        <div className="mb-4">
          <Button
            onClick={clearAllFilters}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <X size={16} />
            {dict.rental?.listing?.clearAllFilters ?? "Clear all filters"}
          </Button>
        </div>
      )}

      <PropertyListings properties={properties} />
    </div>
  );
};
