"use client";
import React, { useState, useEffect } from "react";
import { Listing } from "@/types/listing";
import { PropertyListings } from "./listings";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface PropertyContentProps {
  properties: Listing[];
  isLoading?: boolean;
}

export const PropertyContent = ({ properties: initialProperties, isLoading = false }: PropertyContentProps) => {
  const dict = useDictionary();
  const [properties, setProperties] = useState(initialProperties);

  useEffect(() => {
    // Filter to show only published listings
    const publishedProperties = initialProperties.filter(property => property.isPublished === true);
    setProperties(publishedProperties);
  }, [initialProperties]);

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
