-- mkan's own public listing code — `NNNN-NN` (host account number + unit
-- sequence). Until now this lived in `Listing.sourceListingId`, which the
-- schema documents as the EXTERNAL id (the Airbnb room id). One column
-- carrying two meanings cost real things:
--
--   * the 8 scraped listings promoted to a code had their Airbnb room id
--     overwritten, so `scripts/crm/sync-up.ts`'s byAirbnbId map stopped
--     finding them (the room id survives in `sourceUrl`, so it is recoverable
--     — scripts/backfill-listing-code.ts restores it);
--   * nothing could constrain the code's shape without also constraining
--     external ids.
--
-- Nullable + unique, backfilled by scripts/backfill-listing-code.ts, so this
-- migration is instant and cannot fail on existing rows.
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Listing_code_key" ON "Listing"("code");
