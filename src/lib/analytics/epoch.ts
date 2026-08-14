/**
 * The date from which transaction metrics are believable.
 *
 * mkan's `Booking` table contains 35 rows that are seed data, not business:
 * every one was created on 2026-07-06, all sit in `Completed`, they span only
 * three listings, and none has a payment attached. Counted naively they render
 * as real historical rentals in every KPI card, weekly report and trend line —
 * exactly the fabricated-numbers problem `src/config/phase-flags.ts` exists to
 * prevent. The 35 matching seeded reviews are load-bearing (they feed
 * `averageRating`, `numberOfReviews` and the guest-favorite logic), so deleting
 * the bookings is not obviously safe. Excluding them from reporting is.
 *
 * A date cutoff is used rather than a `isDemo` column because it needs no
 * migration, no backfill, and no per-row judgement: everything before the day
 * instrumentation went live is unverifiable by definition, since there was no
 * tracking to verify it against.
 *
 * This applies ONLY to seeded entities — Booking, Lease, Review. It must NOT be
 * applied to `Listing` (the 140 published homes are real inventory that predates
 * it) or to `ListingEvent` (that table was created after this date, so every row
 * in it is already real).
 *
 * Override with `ANALYTICS_EPOCH` (an ISO date) if the seed is ever purged.
 */
export const ANALYTICS_EPOCH: Date = new Date(
  process.env.ANALYTICS_EPOCH || "2026-08-14T00:00:00.000Z",
);

/** True when a transaction timestamp is recent enough to report on. */
export function isReportable(at: Date | null | undefined): boolean {
  return !!at && at >= ANALYTICS_EPOCH;
}

/**
 * Clamps a period start to the epoch, so a "last 90 days" range can never reach
 * back into seed data. The dashboard surfaces the clamp so the number is never
 * silently narrower than the label claims.
 */
export function clampToEpoch(from: Date): { from: Date; clamped: boolean } {
  return from < ANALYTICS_EPOCH
    ? { from: ANALYTICS_EPOCH, clamped: true }
    : { from, clamped: false };
}
