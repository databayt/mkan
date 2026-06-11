-- Ports the April Stack-A schema (per-office payment fields, WebhookEvent
-- idempotency log, singleton PlatformSetting) into the migration history.
-- Prod already has all of these — they were applied as raw SQL via Neon MCP
-- on 2026-04-28 without a migration record — so every statement is guarded
-- with IF NOT EXISTS to no-op there while still creating everything on a
-- fresh database.

ALTER TABLE "TransportOffice"
  ADD COLUMN IF NOT EXISTS "bankName"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "bankAccount"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "bankHolder"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "momoNumber"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "momoProvider" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "WebhookEvent" (
  "id"          SERIAL PRIMARY KEY,
  "provider"    TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "payload"     JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WebhookEvent_eventId_key" UNIQUE ("eventId")
);

CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_eventType_idx" ON "WebhookEvent" ("provider", "eventType");

CREATE TABLE IF NOT EXISTS "PlatformSetting" (
  "id"                        INTEGER PRIMARY KEY DEFAULT 1,
  "platformFeePct"            DOUBLE PRECISION   NOT NULL DEFAULT 0.10,
  "defaultCancellationPolicy" "CancellationPolicy" NOT NULL DEFAULT 'Flexible',
  "supportedCurrencies"       TEXT               NOT NULL DEFAULT 'SDG,USD,SAR',
  "payoutScheduleDays"        INTEGER            NOT NULL DEFAULT 30,
  "emailFrom"                 TEXT               NOT NULL DEFAULT '',
  "supportEmail"              TEXT               NOT NULL DEFAULT '',
  "updatedAt"                 TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP
);
