-- A broker's contact person and the languages their ads use (TikTok lane, 2026-10-25).
ALTER TABLE "Broker" ADD COLUMN "contactName" TEXT;
ALTER TABLE "Broker" ADD COLUMN "preferredLanguage" TEXT;
ALTER TABLE "Broker" ADD COLUMN "languages" TEXT[] DEFAULT ARRAY[]::TEXT[];
