-- First-share funnel: per-post ledger, chat attribution, a sprint loop that learns.
ALTER TABLE "AgentProfile" ADD COLUMN "firstSource" TEXT, ADD COLUMN "firstRef" INTEGER;
ALTER TABLE "AgentTask" ADD COLUMN "refListingId" INTEGER, ADD COLUMN "refSource" TEXT;
CREATE INDEX "AgentTask_refSource_createdAt_idx" ON "AgentTask"("refSource", "createdAt");

ALTER TABLE "Sprint" ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "retro" TEXT;
ALTER TABLE "SprintPrompt" ADD COLUMN "metric" TEXT, ADD COLUMN "baseline" DOUBLE PRECISION,
  ADD COLUMN "unblockWhen" TEXT, ADD COLUMN "blockedAt" TIMESTAMP(3),
  ADD COLUMN "retries" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "auto" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SprintLesson" (
    "id" TEXT NOT NULL,
    "promptId" TEXT,
    "sprintId" TEXT,
    "metric" TEXT,
    "before" DOUBLE PRECISION,
    "after" DOUBLE PRECISION,
    "verdict" TEXT NOT NULL DEFAULT 'unknown',
    "text" TEXT NOT NULL,
    "measureAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SprintLesson_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SprintLesson_createdAt_idx" ON "SprintLesson"("createdAt");
CREATE INDEX "SprintLesson_verdict_measureAt_idx" ON "SprintLesson"("verdict", "measureAt");

CREATE TABLE "TikTokPost" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "ref" TEXT NOT NULL,
    "sourceVideoId" TEXT,
    "brokerHandle" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PICKED',
    "reason" TEXT,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleanAt" TIMESTAMP(3),
    "postedAt" TIMESTAMP(3),
    "tiktokUrl" TEXT,
    "tiktokId" TEXT,
    "views" INTEGER,
    "likes" INTEGER,
    "statsAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TikTokPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TikTokPost_status_pickedAt_idx" ON "TikTokPost"("status", "pickedAt");
CREATE INDEX "TikTokPost_listingId_postedAt_idx" ON "TikTokPost"("listingId", "postedAt");
