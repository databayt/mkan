-- Rental agent (/find): monthly pricing for Kigali's long-term market, the
-- TikTok source, and the agent's task + execution-trace tables. Additive only.
ALTER TYPE "ListingSource" ADD VALUE IF NOT EXISTS 'TIKTOK';

DO $$ BEGIN
  CREATE TYPE "RentPeriod" AS ENUM ('NIGHTLY', 'MONTHLY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AgentTaskStatus" AS ENUM ('RUNNING', 'WAITING', 'DONE', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "rentPeriod" "RentPeriod" NOT NULL DEFAULT 'NIGHTLY';
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "priceMonth" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "Listing_rentPeriod_isPublished_idx" ON "Listing"("rentPeriod", "isPublished");

CREATE TABLE IF NOT EXISTS "AgentTask" (
    "id" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "userId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "messages" JSONB NOT NULL DEFAULT '[]',
    "requirements" JSONB,
    "shortlist" JSONB,
    "status" "AgentTaskStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentTask_sessionKey_createdAt_idx" ON "AgentTask"("sessionKey", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentTask_status_updatedAt_idx" ON "AgentTask"("status", "updatedAt");

CREATE TABLE IF NOT EXISTS "AgentEvent" (
    "id" SERIAL NOT NULL,
    "taskId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgentEvent_taskId_seq_key" ON "AgentEvent"("taskId", "seq");
DO $$ BEGIN
  ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
