import Reviews from "@/components/reviews"
import type { Locale } from "@/components/internationalization/config"

interface ReviewProps {
  listingId: number
  lang: Locale
  /** Operator-curated Listing.isGuestFavorite — threaded down to the hero gating. */
  curatedGuestFavorite?: boolean
}

export default function Review({ listingId, lang, curatedGuestFavorite }: ReviewProps) {
  return (
    <div>
      <Reviews listingId={listingId} lang={lang} curatedGuestFavorite={curatedGuestFavorite} />
    </div>
  )
}
