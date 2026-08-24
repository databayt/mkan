"use client"

import React from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useGlobalStore } from '@/state/filters'
import { SearchCard } from './search-card'
import { PropertyImageFallback } from '@/components/atom/property-image-fallback'
import { Listing } from '@/types/listing'
import { useLocale } from '@/components/internationalization/use-locale'
import { useDictionary } from '@/components/internationalization/dictionary-context'
import { addFavoriteProperty, removeFavoriteProperty } from '@/lib/actions/user-actions'
import { useSession } from 'next-auth/react'
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters'
import { qualifiesAsGuestFavorite } from '@/lib/guest-favorite'
import { zoneLabel } from '@/lib/geo/zone'
import { listingSegment } from '@/lib/listing-code'

interface PropertyListingsProps {
  properties: Listing[]
  favoriteIds?: number[]
}

export const PropertyListings = ({ properties, favoriteIds = [] }: PropertyListingsProps) => {
  const router = useRouter()
  const { locale } = useLocale()
  const dict = useDictionary()
  const sp = dict.rental?.searchPage as Record<string, string> | undefined
  const { data: session } = useSession()
  const viewMode = useGlobalStore((s) => s.viewMode)
  const filters = useGlobalStore((s) => s.filters)
  const [localFavorites, setLocalFavorites] = React.useState<Set<number>>(new Set(favoriteIds))

  const buildLocationSubtitle = (l: Listing): string | undefined => {
    if (!l.location) return undefined
    const prefix = sp?.entireHome ?? (locale === 'ar' ? 'شقة بالكامل في' : 'Entire home in')
    const zLabel = l.location.zoneKey ? zoneLabel(l.location.zoneKey, locale) : null
    const place = zLabel && l.location.city ? `${zLabel}، ${l.location.city}` : zLabel || l.location.city || l.location.address
    return place ? `${prefix} ${place}` : undefined
  }

  // Gray specs line, mirroring /search: "{n} bedroom(s) · {m} bath(s)" (Airbnb).
  const buildSpecs = (l: Listing): string => {
    const parts: string[] = []
    if (l.bedrooms != null) {
      const label = l.bedrooms === 1 ? (sp?.bedroom ?? 'bedroom') : (sp?.bedrooms ?? 'bedrooms')
      parts.push(`${formatNumber(l.bedrooms, locale)} ${label}`)
    }
    if (l.bathrooms != null) {
      const label = l.bathrooms === 1 ? (sp?.bath ?? 'bath') : (sp?.baths ?? 'baths')
      parts.push(`${formatNumber(l.bathrooms, locale)} ${label}`)
    }
    return parts.join(' · ')
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
    router.push(`/${locale}/listings/${propertyId}`)
  }

  if (!properties || properties.length === 0) {
    return (
      <div className="w-full p-4">
        <h3 className="text-sm px-4 font-bold">
          0 <span className="text-gray-700 font-normal">{dict.rental?.listing?.propertiesAvailable ?? "Properties Available"}</span>
        </h3>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{dict.rental?.listing?.noProperties ?? "No properties found"}</h3>
            <p className="text-gray-600">{dict.rental?.listing?.adjustFilters ?? "Try adjusting your search filters to see more results."}</p>
          </div>
        </div>
      </div>
    )
  }

  // Flattened shape consumed by the list-view branch below. (The grid branch
  // renders SearchCard directly from the raw Listing so it can read city,
  // bedrooms/bathrooms, and review counts.)
  const transformedProperties = properties.map((property, index) => ({
    // `id` stays the row id — it is the favourites key. Navigation uses the
    // code via `linkId`.
    id: property.id.toString(),
    linkId: listingSegment(property),
    images: property.photoUrls ?? [],
    title: property.title ?? "Property",
    location: `${property.location?.city ?? ""}, ${property.location?.state ?? ""}`,
    dates: undefined, // You can add availability dates logic here
    price: property.pricePerNight ?? 0,
    rating: property.averageRating ?? 4.5, // Default rating
    isSuperhostBadge: false, // You can add logic for this
    isFavorite: localFavorites.has(property.id),
    onFavoriteToggle: handleFavoriteToggle,
    onCardClick: handleCardClick,
    priority: index < 4,
  }))

  return (
    <div className="w-full">
      <h3 className="text-sm px-4 font-bold mb-4">
        {properties.length}{' '}
        <span className="text-gray-700 font-normal">
          {dict.rental?.listing?.propertiesAvailable ?? "Properties Available"}
        </span>
      </h3>
      
      {viewMode === 'grid' ? (
        <div className="">
          {/* Airbnb home-card grid: 2-up on phones, 4-up on laptop. Cards are
              the shared, pixel-measured SearchCard so /listings and /search read
              identically. Vertical gutter is wider than horizontal (Airbnb). */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10">
            {properties.map((l, index) => (
              <SearchCard
                key={l.id}
                id={l.id.toString()}
                linkId={listingSegment(l)}
                images={l.photoUrls ?? []}
                title={l.title ?? ''}
                subtitle={buildLocationSubtitle(l)}
                specs={buildSpecs(l)}
                pricePerNight={l.pricePerNight ?? 0}
                rating={l.averageRating}
                reviewsCount={l.numberOfReviews ?? 0}
                isGuestFavorite={qualifiesAsGuestFavorite(l)}
                isFavorite={localFavorites.has(l.id)}
                onFavoriteToggle={handleFavoriteToggle}
                onCardClick={handleCardClick}
                priority={index < 4}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {transformedProperties.map((property, index) => (
            <div key={property.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex gap-4">
                <div className="w-48 h-32 bg-gray-200 rounded-lg overflow-hidden relative">
                  {property.images.length > 0 && property.images[0] ? (
                    <Image
                      src={property.images[0]}
                      alt={property.title}
                      width={192}
                      height={128}
                      className="w-full h-full object-cover"
                      priority={index < 4}
                    />
                  ) : (
                    <PropertyImageFallback seed={property.id || property.title} alt={property.title} />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">{property.title}</h3>
                  <p className="text-gray-600 mb-2">{property.location}</p>
                  <p className="font-semibold text-lg">{formatCurrency(property.price, locale)} / {dict.rental?.listing?.perNight ?? 'night'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
} 