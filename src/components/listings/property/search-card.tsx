"use client"

import React from "react"
import { Heart, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { useFavorites } from "@/components/favorites/favorites-context"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { useLocale } from "@/components/internationalization/use-locale"
import { formatCurrency, formatNumber } from "@/lib/i18n/formatters"
import GuestFavoriteBadge from "@/components/listings/guest-favorite-badge"
import { ImageCarousel } from "./image-carousel"

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
  isGuestFavorite = false,
  isFavorite = false,
  onFavoriteToggle,
  onCardClick,
  linkId,
  priority = false,
}: SearchCardProps) {
  const dict = useDictionary()
  const { locale } = useLocale()
  const sp = dict.rental?.searchPage as Record<string, string> | undefined
  const card = dict.rental?.property?.card as Record<string, string> | undefined
  const guestFavorite = dict.property?.guestFavorite as Record<string, string> | undefined

  // Shared favorites provider — one heart state across cards/detail/mobile.
  const fav = useFavorites()
  const liked = fav.ready ? fav.isFavorite(id) : isFavorite

  const hasRating = rating != null && reviewsCount > 0
  // Airbnb shows "New" (with a star) on listings that have no reviews yet.
  const newLabel = sp?.new ?? "New"

  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation()
    fav.toggle(id)
    onFavoriteToggle?.(id, !liked)
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
    <div className="group cursor-pointer" onClick={() => onCardClick?.(linkId ?? id)}>
      {/* Image — 4:3, swipeable strip with the exact Airbnb dots. */}
      <ImageCarousel
        images={images}
        alt={title}
        seed={id || title}
        priority={priority}
        radius={20}
        prevLabel={card?.previousPhoto ?? "Previous photo"}
        nextLabel={card?.nextPhoto ?? "Next photo"}
      >
        {/* "Guest favorite" pill — top-start corner, per the live card. */}
        {isGuestFavorite && (
          <GuestFavoriteBadge
            label={guestFavorite?.title ?? "Guest favorite"}
          />
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
          className="absolute top-3 end-3 z-10 grid h-8 w-8 place-items-center transition-transform hover:scale-110 active:scale-95"
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
      </ImageCarousel>

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
