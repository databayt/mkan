-- Perf indexes (additive, forward-only).
--
-- 1. getStaleAvailabilityListings (AvailabilityPrompt, runs for every
--    authenticated host on every page) sorts a host's published listings by
--    lastAvailabilityConfirmedAt with nulls first — previously a full sort
--    over the host slice.
CREATE INDEX IF NOT EXISTS "Listing_hostId_isPublished_lastAvailabilityConfirmedAt_idx"
  ON "Listing"("hostId", "isPublished", "lastAvailabilityConfirmedAt");

-- 2. Guest trips/bookings inbox orders by createdAt desc within guestId.
CREATE INDEX IF NOT EXISTS "Booking_guestId_createdAt_idx"
  ON "Booking"("guestId", "createdAt");
