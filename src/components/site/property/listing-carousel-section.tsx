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

interface ListingCarouselSectionProps {
  title: string
  href?: string
  listings: Listing[]
  className?: string
}

export function ListingCarouselSection({
  title,
  href,
  listings,
  className,
}: ListingCarouselSectionProps) {
  const router = useRouter()
  const { locale } = useLocale()

  const handleFavoriteToggle = async (propertyId: string, isFavorite: boolean) => {
    // TODO: Implement favorites functionality with server actions
    console.log('Toggle favorite:', propertyId, isFavorite)
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
    isFavorite: false,
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
        <CarouselContent className="-ml-4">
          {transformedListings.map((property) => (
            <CarouselItem
              key={property.id}
              className="pl-4 basis-[85%] sm:basis-1/2 lg:basis-1/4"
            >
              <PropertyCard {...property} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </section>
  )
}
