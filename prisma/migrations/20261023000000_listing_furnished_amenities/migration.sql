-- Rental agent (/find) best match: what Kigali tenants ask a broker first —
-- a water tank, backup power, furnished or not — as listing data the agent
-- can rank on. Filled for TikTok leads by `crm:tiktok-mirror` from the
-- reader's features. Additive only.
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'WaterTank';
ALTER TYPE "Amenity" ADD VALUE IF NOT EXISTS 'BackupGenerator';
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "furnished" BOOLEAN;
