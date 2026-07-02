import Image from "next/image"

import { getListingReviews, getReviewSummary } from "@/lib/actions/review-actions"
import { getDictionary } from "@/components/internationalization/dictionaries"
import { formatDate } from "@/lib/i18n/formatters"
import type { Locale } from "@/components/internationalization/config"
import Laurel from "@/components/listings/laurel"

interface ReviewsProps {
  listingId: number
  lang: Locale
}

const FALLBACK_AVATAR =
  "https://cdn.databayt.org/mkan/stock/photo-1534528741775-53994a69daeb.jpg"

// Authentic Airbnb rating star (viewBox 0 0 32 32, fill #222222) — lifted from
// the live reviews block; rendered tiny (≈10px) in the card meta rows.
const STAR_D =
  "m15.1 1.58-4.13 8.88-9.86 1.27a1 1 0 0 0-.54 1.74l7.3 6.57-1.97 9.85a1 1 0 0 0 1.48 1.06l8.62-5 8.63 5a1 1 0 0 0 1.48-1.06l-1.97-9.85 7.3-6.57a1 1 0 0 0-.55-1.73l-9.86-1.28-4.12-8.88a1 1 0 0 0-1.82 0z"
function Star({ size = 10, faded = false }: { size?: number; faded?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" style={{ display: "block", fill: faded ? "#DDDDDD" : "#222222" }}>
      <path fillRule="evenodd" d={STAR_D} />
    </svg>
  )
}

// The six review-category glyphs, verbatim from the live reviews DOM (32-grid).
// All solid currentColor except Communication, which is a stroke icon.
const CATEGORIES: { label: string; d: string; stroke?: boolean }[] = [
  { label: "Cleanliness", d: "M24 0v6h-4.3c.13 1.4.67 2.72 1.52 3.78l.2.22-1.5 1.33a9.05 9.05 0 0 1-2.2-5.08c-.83.38-1.32 1.14-1.38 2.2v4.46l4.14 4.02a5 5 0 0 1 1.5 3.09l.01.25.01.25v8.63a3 3 0 0 1-2.64 2.98l-.18.01-.21.01-12-.13A3 3 0 0 1 4 29.2L4 29.02v-8.3a5 5 0 0 1 1.38-3.45l.19-.18L10 12.9V8.85l-4.01-3.4.02-.7A5 5 0 0 1 10.78 0H11zm-5.03 25.69a8.98 8.98 0 0 1-6.13-2.41l-.23-.23A6.97 6.97 0 0 0 6 21.2v7.82c0 .51.38.93.87 1H7l11.96.13h.13a1 1 0 0 0 .91-.88l.01-.12v-3.52c-.34.04-.69.06-1.03.06zM17.67 2H11a3 3 0 0 0-2.92 2.3l-.04.18-.01.08 3.67 3.1h2.72l.02-.1a4.29 4.29 0 0 1 3.23-3.4zM30 4a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-3-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm-5 0h-2.33v2H22zm8-2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM20 20.52a3 3 0 0 0-.77-2l-.14-.15-4.76-4.61v-4.1H12v4.1l-5.06 4.78a3 3 0 0 0-.45.53 9.03 9.03 0 0 1 7.3 2.34l.23.23A6.98 6.98 0 0 0 20 23.6z" },
  { label: "Accuracy", d: "M16 1a15 15 0 1 1 0 30 15 15 0 0 1 0-30zm0 2a13 13 0 1 0 0 26 13 13 0 0 0 0-26zm7 7.59L24.41 12 13.5 22.91 7.59 17 9 15.59l4.5 4.5z" },
  { label: "Check-in", d: "M16.84 27.16v-3.4l-.26.09c-.98.32-2.03.51-3.11.55h-.7A11.34 11.34 0 0 1 1.72 13.36v-.59A11.34 11.34 0 0 1 12.77 1.72h.59c6.03.16 10.89 5.02 11.04 11.05V13.45a11.3 11.3 0 0 1-.9 4.04l-.13.3 7.91 7.9v5.6H25.7l-4.13-4.13zM10.31 7.22a3.1 3.1 0 1 1 0 6.19 3.1 3.1 0 0 1 0-6.2zm0 2.06a1.03 1.03 0 1 0 0 2.06 1.03 1.03 0 0 0 0-2.06zM22.43 25.1l4.12 4.13h2.67v-2.67l-8.37-8.37.37-.68.16-.3c.56-1.15.9-2.42.96-3.77v-.64a9.28 9.28 0 0 0-9-9h-.55a9.28 9.28 0 0 0-9 9v.54a9.28 9.28 0 0 0 13.3 8.1l.3-.16 1.52-.8v4.62z" },
  { label: "Communication", stroke: true, d: "m25.5 3.5c2.2091 0 4 1.79086 4 4v13.8333c0 2.2092-1.7909 4-4 4h-5.8192l-3.6808 4.5-3.6832-4.5h-5.8168c-2.20914 0-4-1.7908-4-4v-13.8333c0-2.20914 1.79086-4 4-4z" },
  { label: "Location", d: "M30.95 3.81a2 2 0 0 0-2.38-1.52l-7.58 1.69-10-2-8.42 1.87A1.99 1.99 0 0 0 1 5.8v21.95a1.96 1.96 0 0 0 .05.44 2 2 0 0 0 2.38 1.52l7.58-1.69 10 2 8.42-1.87A1.99 1.99 0 0 0 31 26.2V4.25a1.99 1.99 0 0 0-.05-.44zM12 4.22l8 1.6v21.96l-8-1.6zM3 27.75V5.8l-.22-.97.22.97 7-1.55V26.2zm26-1.55-7 1.55V5.8l7-1.55z" },
  { label: "Value", d: "M16.17 2a3 3 0 0 1 1.98.74l.14.14 11 11a3 3 0 0 1 .14 4.1l-.14.14L18.12 29.3a3 3 0 0 1-4.1.14l-.14-.14-11-11A3 3 0 0 1 2 16.37l-.01-.2V5a3 3 0 0 1 2.82-3h11.35zm0 2H5a1 1 0 0 0-1 .88v11.29a1 1 0 0 0 .2.61l.1.1 11 11a1 1 0 0 0 1.31.08l.1-.08L27.88 16.7a1 1 0 0 0 .08-1.32l-.08-.1-11-11a1 1 0 0 0-.58-.28L16.17 4zM9 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" },
]
function CategoryIcon({ d, stroke }: { d: string; stroke?: boolean }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      role="presentation"
      style={{ display: "block", height: 32, width: 32, ...(stroke ? { fill: "none", stroke: "#222222", strokeWidth: 2, overflow: "visible" } : { fill: "#222222" }) }}
    >
      <path d={d} />
    </svg>
  )
}

