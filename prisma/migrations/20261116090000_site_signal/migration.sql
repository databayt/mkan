-- CreateTable
CREATE TABLE "SiteSignal" (
    "id" SERIAL NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'direct',
    "visitorHash" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteSignal_day_kind_idx" ON "SiteSignal"("day", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSignal_day_kind_place_visitorHash_key" ON "SiteSignal"("day", "kind", "place", "visitorHash");

