-- Direct intros until 10 deals are paid (Abdout, 2026-11-07): which deals were intros, and their follow-ups.
ALTER TABLE "Deal" ADD COLUMN "introducedAt" TIMESTAMP(3), ADD COLUMN "introFollowUps" TEXT[] DEFAULT ARRAY[]::TEXT[];
