"use client"

import React, { useState } from 'react'
import { Heart, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useFavorites } from "@/components/favorites/favorites-context"
import { useDictionary } from '@/components/internationalization/dictionary-context'
import { useLocale } from '@/components/internationalization/use-locale'
import { formatCurrency, formatNumber } from '@/lib/i18n/formatters'
import { PropertyImage } from '@/components/atom/property-image'
import GuestFavoriteBadge from '@/components/listings/guest-favorite-badge'

interface PropertyCardProps {
  id: string
  images: string[]
  title: string
  location: string
  dates?: string
  price: number
  rating: number
  isSuperhostBadge?: boolean
  /** "Guest favorite" pill on the image's top-start corner (Airbnb). */
  isGuestFavorite?: boolean
  isFavorite?: boolean
  onFavoriteToggle?: (id: string, isFavorite: boolean) => void
  onCardClick?: (id: string) => void
  /** URL segment to navigate to — the mkan code (`0001-01`) when the listing
      has one. Deliberately separate from `id`: `id` is the favourites key and
      has to stay the numeric row id, because the handlers `parseInt` it and
      `parseInt("0001-01")` is 1 — one heart on the wrong listing. */
  linkId?: string
  className?: string
  priority?: boolean
}

export function PropertyCard({
  id,
  images = [],
  title,
  location,
  dates,
  price,
  rating,
  isSuperhostBadge = false,
  isGuestFavorite = false,
  isFavorite = false,
  onFavoriteToggle,
  onCardClick,
  linkId,
  className,
  priority = false
}: PropertyCardProps) {
  const dict = useDictionary()
  const { locale } = useLocale()
  const guestFavoriteLabel =
    (dict.property?.guestFavorite as Record<string, string> | undefined)?.title ?? 'Guest favorite'
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  // Shared favorites provider — one heart state across cards/detail/mobile.
  const fav = useFavorites()
  const isLiked = fav.ready ? fav.isFavorite(id) : isFavorite

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    fav.toggle(id)
    onFavoriteToggle?.(id, !isLiked)
  }

  const handleCardClick = () => {
    onCardClick?.(linkId ?? id)
  }

  const handleImageNavigation = (e: React.MouseEvent, index: number) => {
    e.stopPropagation()
    setCurrentImageIndex(index)
  }

  // No photos → branded seeded-gradient fallback (not a stand-in image src).
  const hasPhotos = images.length > 0

  return (
    <div
      className={cn(
        "w-full max-w-none sm:max-w-sm cursor-pointer group",
        className
      )}
      onClick={handleCardClick}
    >
      {/* Image Container */}
      <div className="relative mb-3">
        {/* Main Image */}
        <div className="relative w-full aspect-[4/3] bg-gray-200 rounded-md overflow-hidden">
          <PropertyImage
            src={hasPhotos ? (images[currentImageIndex] ?? images[0]) : undefined}
            alt={title}
            variant="card"
            priority={priority}
            seed={id || title}
            className="transition-transform duration-300 group-hover:scale-105"
          />

          {/* Favorite Button */}
          <button
            className="absolute top-3 end-3.5 w-6 h-6 backdrop-blur-sm bg-white/20 hover:bg-white/30 rounded-full border border-white/20 flex items-center justify-center transition-colors"
            onClick={handleFavoriteClick}
          >
            <Heart
              className={cn(
                "w-4 h-4 transition-colors",
                isLiked ? "fill-red-500 text-red-500" : "text-white"
              )}
            />
          </button>

          {/* Guest favorite pill — owns the top-start corner over superhost */}
          {isGuestFavorite && (
            <GuestFavoriteBadge label={guestFavoriteLabel} />
          )}

          {/* Superhost Badge */}
          {!isGuestFavorite && isSuperhostBadge && (
            <Badge
              variant="secondary"
              className="absolute top-3 start-3 bg-white text-gray-800 text-xs font-medium"
            >
              {dict.rental?.property?.card?.superhost}
            </Badge>
          )}

          {/* Image Navigation Dots */}
          {hasPhotos && images.length > 1 && (
            <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 flex space-x-1">
              {images.map((_, index) => (
                <button
                  key={index}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all duration-200",
                    index === currentImageIndex
                      ? "bg-white"
                      : "bg-white/50 hover:bg-white/70"
                  )}
                  onClick={(e) => handleImageNavigation(e, index)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="space-y-1 leading-tight">
        {/* Title and Location Row */}
        <div className="flex items-center gap-2 leading-tight">
          <h5 className="text-gray-900 font-normal text-sm truncate leading-tight">
            {title}
          </h5>
          <span className="text-gray-900 font-normal text-sm truncate leading-tight">
            {dict.rental?.property?.card?.in} {location}
          </span>
        </div>

        {/* Dates */}
        {dates && (
          <div className="text-gray-500 text-xs leading-tight">
            <span>{dates}</span>
          </div>
        )}

        {/* Price and Rating Row */}
        <div className="flex items-center gap-2 leading-tight">
          <div className="text-gray-500 text-xs leading-tight">
            <span className="font-medium text-gray-900 leading-tight">{formatCurrency(price, locale)}</span>
            <span className="text-gray-500 text-xs leading-tight"> {dict.rental?.property?.card?.night}</span>
          </div>
          <div className="flex items-center leading-tight">
            <Star className="w-3 h-3 text-gray-500 fill-current" />
            <span className="ms-1 text-xs font-medium text-gray-500 leading-tight">
              {formatNumber(rating, locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Grid component for displaying multiple property cards
export function PropertyGrid({
  properties,
  className
}: {
  properties: Omit<PropertyCardProps, 'className'>[]
  className?: string
}) {
  return (
    <div className={cn(
      "grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-4 sm:gap-6",
      className
    )}>
      {properties.map((property) => (
        <PropertyCard
          key={property.id}
          {...property}
        />
      ))}
    </div>
  )
} 