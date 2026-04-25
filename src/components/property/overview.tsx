import { useGetPropertyQuery } from "@/state/api";
import { MapPin, Star } from "lucide-react";
import React from "react";

interface PropertyOverviewProps {
  propertyId: number;
}

const PropertyOverview = ({ propertyId }: PropertyOverviewProps) => {
  const {
    data: property,
    isError,
    isLoading,
  } = useGetPropertyQuery(propertyId);

  if (isLoading) return <>Loading...</>;
  if (isError || !property) {
    return <>Property not Found</>;
  }

  const location = property.location;

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <div className="text-sm text-gray-500 mb-1">
          {location?.country} / {location?.state} /{" "}
          <span className="font-semibold text-gray-600">
            {location?.city}
          </span>
        </div>
        <h1 className="text-3xl font-bold my-5">{property.title}</h1>
        <div className="flex justify-between items-center">
          <span className="flex items-center text-gray-500">
            <MapPin className="w-4 h-4 me-1 text-gray-700" />
            {location?.city}, {location?.state}, {location?.country}
          </span>
          <div className="flex justify-between items-center gap-3">
            <span className="flex items-center text-yellow-500">
              <Star className="w-4 h-4 me-1 fill-current" />
              {(property.averageRating ?? 0).toFixed(1)} ({property.numberOfReviews ?? 0}{" "}
              Reviews)
            </span>
            <span className="text-green-600">Verified Listing</span>
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="border border-primary-200 rounded-xl p-6 mb-6">
        <div className="flex justify-between items-center gap-4 px-5">
          <div>
            <div className="text-sm text-gray-500">Price / night</div>
            <div className="font-semibold">
              ${(property.pricePerNight ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="border-s border-gray-300 h-10"></div>
          <div>
            <div className="text-sm text-gray-500">Bedrooms</div>
            <div className="font-semibold">{property.bedrooms ?? 0} bd</div>
          </div>
          <div className="border-s border-gray-300 h-10"></div>
          <div>
            <div className="text-sm text-gray-500">Bathrooms</div>
            <div className="font-semibold">{property.bathrooms ?? 0} ba</div>
          </div>
          <div className="border-s border-gray-300 h-10"></div>
          <div>
            <div className="text-sm text-gray-500">Square Feet</div>
            <div className="font-semibold">
              {(property.squareFeet ?? 0).toLocaleString()} sq ft
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="my-16">
        <h2 className="text-xl font-semibold mb-5">About {property.title}</h2>
        <p className="text-gray-500 leading-7">{property.description}</p>
      </div>
    </div>
  );
};

export default PropertyOverview;
