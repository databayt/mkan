-- 2026-11-01: lost homes (a broker said taken), the broker partnership (relationship, share),
-- three-party viewings (attendees, reminders) and the Deal a viewing becomes. Additive only.

-- CreateEnum
CREATE TYPE "BrokerRelationship" AS ENUM ('NEW', 'INTRODUCED', 'ACTIVE', 'PARTNER', 'PAUSED', 'DO_NOT_CONTACT');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('VIEWING_BOOKED', 'VIEWED', 'SIGNED', 'PAID', 'LOST');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "lostAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT;

-- AlterTable
ALTER TABLE "ListingVisit" ADD COLUMN     "brokerId" TEXT,
ADD COLUMN     "meetingPoint" TEXT,
ADD COLUMN     "reminders" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "repName" TEXT,
ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "BrokerRequest" ADD COLUMN     "consentAt" TIMESTAMP(3),
ADD COLUMN     "terms" JSONB;

-- AlterTable
ALTER TABLE "Broker" ADD COLUMN     "agreedAt" TIMESTAMP(3),
ADD COLUMN     "agreementNote" TEXT,
ADD COLUMN     "introducedAt" TIMESTAMP(3),
ADD COLUMN     "lastMessagedAt" TIMESTAMP(3),
ADD COLUMN     "relationship" "BrokerRelationship" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "shareFlatRwf" INTEGER,
ADD COLUMN     "sharePct" DECIMAL(5,4);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "listingId" INTEGER NOT NULL,
    "brokerId" TEXT,
    "visitId" INTEGER,
    "taskId" TEXT,
    "tenantName" TEXT,
    "tenantPhone" TEXT,
    "rentMonthly" INTEGER,
    "upfront" INTEGER,
    "brokerCommission" INTEGER,
    "mkanShare" INTEGER,
    "viewingFeePaid" INTEGER,
    "status" "DealStatus" NOT NULL DEFAULT 'VIEWING_BOOKED',
    "notes" TEXT,
    "signedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Deal_visitId_key" ON "Deal"("visitId");

-- CreateIndex
CREATE INDEX "Deal_status_createdAt_idx" ON "Deal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_brokerId_idx" ON "Deal"("brokerId");

-- CreateIndex
CREATE INDEX "Listing_lostAt_idx" ON "Listing"("lostAt");

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "ListingVisit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

