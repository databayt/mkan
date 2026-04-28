import Reviews from "@/components/reviews"
import type { Locale } from "@/components/internationalization/config"

interface ReviewProps {
  listingId: number
  lang: Locale
}

export default function Review({ listingId, lang }: ReviewProps) {
  return (
    <div>
      <Reviews listingId={listingId} lang={lang} />
    </div>
  )
}
