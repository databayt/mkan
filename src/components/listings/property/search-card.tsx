"use client"

import React, { useState } from "react"
import Image from "next/image"
import { Heart, Star, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { useLocale } from "@/components/internationalization/use-locale"
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters"
import { PropertyImageFallback } from "@/components/atom/property-image-fallback"

// Exact Airbnb palette (measured from the live /s/homes search cards):
//   title / price / rating  → #222222
//   subtitle / specs / dates → #6a6a6a
const DARK = "#222222"
const GRAY = "#6a6a6a"

export interface SearchCardProps {
  id: string
  images: string[]
  /** Listing title — row 1, near-black medium. */
  title: string
  /** Secondary gray line under the title (e.g. "Entire home in Khartoum"). */
  subtitle?: string
  /** Specs line, pre-joined (e.g. "2 beds · 1 bath"). */
  specs?: string
  /** Optional trip dates (e.g. "Jul 1 – 6"). Omitted when no dates are set. */
  dates?: string
  /** Per-night price. Always present. */
  pricePerNight: number
  /** When a date range is active, the trip total + its night count render as
      "{total} for {nights} nights" instead of the per-night price. */
  totalPrice?: number
  /** Pre-discount price (per-night or trip total). When higher than the shown
      price it renders struck-through before it, like Airbnb's discounted cards. */
  originalPrice?: number
  nights?: number
  /** Average rating; null/0 hides the rating cluster (matches Airbnb). */
  rating?: number | null
  reviewsCount?: number
  isFavorite?: boolean
  onFavoriteToggle?: (id: string, isFavorite: boolean) => void
  onCardClick?: (id: string) => void
  priority?: boolean
}

export function SearchCard({
  id,
  images = [],
  title,
  subtitle,
  specs,
  dates,
  pricePerNight,
  totalPrice,
  originalPrice,
  nights,
  rating,
  reviewsCount = 0,
  isFavorite = false,
  onFavoriteToggle,
  onCardClick,
  priority = false,
}: SearchCardProps) {
  const dict = useDictionary()
  const { locale } = useLocale()
  const sp = dict.rental?.searchPage as Record<string, string> | undefined
  const card = dict.rental?.property?.card as Record<string, string> | undefined

  const [index, setIndex] = useState(0)
  const [liked, setLiked] = useState(isFavorite)

  const hasPhotos = images.length > 0
  const photos = hasPhotos ? images : []
  const dotCount = Math.min(photos.length, 5)
  const hasRating = rating != null && reviewsCount > 0
  // Airbnb shows "New" (with a star) on listings that have no reviews yet.
  const newLabel = sp?.new ?? "New"

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    setLiked((v) => !v)
    onFavoriteToggle?.(id, !liked)
  }

  const go = (e: React.MouseEvent, dir: -1 | 1) => {
    e.stopPropagation()
    setIndex((i) => Math.min(Math.max(i + dir, 0), photos.length - 1))
  }

  // Price line: trip total when dates are set, otherwise per-night.
  const priceNumber =
    nights && totalPrice != null
      ? formatCurrency(totalPrice, locale)
      : formatCurrency(pricePerNight, locale)
  const priceSuffix =
    nights && totalPrice != null
      ? (sp?.forNights ?? "for {count} nights").replace("{count}", String(nights))
      : (card?.night ?? "night")
  // Struck-through pre-discount price (only when it genuinely exceeds the shown price).
  const shownPrice = nights && totalPrice != null ? totalPrice : pricePerNight
  const originalNumber =
    originalPrice != null && originalPrice > shownPrice
      ? formatCurrency(originalPrice, locale)
      : null

  return (
    <div className="group cursor-pointer" onClick={() => onCardClick?.(id)}>
      {/* Image — 4:3, 12px radius (Airbnb measured 307×230). */}
      <div
        className="relative w-full overflow-hidden bg-muted"
        style={{ aspectRatio: "4 / 3", borderRadius: 20 }}
      >
        {hasPhotos ? (
          <Image
            src={photos[index] ?? photos[0]!}
            alt={title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            quality={65}
            className="object-cover"
            priority={priority}
          />
        ) : (
          <PropertyImageFallback seed={id || title} alt={title} />
        )}

        {/* Heart — 32×32, inset ~12px from the top-end corner. */}
        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={
            liked
              ? (card?.removeFromWishlist ?? "Remove from wishlist")
              : (card?.addToWishlist ?? "Add to wishlist")
          }
          className="absolute top-3 end-3 grid h-8 w-8 place-items-center transition-transform hover:scale-110 active:scale-95"
        >
          <Heart
            className="h-6 w-6"
            style={
              liked
                ? { fill: "#FF385C", color: "#FF385C" }
                : { fill: "rgba(0,0,0,0.5)", color: "#ffffff" }
            }
            strokeWidth={2}
          />
        </button>

        {/* Carousel arrows — appear on hover, hidden at the ends (Airbnb). */}
        {photos.length > 1 && (
          <>
            {index > 0 && (
              <button
                type="button"
                onClick={(e) => go(e, -1)}
                aria-label="Previous photo"
                className="absolute start-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition hover:scale-105 hover:bg-white group-hover:grid"
              >
                <ChevronLeft className="h-4 w-4 text-gray-800 rtl:rotate-180" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                type="button"
                onClick={(e) => go(e, 1)}
                aria-label="Next photo"
                className="absolute end-2 top-1/2 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/90 shadow-md transition hover:scale-105 hover:bg-white group-hover:grid"
              >
                <ChevronRight className="h-4 w-4 text-gray-800 rtl:rotate-180" />
              </button>
            )}

            {/* Dots — centered ~18px above the image bottom. */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
              {Array.from({ length: dotCount }).map((_, i) => (
                <span
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: 6,
                    height: 6,
                    backgroundColor:
                      i === Math.min(index, dotCount - 1)
                        ? "#ffffff"
                        : "rgba(255,255,255,0.6)",
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Text block. Top margin pulls row 1 tight to the image (Airbnb: -3px). */}
      <div className="mt-2">
        {/* Row 1 — title + rating */}
        <div className="flex items-start justify-between gap-2">
          <h3
            className="truncate font-medium"
            style={{ fontSize: 15, lineHeight: "19px", color: DARK }}
          >
            {title}
          </h3>
          {hasRating ? (
            <div
              className="flex shrink-0 items-center gap-1"
              style={{ fontSize: 15, lineHeight: "19px", color: DARK }}
            >
              <Star className="h-3 w-3 shrink-0" style={{ fill: DARK, color: DARK }} />
              <span>
                {formatNumber(rating as number, locale, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                {reviewsCount > 0 && ` (${formatNumber(reviewsCount, locale)})`}
              </span>
            </div>
          ) : (
            <div
              className="flex shrink-0 items-center gap-1"
              style={{ fontSize: 15, lineHeight: "19px", color: DARK }}
            >
              <Star className="h-3 w-3 shrink-0" style={{ fill: DARK, color: DARK }} />
              <span>{newLabel}</span>
            </div>
          )}
        </div>

        {/* Row 2 — subtitle */}
        {subtitle && (
          <p className="truncate" style={{ fontSize: 15, lineHeight: "19px", color: GRAY }}>
            {subtitle}
          </p>
        )}

        {/* Row 3 — specs */}
        {specs && (
          <p className="truncate" style={{ fontSize: 15, lineHeight: "19px", color: GRAY }}>
            {specs}
          </p>
        )}

        {/* Row 4 — dates (only when a date range is active) */}
        {dates && (
          <p className="truncate" style={{ fontSize: 15, lineHeight: "19px", color: GRAY }}>
            {dates}
          </p>
        )}

        {/* Row 5 — price (optional struck-through original, then the discounted/underlined price) */}
        <p className="mt-1" style={{ fontSize: 15, lineHeight: "19px", color: DARK }}>
          {originalNumber && (
            <>
              <span style={{ color: GRAY, textDecorationLine: "line-through" }}>
                {originalNumber}
              </span>{" "}
            </>
          )}
          <span className="font-medium underline underline-offset-2">{priceNumber}</span>{" "}
          <span style={{ color: GRAY }}>{priceSuffix}</span>
        </p>
      </div>
    </div>
  )
}
