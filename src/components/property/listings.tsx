"use client"

import React from 'react'
import { useGlobalStore } from '@/state/filters'
import { PropertyCard } from './card'

interface ListingsProps {
  properties: any[]
}

const Listings = ({ properties }: ListingsProps) => {
  const viewMode = useGlobalStore((s) => s.viewMode)
  const filters = useGlobalStore((s) => s.filters)

  const handleFavoriteToggle = async (propertyId: string, isFavorite: boolean) => {
    // TODO: Implement favorites functionality with server actions
    console.log('Toggle favorite:', propertyId, isFavorite)
  }

  const handleCardClick = (propertyId: string) => {
    window.location.href = `/search/${propertyId}`
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="w-full p-4">
        <h3 className="text-sm px-4 font-bold">
          0 <span className="text-gray-700 font-normal">Places in {filters.location}</span>
        </h3>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No properties found</h3>
            <p className="text-gray-600">Try adjusting your search filters to see more results.</p>
          </div>
        </div>
      </div>
    )
  }

  // Transform properties to match PropertyCard interface
  const transformedProperties = properties.map(property => ({
    id: property.id.toString(),
    images: property.photoUrls || [],
    title: property.name,
    location: `${property.location.city}, ${property.location.state}`,
    dates: undefined, // You can add availability dates logic here
    price: property.pricePerMonth,
    rating: property.averageRating || 4.5, // Default rating
    isSuperhostBadge: false, // You can add logic for this
    isFavorite: false, // TODO: Implement user favorites
    onFavoriteToggle: handleFavoriteToggle,
    onCardClick: handleCardClick,
  }))

  return (
    <div className="w-full">
      <h3 className="text-sm px-4 font-bold mb-4">
        {properties.length}{' '}
        <span className="text-gray-700 font-normal">
          Places in {filters.location}
        </span>
      </h3>
      
      {viewMode === 'grid' ? (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {transformedProperties.map((property) => (
              <PropertyCard key={property.id} {...property} />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {transformedProperties.map((property) => (
            <div key={property.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex gap-4">
                <div className="w-48 h-32 bg-gray-200 rounded-lg overflow-hidden">
                  {property.images.length > 0 && (
                    <img
                      src={property.images[0]}
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">{property.title}</h3>
                  <p className="text-gray-600 mb-2">{property.location}</p>
                  <p className="font-semibold text-lg">${property.price}/month</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default Listings
