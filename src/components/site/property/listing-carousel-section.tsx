"use client"

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/components/internationalization/use-locale'
import { PropertyCard } from './card'
import { Listing } from '@/types/listing'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel'
import { cn } from '@/lib/utils'
import { addFavoriteProperty, removeFavoriteProperty } from '@/lib/actions/user-actions'
import { useSession } from 'next-auth/react'

interface ListingCarouselSectionProps {
  title: string
  href?: string
  listings: Listing[]
  className?: string
  favoriteIds?: number[]
}

export function ListingCarouselSection({
  title,
  href,
  listings,
  className,
  favoriteIds = [],
}: ListingCarouselSectionProps) {
  const router = useRouter()
  const { locale } = useLocale()
  const { data: session } = useSession()
  const [localFavorites, setLocalFavorites] = React.useState<Set<number>>(new Set(favoriteIds))

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

  if (!listings || listings.length === 0) {
    return null
  }

  // Transform listings to match PropertyCard interface
  const transformedListings = listings.map(listing => ({
    id: listing.id.toString(),
    images: listing.photoUrls || [],
    title: listing.title || "Property",
    location: `${listing.location?.city || ""}, ${listing.location?.state || ""}`,
    dates: undefined,
    price: listing.pricePerNight || 0,
    rating: listing.averageRating || 4.5,
    isSuperhostBadge: false,
    isFavorite: localFavorites.has(listing.id),
    onFavoriteToggle: handleFavoriteToggle,
    onCardClick: handleCardClick,
  }))

  const titleContent = (
    <>
      {title}
      <svg
        className="w-3 h-3 mt-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={4}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </>
  )

  const titleClassName = "text-xl font-bold mb-6 flex items-center gap-1 hover:text-gray-700 transition-colors cursor-pointer"

  return (
    <section className={cn("w-full", className)}>
      {href ? (
        <Link href={href} className={titleClassName}>
          {titleContent}
        </Link>
      ) : (
        <div className={titleClassName}>
          {titleContent}
        </div>
      )}

      <Carousel
        opts={{
          align: "start",
          dragFree: true,
          loop: false,
        }}
        className="w-full"
      >
        <CarouselContent className="-ms-4">
          {transformedListings.map((property) => (
            <CarouselItem
              key={property.id}
              className="ps-4 basis-[85%] sm:basis-1/2 lg:basis-1/4"
            >
              <PropertyCard {...property} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  )
}
