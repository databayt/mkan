-- Curated "Guest favorite" badge, operator-set and independent of review counts.
-- Additive, non-destructive: existing rows default to false.
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "isGuestFavorite" BOOLEAN NOT NULL DEFAULT false;
