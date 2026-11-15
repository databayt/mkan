-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "tripCost" INTEGER;

-- CreateTable
CREATE TABLE "DailyNote" (
    "day" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "ar" TEXT,
    "rw" TEXT,
    "stats" JSONB,
    "writtenBy" TEXT NOT NULL DEFAULT 'template',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyNote_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "CrmOp" (
    "id" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "tries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "CrmOp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLink" (
    "key" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "twentyId" TEXT NOT NULL,
    "pushedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLink_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CrmOp_status_createdAt_idx" ON "CrmOp"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CrmOp_object_key_idx" ON "CrmOp"("object", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLink_object_twentyId_key" ON "CrmLink"("object", "twentyId");

