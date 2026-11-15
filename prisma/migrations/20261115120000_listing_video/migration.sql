-- A broker home's cleaned video for the web and its poster (nullable, additive).
ALTER TABLE "Listing" ADD COLUMN "videoUrl" TEXT,
ADD COLUMN "videoPosterUrl" TEXT;
