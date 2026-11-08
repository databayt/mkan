-- Per-post interaction numbers and experiment tags on TikTokPost (all nullable, additive).
ALTER TABLE "TikTokPost" ADD COLUMN "comments" INTEGER,
ADD COLUMN "shares" INTEGER,
ADD COLUMN "saves" INTEGER,
ADD COLUMN "avgWatchSec" DOUBLE PRECISION,
ADD COLUMN "completion" DOUBLE PRECISION,
ADD COLUMN "askFollow" BOOLEAN,
ADD COLUMN "waLine" INTEGER;
