-- CreateEnum
CREATE TYPE "MasteringStatus" AS ENUM ('QUEUED', 'ASSIGNED', 'MASTERED', 'UPDATED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "MasteringRun" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "photoIndex" INTEGER NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "status" "MasteringStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "promptVersion" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "masteredUrl" TEXT,
    "slackTs" TEXT,
    "slackUrl" TEXT,
    "failureReason" TEXT,
    "humanNote" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "masteredAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "MasteringRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasteringRun_status_queuedAt_idx" ON "MasteringRun"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "MasteringRun_listingId_status_idx" ON "MasteringRun"("listingId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MasteringRun_listingId_originalUrl_attempt_key" ON "MasteringRun"("listingId", "originalUrl", "attempt");

-- AddForeignKey
ALTER TABLE "MasteringRun" ADD CONSTRAINT "MasteringRun_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

