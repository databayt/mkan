-- Phase C2: payments completeness.
-- Per-office Sudan payment instructions on TransportOffice + Stripe webhook
-- idempotency log. Defaults are empty strings so existing rows continue to
-- pass `pnpm prisma migrate deploy` without explicit backfill.

ALTER TABLE "TransportOffice"
  ADD COLUMN "bankName"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN "bankAccount"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN "bankHolder"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN "momoNumber"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN "momoProvider" TEXT NOT NULL DEFAULT '';

CREATE TABLE "WebhookEvent" (
  "id"          SERIAL PRIMARY KEY,
  "provider"    TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookEvent_eventId_key" UNIQUE ("eventId")
);

CREATE INDEX "WebhookEvent_provider_eventType_idx" ON "WebhookEvent" ("provider", "eventType");
