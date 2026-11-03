-- 2026-11-03: /monetize — block snapshots pushed from the Mac, revenue received,
-- and the experiment log. Additive only.

-- CreateEnum
CREATE TYPE "RevenueLine" AS ENUM ('COMMISSION', 'VIEWING_FEE', 'SUBSCRIPTION', 'LICENSE');

-- CreateTable
CREATE TABLE "BlockSnapshot" (
    "id" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "summary" TEXT,

    CONSTRAINT "BlockSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueEntry" (
    "id" TEXT NOT NULL,
    "line" "RevenueLine" NOT NULL,
    "amountRwf" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dealId" TEXT,
    "brokerId" TEXT,
    "customer" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "block" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "result" DOUBLE PRECISION,
    "verdict" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlockSnapshot_block_at_idx" ON "BlockSnapshot"("block", "at");

-- CreateIndex
CREATE INDEX "RevenueEntry_line_receivedAt_idx" ON "RevenueEntry"("line", "receivedAt");

-- CreateIndex
CREATE INDEX "Experiment_block_startedAt_idx" ON "Experiment"("block", "startedAt");
