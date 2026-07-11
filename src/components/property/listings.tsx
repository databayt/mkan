"use client"

import React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useGlobalStore } from '@/state/filters'
import { PropertyCard } from './card'
import { addFavoriteProperty, removeFavoriteProperty } from '@/lib/actions/user-actions'
import { useSession } from 'next-auth/react'
import { useDictionary } from '@/components/internationalization/dictionary-context'
import { useLocale } from '@/components/internationalization/use-locale'
import { qualifiesAsGuestFavorite } from '@/lib/guest-favorite'

interface ListingsProps {
  properties: any[]
  favoriteIds?: number[]
}

const Listings = ({ properties, favoriteIds = [] }: ListingsProps) => {
  const dict = useDictionary()
  const t = dict?.property?.listings
  const { locale } = useLocale()
  const router = useRouter()
  const { data: session } = useSession()
  const viewMode = useGlobalStore((s) => s.viewMode)
  const filters = useGlobalStore((s) => s.filters)
  const [localFavorites, setLocalFavorites] = React.useState<Set<number>>(new Set(favoriteIds))

  const placesInText = () => {
    const template = t?.placesIn ?? "Places in {location}"
    return template.replace("{location}", filters.location ?? "")
  }

  const handleFavoriteToggle = async (propertyId: string, isFavorite: boolean) => {
    if (!session?.user?.id) return
    const id = parseInt(propertyId)
    setLocalFavorites(prev => {
      const next = new Set(prev)
      isFavorite ? next.add(id) : next.delete(id)
      return next
    })
    try {
      if (isFavorite) {
        await addFavoriteProperty(session.user.id, id)
      } else {
        await removeFavoriteProperty(session.user.id, id)
      }
    } catch {
      setLocalFavorites(prev => {
        const next = new Set(prev)
        isFavorite ? next.delete(id) : next.add(id)
        return next
      })
    }
  }

  const handleCardClick = (propertyId: string) => {
    router.push(`/${locale}/search/${propertyId}`)
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="w-full p-4">
        <h3 className="text-sm px-4 font-bold">
          0 <span className="text-gray-700 font-normal">{placesInText()}</span>
        </h3>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t?.noPropertiesTitle ?? "No properties found"}</h3>
            <p className="text-gray-600">{t?.noPropertiesDescription ?? "Try adjusting your search filters to see more results."}</p>
          </div>
        </div>
      </div>
    )
  }

  // Transform properties to match PropertyCard interface.
  //
  // Defensive: `location` is nullable on the schema (Listing.locationId is
  // optional), so any listing inserted without an address has a null
  // relation. Without optional chaining, `property.location.city` crashes
  // the prerender for the whole landing page — which is what bit us
  // when prod accumulated a few location-less rows.
  const transformedProperties = properties.map(property => ({
    id: property.id.toString(),
    images: property.photoUrls || [],
    title: property.name,
    location: property.location
      ? `${property.location.city}, ${property.location.state}`
      : "",
    dates: undefined, // You can add availability dates logic here
    price: property.pricePerMonth,
    rating: property.averageRating || 4.5, // Default rating
    isSuperhostBadge: false, // You can add logic for this
    isGuestFavorite: qualifiesAsGuestFavorite(property),
    isFavorite: localFavorites.has(property.id),
    onFavoriteToggle: handleFavoriteToggle,
    onCardClick: handleCardClick,
  }))

  return (
    <div className="w-full">
      <h3 className="text-sm px-4 font-bold mb-4">
        {properties.length}{' '}
        <span className="text-gray-700 font-normal">
          {placesInText()}
        </span>
      </h3>
      
      {viewMode === 'grid' ? (
        <div className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
                <div className="w-48 h-32 bg-gray-200 rounded-lg overflow-hidden relative">
                  {property.images.length > 0 && (
                    <Image
                      src={property.images[0]}
                      alt={property.title}
                      width={192}
                      height={128}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">{property.title}</h3>
                  <p className="text-gray-600 mb-2">{property.location}</p>
                  <p className="font-semibold text-lg">${property.price}{t?.perMonth ?? "/month"}</p>
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
