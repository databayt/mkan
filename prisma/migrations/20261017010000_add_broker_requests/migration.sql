-- Rental agent phase 2/3: who can speak for a home (many brokers per home) and
-- the agent's availability/viewing requests to them. Additive only.
DO $$ BEGIN
  CREATE TYPE "BrokerRole" AS ENUM ('BROKER', 'OWNER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BrokerRequestStatus" AS ENUM ('PENDING', 'AVAILABLE', 'RENTED', 'NO_REPLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ListingBroker" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BrokerRole" NOT NULL DEFAULT 'BROKER',
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ListingBroker_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ListingBroker_listingId_userId_key" ON "ListingBroker"("listingId", "userId");
CREATE INDEX IF NOT EXISTS "ListingBroker_userId_idx" ON "ListingBroker"("userId");

CREATE TABLE IF NOT EXISTS "BrokerRequest" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "brokerUserId" TEXT NOT NULL,
    "taskId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "need" JSONB NOT NULL DEFAULT '{}',
    "status" "BrokerRequestStatus" NOT NULL DEFAULT 'PENDING',
    "channel" TEXT NOT NULL DEFAULT 'manual',
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewingSlots" JSONB,
    "chosenSlot" TIMESTAMP(3),
    "tenantName" TEXT,
    "tenantPhone" TEXT,
    "visitId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrokerRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BrokerRequest_tokenHash_key" ON "BrokerRequest"("tokenHash");
CREATE INDEX IF NOT EXISTS "BrokerRequest_listingId_brokerUserId_createdAt_idx" ON "BrokerRequest"("listingId", "brokerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "BrokerRequest_status_expiresAt_idx" ON "BrokerRequest"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "BrokerRequest_taskId_idx" ON "BrokerRequest"("taskId");

DO $$ BEGIN
  ALTER TABLE "ListingBroker" ADD CONSTRAINT "ListingBroker_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ListingBroker" ADD CONSTRAINT "ListingBroker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BrokerRequest" ADD CONSTRAINT "BrokerRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BrokerRequest" ADD CONSTRAINT "BrokerRequest_brokerUserId_fkey" FOREIGN KEY ("brokerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "BrokerRequest" ADD CONSTRAINT "BrokerRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
