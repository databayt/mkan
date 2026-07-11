/**
 * Guest favorite qualification — mirrors Airbnb's published criteria:
 * "based on ratings, reviews, and reliability". Airbnb requires a ~4.9+
 * overall rating across at least 5 reviews plus host-reliability signals
 * (cancellation rate, support incidents) we don't track yet, and recomputes
 * dynamically as reviews land. Here the review thresholds are live, and the
 * curated `isGuestFavorite` flag stands in for the reliability leg so the
 * operator can badge trusted homes before organic reviews accumulate.
 */
export const GUEST_FAVORITE_MIN_RATING = 4.9;
export const GUEST_FAVORITE_MIN_REVIEWS = 5;

export interface GuestFavoriteSignals {
  averageRating?: number | null;
  numberOfReviews?: number | null;
  /** Operator-curated badge (schema.prisma Listing.isGuestFavorite). */
  isGuestFavorite?: boolean | null;
}

export function qualifiesAsGuestFavorite(listing: GuestFavoriteSignals): boolean {
  if (listing.isGuestFavorite) return true;
  return (
    (listing.averageRating ?? 0) >= GUEST_FAVORITE_MIN_RATING &&
    (listing.numberOfReviews ?? 0) >= GUEST_FAVORITE_MIN_REVIEWS
  );
}
