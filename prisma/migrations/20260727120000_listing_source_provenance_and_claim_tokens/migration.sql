-- CreateEnum
CREATE TYPE "ListingSource" AS ENUM ('AIRBNB', 'FACEBOOK', 'MANUAL');

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "canonicalLocale" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "source" "ListingSource",
ADD COLUMN     "sourceCapturedAt" TIMESTAMP(3),
ADD COLUMN     "sourceHostId" TEXT,
ADD COLUMN     "sourceListingId" TEXT,
ADD COLUMN     "sourceUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sourceHostId" TEXT;

-- CreateTable
CREATE TABLE "HostClaimToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HostClaimToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HostClaimToken_token_key" ON "HostClaimToken"("token");

-- CreateIndex
CREATE INDEX "HostClaimToken_userId_idx" ON "HostClaimToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_sourceListingId_key" ON "Listing"("sourceListingId");

-- CreateIndex
CREATE INDEX "Listing_source_claimedAt_idx" ON "Listing"("source", "claimedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_sourceHostId_key" ON "User"("sourceHostId");

-- AddForeignKey
ALTER TABLE "HostClaimToken" ADD CONSTRAINT "HostClaimToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

