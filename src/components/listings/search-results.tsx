"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { SearchCard } from "./property/search-card"
import { Listing } from "@/types/listing"
import { useLocale } from "@/components/internationalization/use-locale"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { formatNumber } from "@/lib/i18n/formatters"
import { addFavoriteProperty, removeFavoriteProperty } from "@/lib/actions/user-actions"

interface SearchResultsProps {
  properties: Listing[]
  favoriteIds?: number[]
  /** Trip length, when a date range is active — switches cards to a trip total. */
  nights?: number
  /** Pre-formatted trip-date label (e.g. "Jul 1 – 6") shown on every card. */
  datesLabel?: string
}

export function SearchResults({
  properties,
  favoriteIds = [],
  nights,
  datesLabel,
}: SearchResultsProps) {
  const router = useRouter()
  const { locale } = useLocale()
  const dict = useDictionary()
  const { data: session } = useSession()
  const sp = dict.rental?.searchPage as Record<string, string> | undefined
  const [favorites, setFavorites] = React.useState<Set<number>>(new Set(favoriteIds))

  const handleFavoriteToggle = async (propertyId: string, isFavorite: boolean) => {
    if (!session?.user?.id) return
    const id = parseInt(propertyId)
    setFavorites((prev) => {
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
      // Roll back the optimistic toggle on failure.
      setFavorites((prev) => {
        const next = new Set(prev)
        isFavorite ? next.delete(id) : next.add(id)
        return next
      })
    }
  }

  const handleCardClick = (propertyId: string) => {
    router.push(`/${locale}/listings/${propertyId}`)
  }

  // Build the gray specs line: "{n} bedroom(s) · {m} bath(s)" (Airbnb).
  const buildSpecs = (l: Listing): string => {
    const parts: string[] = []
    if (l.bedrooms != null) {
      const label = l.bedrooms === 1 ? (sp?.bedroom ?? "bedroom") : (sp?.bedrooms ?? "bedrooms")
      parts.push(`${formatNumber(l.bedrooms, locale)} ${label}`)
    }
    if (l.bathrooms != null) {
      const label = l.bathrooms === 1 ? (sp?.bath ?? "bath") : (sp?.baths ?? "baths")
      parts.push(`${formatNumber(l.bathrooms, locale)} ${label}`)
    }
    return parts.join(" · ")
  }

  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2"
      style={{ columnGap: "24px", rowGap: "32px" }}
    >
      {properties.map((l, index) => {
        const price = l.pricePerNight ?? 0
        return (
          <SearchCard
            key={l.id}
            id={l.id.toString()}
            images={l.photoUrls ?? []}
            title={l.title ?? ""}
            subtitle={
              l.location?.city
                ? `${sp?.entireHome ?? "Entire home in"} ${l.location.city}`
                : undefined
            }
            specs={buildSpecs(l)}
            dates={datesLabel}
            pricePerNight={price}
            totalPrice={nights ? price * nights : undefined}
            nights={nights}
            rating={l.averageRating}
            reviewsCount={l.numberOfReviews ?? 0}
            isFavorite={favorites.has(l.id)}
            onFavoriteToggle={handleFavoriteToggle}
            onCardClick={handleCardClick}
            priority={index < 4}
          />
        )
      })}
    </div>
  )
}
