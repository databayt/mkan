-- CreateEnum
CREATE TYPE "BrokerKind" AS ENUM ('BROKER', 'AGENCY', 'LANDLORD');

-- CreateEnum
CREATE TYPE "TenantRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OutboundKind" AS ENUM ('BROKER_ASK', 'BROKER_REQUEST', 'TENANT_ALERT');

-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "ListingSource" ADD VALUE 'WEB';

-- AlterTable
ALTER TABLE "ListingBroker" ADD COLUMN     "brokerId" TEXT;

-- CreateTable
CREATE TABLE "Broker" (
    "id" TEXT NOT NULL,
    "kind" "BrokerKind" NOT NULL DEFAULT 'BROKER',
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "phones" TEXT[],
    "whatsapp" TEXT,
    "tiktokHandle" TEXT,
    "facebookUrl" TEXT,
    "website" TEXT,
    "email" TEXT,
    "districts" TEXT[],
    "neighbourhoods" TEXT[],
    "stays" TEXT[],
    "priceMin" INTEGER,
    "priceMax" INTEGER,
    "listingsCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3),
    "lastAskedAt" TIMESTAMP(3),
    "asks" INTEGER NOT NULL DEFAULT 0,
    "answers" INTEGER NOT NULL DEFAULT 0,
    "availableAnswers" INTEGER NOT NULL DEFAULT 0,
    "optOut" BOOLEAN NOT NULL DEFAULT false,
    "optOutAt" TIMESTAMP(3),
    "twentyId" TEXT,
    "sources" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Broker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRequest" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "profileId" TEXT,
    "requirements" JSONB NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "phone" TEXT,
    "optInAt" TIMESTAMP(3),
    "status" "TenantRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "matchedListingIds" INTEGER[],
    "lastMatchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "kind" "OutboundKind" NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "label" TEXT,
    "status" "OutboundStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "tokenHash" TEXT,
    "brokerId" TEXT,
    "tenantRequestId" TEXT,
    "brokerRequestIds" TEXT[],
    "listingId" INTEGER,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Broker_userId_key" ON "Broker"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_tiktokHandle_key" ON "Broker"("tiktokHandle");

-- CreateIndex
CREATE UNIQUE INDEX "Broker_twentyId_key" ON "Broker"("twentyId");

-- CreateIndex
CREATE INDEX "Broker_optOut_lastSeenAt_idx" ON "Broker"("optOut", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRequest_taskId_key" ON "TenantRequest"("taskId");

-- CreateIndex
CREATE INDEX "TenantRequest_status_expiresAt_idx" ON "TenantRequest"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_tokenHash_key" ON "OutboundMessage"("tokenHash");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_createdAt_idx" ON "OutboundMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_brokerId_createdAt_idx" ON "OutboundMessage"("brokerId", "createdAt");

-- CreateIndex
CREATE INDEX "ListingBroker_brokerId_idx" ON "ListingBroker"("brokerId");

-- AddForeignKey
ALTER TABLE "ListingBroker" ADD CONSTRAINT "ListingBroker_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broker" ADD CONSTRAINT "Broker_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRequest" ADD CONSTRAINT "TenantRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_brokerId_fkey" FOREIGN KEY ("brokerId") REFERENCES "Broker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_tenantRequestId_fkey" FOREIGN KEY ("tenantRequestId") REFERENCES "TenantRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

