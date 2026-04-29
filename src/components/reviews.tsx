import { Star } from "lucide-react"
import Image from "next/image"

import { getListingReviews } from "@/lib/actions/review-actions"
import { getDictionary } from "@/components/internationalization/dictionaries"
import { formatDate } from "@/lib/i18n/formatters"
import type { Locale } from "@/components/internationalization/config"

interface ReviewsProps {
  listingId: number
  lang: Locale
}

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&h=120&fit=crop&crop=face"

export default async function Reviews({ listingId, lang }: ReviewsProps) {
  const [{ reviews, total }, dict] = await Promise.all([
    getListingReviews(listingId, { take: 6 }).catch(() => ({ reviews: [], total: 0 })),
    getDictionary(lang),
  ])

  const t = (dict.rental?.reviewsList as Record<string, string> | undefined) ?? {}
  const heading = t.heading ?? "What guests are saying"

  if (total === 0) {
    return (
      <div className="max-w-7xl mx-auto py-8">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">{heading}</h2>
          <p className="text-gray-600">{t.empty ?? "No reviews yet — be the first to share your experience."}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto py-8">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">{heading}</h2>
        <p className="text-gray-600">{t.subhead ?? "Read reviews from recent guests"}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {reviews.map((review) => {
          const reviewer = review.reviewer
          const name =
            reviewer?.username ?? reviewer?.id?.slice(0, 8) ?? "Guest"
          return (
            <article key={review.id} className="space-y-3">
              <div className="flex items-center gap-4">
                <Image
                  src={reviewer?.image ?? FALLBACK_AVATAR}
                  alt={name}
                  width={60}
                  height={60}
                  className="rounded-full object-cover"
                />
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">{name}</h3>
                  <p className="text-sm text-gray-600">
                    {formatDate(review.createdAt, lang)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${i < review.rating ? "fill-black text-black" : "text-gray-300"}`}
                  />
                ))}
              </div>
              {review.comment && (
                <p className="text-sm text-gray-700 leading-relaxed">{review.comment}</p>
              )}
              {review.hostReply && (
                <div className="ms-4 mt-2 border-s-2 border-muted pl-3 ps-3">
                  <p className="text-xs text-muted-foreground">{review.hostReply}</p>
                </div>
              )}
            </article>
          )
        })}
      </div>

      {total > 6 && (
        <div className="mt-8">
          <a
            href="#"
            className="text-sm text-gray-600 underline hover:text-gray-900 transition-colors"
          >
            {t.learnMore ?? "Learn how reviews work"}
          </a>
        </div>
      )}
    </div>
  )
}
