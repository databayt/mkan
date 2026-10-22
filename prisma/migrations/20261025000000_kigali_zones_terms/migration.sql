-- Kigali zones on Location, move-in terms on Listing, two-way edits on Broker. Additive only.
CREATE TYPE "TermsSource" AS ENUM ('AD', 'BROKER');

ALTER TABLE "Location" ADD COLUMN "sector" TEXT, ADD COLUMN "neighbourhood" TEXT;
CREATE INDEX "Location_sector_idx" ON "Location"("sector");
CREATE INDEX "Location_neighbourhood_idx" ON "Location"("neighbourhood");

ALTER TABLE "Listing"
  ADD COLUMN "depositMonths" DOUBLE PRECISION,
  ADD COLUMN "commissionPct" DOUBLE PRECISION,
  ADD COLUMN "noCommission" BOOLEAN,
  ADD COLUMN "viewingFee" INTEGER,
  ADD COLUMN "waterIncluded" BOOLEAN,
  ADD COLUMN "electricityIncluded" BOOLEAN,
  ADD COLUMN "termsSource" "TermsSource";

ALTER TABLE "Broker"
  ADD COLUMN "zoneSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "syncedAt" TIMESTAMP(3),
  ADD COLUMN "mergedIntoId" TEXT;
