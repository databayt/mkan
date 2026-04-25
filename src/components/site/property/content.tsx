"use client";
import React, { useMemo } from "react";
import { Listing } from "@/types/listing";
import { PropertyListings } from "./listings";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface PropertyContentProps {
  properties: Listing[];
  isLoading?: boolean;
}

export const PropertyContent = ({ properties: initialProperties, isLoading = false }: PropertyContentProps) => {
  const dict = useDictionary();
  // Derive published listings from props instead of mirroring into state via
  // an effect — eliminates an unnecessary re-render and a setState-in-effect.
  const properties = useMemo(
    () => initialProperties.filter(property => property.isPublished === true),
    [initialProperties]
  );

  if (isLoading) {
    return (
      <div className="w-full">
        <div className="flex justify-center items-center py-20">
          <div className="text-gray-500">{dict.home?.loadingProperties}</div>
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="w-full">
        <div className="flex justify-center items-center py-20">
          <div className="text-gray-500">{dict.home?.noProperties}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex relative">
        <div className="flex-1">
          <PropertyListings properties={properties} />
        </div>
      </div>
    </div>
  );
};
