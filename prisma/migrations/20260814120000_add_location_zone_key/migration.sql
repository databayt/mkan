-- Marketplace zones for the supply/demand density report.
--
-- `Location.city` is free text written at import time and it is wrong for 20%
-- of live listings: measured against the coordinates, 16 rows filed as
-- "Khartoum" are actually across the Blue Nile in Bahri and 10 are in Omdurman.
-- Grouping acquisition decisions by that column would send the team to the
-- wrong side of the river.
--
-- `zoneKey` is derived from (latitude, longitude) by `classifyPoint` in
-- src/lib/geo/sudan-places.ts — the gazetteer that already existed for the CRM
-- crawler, now shared rather than duplicated. It is denormalised onto the row
-- because that classification is JS (the greater-Khartoum rule interpolates the
-- Nile meridian) and cannot run inside a GROUP BY.
--
-- Nullable and backfilled by scripts/backfill-zone-keys.ts, so this migration
-- stays instant and cannot fail on bad coordinates.
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "zoneKey" TEXT;

CREATE INDEX IF NOT EXISTS "Location_zoneKey_idx" ON "Location"("zoneKey");
