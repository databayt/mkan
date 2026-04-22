-- Backfill migration: schema drifted ahead of production Neon DB, so every
-- findMany on Listing 500'd with `column "cleaningFee" does not exist`.
-- SQL was first applied directly via Neon MCP on 2026-04-22 to unblock prod;
-- this file records the delta so future prisma migrate deploy runs align.

CREATE TYPE "CancellationPolicy" AS ENUM ('Flexible','Moderate','Firm','Strict','NonRefundable');

CREATE TYPE "CheckInMethod" AS ENUM ('SelfCheckIn','InPerson','Lockbox','SmartLock');

ALTER TABLE "Listing"
  ADD COLUMN "cleaningFee"        DOUBLE PRECISION     DEFAULT 0,
  ADD COLUMN "weeklyDiscount"     DOUBLE PRECISION     DEFAULT 0,
  ADD COLUMN "monthlyDiscount"    DOUBLE PRECISION     DEFAULT 0,
  ADD COLUMN "cancellationPolicy" "CancellationPolicy" DEFAULT 'Flexible',
  ADD COLUMN "checkInTime"        TEXT,
  ADD COLUMN "checkOutTime"       TEXT,
  ADD COLUMN "checkInMethod"      "CheckInMethod",
  ADD COLUMN "houseRules"         JSONB,
  ADD COLUMN "minStay"            INTEGER              DEFAULT 1,
  ADD COLUMN "maxStay"            INTEGER              DEFAULT 365,
  ADD COLUMN "advanceNotice"      INTEGER              DEFAULT 1,
  ADD COLUMN "preparationTime"    INTEGER              DEFAULT 0,
  ADD COLUMN "availabilityWindow" INTEGER              DEFAULT 12;
