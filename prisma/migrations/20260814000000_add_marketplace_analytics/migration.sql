-- Marketplace analytics: the Views and Visits stages of the funnel
-- (Listings → Views → Inquiries → Visits → Completed Rentals).
--
-- Before this migration mkan recorded no user behaviour at all: Listing had no
-- view counter, there was no event table, and the only live contact channel was
-- a bare `tel:` link with no handler. Supply was measurable and nothing else was.
--
-- Two shapes, deliberately different:
--
--   "ListingEvent" collapses to one row per (listing, type, visitor, day). A
--   refresh bumps "hits" instead of inventing a second visitor, so reach and
--   depth are both recoverable, storage is bounded by (listings × visitors ×
--   days) rather than raw traffic, and weekly/monthly rollups are a date_trunc
--   over a DATE column with no fan-out. "cityKey"/"zoneKey" are denormalised at
--   write time so zone reporting never joins back through Location.
--
--   "ListingVisit" is stateful (it has an outcome), so it stays one row per
--   viewing rather than a counter.
--
-- Written by hand and fully idempotent — every statement is guarded — because
-- this has to be safe to re-run against an environment that partially applied.
-- CREATE INDEX CONCURRENTLY is deliberately NOT used: Prisma runs migrations
-- inside a transaction, which forbids it (see
-- 20260508130000_add_listing_search_indexes for the same note). Both tables
-- start empty, so plain CREATE INDEX is instant.

-- CreateEnum (Postgres has no CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE "ListingEventType" AS ENUM (
    'VIEW',
    'CONTACT_PHONE_REVEAL',
    'CONTACT_PHONE_CLICK',
    'CONTACT_MESSAGE',
    'CONTACT_APPLICATION'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "VisitOutcome" AS ENUM ('Scheduled', 'Completed', 'NoShow', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ListingEvent" (
  "id"          SERIAL NOT NULL,
  "listingId"   INTEGER NOT NULL,
  "type"        "ListingEventType" NOT NULL,
  "day"         DATE NOT NULL,
  "visitorHash" TEXT NOT NULL,
  "userId"      TEXT,
  "hits"        INTEGER NOT NULL DEFAULT 1,
  "firstAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cityKey"     TEXT,
  "zoneKey"     TEXT,

  CONSTRAINT "ListingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ListingVisit" (
  "id"           SERIAL NOT NULL,
  "listingId"    INTEGER NOT NULL,
  "guestUserId"  TEXT,
  "contactName"  TEXT,
  "contactPhone" TEXT,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "occurredAt"   TIMESTAMP(3),
  "outcome"      "VisitOutcome" NOT NULL DEFAULT 'Scheduled',
  "notes"        TEXT,
  "recordedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ListingVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- The unique key IS the dedup mechanism: the write path upserts onto it, so a
-- refresh lands on the existing row and increments "hits".
CREATE UNIQUE INDEX IF NOT EXISTS "ListingEvent_listingId_type_day_visitorHash_key"
  ON "ListingEvent"("listingId", "type", "day", "visitorHash");

-- Platform-wide funnel by period (the dashboard's default query).
CREATE INDEX IF NOT EXISTS "ListingEvent_type_day_idx" ON "ListingEvent"("type", "day");
-- Per-listing funnel (listing detail, "high views / zero inquiries" reports).
CREATE INDEX IF NOT EXISTS "ListingEvent_listingId_type_day_idx" ON "ListingEvent"("listingId", "type", "day");
-- Zone density reporting; cityKey is the phase-1 fallback until zones are backfilled.
CREATE INDEX IF NOT EXISTS "ListingEvent_cityKey_type_day_idx" ON "ListingEvent"("cityKey", "type", "day");
CREATE INDEX IF NOT EXISTS "ListingEvent_zoneKey_type_day_idx" ON "ListingEvent"("zoneKey", "type", "day");
-- Retention sweep (rows are pruned after 90 days).
CREATE INDEX IF NOT EXISTS "ListingEvent_day_idx" ON "ListingEvent"("day");

CREATE INDEX IF NOT EXISTS "ListingVisit_listingId_idx" ON "ListingVisit"("listingId");
CREATE INDEX IF NOT EXISTS "ListingVisit_listingId_outcome_idx" ON "ListingVisit"("listingId", "outcome");
CREATE INDEX IF NOT EXISTS "ListingVisit_outcome_scheduledFor_idx" ON "ListingVisit"("outcome", "scheduledFor");
CREATE INDEX IF NOT EXISTS "ListingVisit_scheduledFor_idx" ON "ListingVisit"("scheduledFor");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ListingVisit" ADD CONSTRAINT "ListingVisit_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ListingVisit" ADD CONSTRAINT "ListingVisit_guestUserId_fkey"
    FOREIGN KEY ("guestUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
