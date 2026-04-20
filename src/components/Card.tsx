"use client";

import { Bath, Bed, Heart, House, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React, { useState } from "react";
import { useLocale } from "@/components/internationalization/use-locale";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters";

const Card = ({
  property,
  isFavorite,
  onFavoriteToggle,
  showFavoriteButton = true,
  propertyLink,
}: CardProps) => {
  const { locale } = useLocale();
  const dict = useDictionary();
  const [imgSrc, setImgSrc] = useState(
    property.photoUrls?.[0] || "/placeholder.jpg"
  );

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg w-full mb-5">
      <div className="relative">
        <div className="w-full h-48 relative">
          <Image
            src={imgSrc}
            alt={property.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={() => setImgSrc("/placeholder.jpg")}
          />
        </div>
        {/* Bottom-start badges — `start-4` mirrors in RTL so Arabic users see
            them on the right, matching the logical reading order. */}
        <div className="absolute bottom-4 start-4 flex gap-2">
          {property.isPetsAllowed && (
            <span className="bg-white/80 text-black text-xs font-semibold px-2 py-1 rounded-full">
              {dict.propertyCard?.PetsAllowed ?? "Pets Allowed"}
            </span>
          )}
          {property.isParkingIncluded && (
            <span className="bg-white/80 text-black text-xs font-semibold px-2 py-1 rounded-full">
              {dict.filters?.parkingIncluded ?? dict.propertyCard?.ParkingIncluded ?? "Parking Included"}
            </span>
          )}
        </div>
        {showFavoriteButton && (
          <button
            className="absolute bottom-4 end-4 bg-white hover:bg-white/90 rounded-full p-2 cursor-pointer"
            onClick={onFavoriteToggle}
            aria-label={dict.propertyCard?.toggleFavorite ?? "Toggle favorite"}
          >
            <Heart
              className={`w-5 h-5 ${
                isFavorite ? "text-red-500 fill-red-500" : "text-gray-600"
              }`}
            />
          </button>
        )}
      </div>
      <div className="p-4">
        <h2 className="text-xl font-bold mb-1">
          {propertyLink ? (
            <Link
              href={propertyLink}
              className="hover:underline hover:text-blue-600"
              scroll={false}
            >
              {property.name}
            </Link>
          ) : (
            property.name
          )}
        </h2>
        <p className="text-gray-600 mb-2">
          {property?.location?.address}, {property?.location?.city}
        </p>
        <div className="flex justify-between items-center">
          <div className="flex items-center mb-2">
            <Star className="w-4 h-4 text-yellow-400 me-1" />
            <span className="font-semibold">
              {formatNumber(property.averageRating ?? 0, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className="text-gray-600 ms-1">
              ({formatNumber(property.numberOfReviews ?? 0, locale)} {dict.propertyCard?.reviews ?? "Reviews"})
            </span>
          </div>
          <p className="text-lg font-bold mb-3">
            {formatCurrency(property.pricePerMonth ?? 0, locale)}{" "}
            <span className="text-gray-600 text-base font-normal"> /{dict.rental?.listing?.perMonth ?? "month"}</span>
          </p>
        </div>
        <hr />
        <div className="flex justify-between items-center gap-4 text-gray-600 mt-5">
          <span className="flex items-center">
            <Bed className="w-5 h-5 me-2" />
            {formatNumber(property.beds, locale)} {dict.propertyCard?.bed ?? "Bed"}
          </span>
          <span className="flex items-center">
            <Bath className="w-5 h-5 me-2" />
            {formatNumber(property.baths, locale)} {dict.propertyCard?.bath ?? "Bath"}
          </span>
          <span className="flex items-center">
            <House className="w-5 h-5 me-2" />
            {formatNumber(property.squareFeet, locale)} {dict.propertyCard?.sqft ?? "sq ft"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Card;