export default async function Reviews({ listingId, lang }: ReviewsProps) {
  const [{ reviews, total }, summary, dict] = await Promise.all([
    getListingReviews(listingId, { take: 6 }).catch(() => ({ reviews: [], total: 0 })),
    getReviewSummary(listingId).catch(() => ({
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>,
    })),
    getDictionary(lang),
  ])

  const t = (dict.rental?.reviewsList as Record<string, string> | undefined) ?? {}

  if (total === 0) {
    return (
      <section className="border-b border-[#DDDDDD] py-12">
        <h2 className="mb-2 text-[22px] font-semibold text-[#222222]">{t.heading ?? "Reviews"}</h2>
        <p className="text-[#6A6A6A]">{t.empty ?? "No reviews yet — be the first to share your experience."}</p>
      </section>
    )
  }

  const avg = summary.averageRating || 0
  const dist = summary.ratingDistribution
  const isGuestFavorite = avg >= 4.5 && total >= 1
  const withN = (text: string) => text.replace("{n}", String(total))

  // Distribution bar rows (shared between the full lg breakdown and the small fallback).
  const bars = (
    <ol className="space-y-0">
      {[5, 4, 3, 2, 1].map((star) => {
        const count = dist[star as 1 | 2 | 3 | 4 | 5] ?? 0
        const pct = total ? (count / total) * 100 : 0
        return (
          <li key={star} className="flex h-4 items-center gap-2">
            <span className="w-1.5 text-[12px] leading-4 text-[#222222]">{star}</span>
            <div className="h-1 w-[124px] overflow-hidden rounded-full bg-[#DDDDDD]">
              <div className="h-1 rounded-full bg-[#222222]" style={{ width: `${pct}%`, minWidth: pct > 0 ? 2 : 0 }} />
            </div>
          </li>
        )
      })}
    </ol>
  )

  return (
    <section className="border-b border-[#DDDDDD] py-12">
      {/* Hero */}
      {isGuestFavorite ? (
        <div className="mb-12 mt-4 flex flex-col items-center text-center">
          <div className="flex items-end justify-center gap-1.5">
            <Laurel side="left" size={132} />
            <span className="-mt-2 text-[100px] font-medium leading-none tracking-[-2px] text-[#222222]">
              {avg.toFixed(1)}
            </span>
            <Laurel side="right" size={132} />
          </div>
          <h2 className="mt-2 text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
            {t.guestFavorite ?? "Guest favorite"}
          </h2>
          <p className="mt-2 max-w-[380px] text-[18px] leading-6 text-[#6A6A6A]">
            {t.guestFavoriteDesc ?? "This home is a guest favorite based on ratings, reviews, and reliability"}
          </p>
        </div>
      ) : (
        <h2 className="mb-8 flex items-center gap-2 text-[22px] font-semibold text-[#222222]">
          <Star size={20} /> {avg.toFixed(1)} · {withN(t.reviewsCount ?? "{n} reviews")}
        </h2>
      )}

      {/* Full breakdown (lg+): Overall-rating bars + 6 category columns w/ dividers */}
      <div className="mb-10 hidden border-b border-[#DDDDDD] pb-10 lg:grid lg:grid-cols-[170px_repeat(6,1fr)]">
        <div className="pe-6">
          <h3 className="mb-2 text-base text-[#222222]">{t.overallRating ?? "Overall rating"}</h3>
          {bars}
        </div>
        {CATEGORIES.map((c) => (
          <div key={c.label} className="flex h-[106px] flex-col justify-between border-s border-[#DDDDDD] px-6">
            <div>
              <div className="text-[12px] font-medium leading-[18px] text-[#222222]">{c.label}</div>
              <div className="mt-0.5 text-[18px] font-medium leading-6 text-[#222222]">{avg.toFixed(1)}</div>
            </div>
            <CategoryIcon d={c.d} stroke={c.stroke} />
          </div>
        ))}
      </div>

      {/* Compact breakdown (below lg): just the distribution bars */}
      <div className="mb-10 max-w-xs lg:hidden">
        <h3 className="mb-3 text-sm font-medium text-[#222222]">{t.overallRating ?? "Overall rating"}</h3>
        {bars}
      </div>

      {/* Review cards — 2-col, 40px row gap */}
      <div className="grid grid-cols-1 gap-x-[88px] gap-y-10 md:grid-cols-2">
        {reviews.map((review) => {
          const reviewer = review.reviewer
          const name = reviewer?.username ?? reviewer?.id?.slice(0, 8) ?? "Guest"
          return (
            <article key={review.id} className="space-y-3">
              <div className="flex items-center gap-[14px]">
                <Image
                  src={reviewer?.image ?? FALLBACK_AVATAR}
                  alt={name}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full bg-[#DDDDDD] object-cover"
                />
                <div>
                  <h3 className="text-base font-medium leading-5 text-[#222222]">{name}</h3>
                  <p className="text-sm leading-[18px] text-[#6A6A6A]">{t.onAirbnb ?? "Guest on Mkan"}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-[#6A6A6A]">
                <div className="flex items-center gap-px">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={10} faded={i >= review.rating} />
                  ))}
                </div>
                <span aria-hidden>·</span>
                <span>{formatDate(review.createdAt, lang)}</span>
              </div>
              {review.comment && (
                <p className="line-clamp-3 whitespace-pre-wrap text-base leading-6 text-[#222222]">
                  {review.comment}
                </p>
              )}
              {review.hostReply && (
                <div className="ms-4 mt-2 border-s-2 border-[#DDDDDD] ps-3">
                  <p className="text-xs text-[#6A6A6A]">{review.hostReply}</p>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {/* Show all reviews */}
      {total > reviews.length && (
        <button
          type="button"
          className="mt-10 rounded-lg bg-[#F7F7F7] px-6 py-3.5 text-base font-semibold text-[#222222] transition-colors hover:bg-[#EBEBEB]"
        >
          {withN(t.showAll ?? "Show all {n} reviews")}
        </button>
      )}
    </section>
  )
}
