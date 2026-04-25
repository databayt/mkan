-- Seat hold TTL: add reservedUntil so /api/cron/release-seats can release
-- stale Reserved seats after 30 minutes of checkout inactivity.

ALTER TABLE "Seat" ADD COLUMN "reservedUntil" TIMESTAMP(3);
CREATE INDEX "Seat_reservedUntil_idx" ON "Seat"("reservedUntil");
