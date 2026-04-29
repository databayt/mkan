-- Phase C3: singleton PlatformSetting row. id is always 1 and the row is
-- created lazily by `getPlatformSettings` on first read so we don't need
-- to seed it explicitly here.

CREATE TABLE "PlatformSetting" (
  "id"                        INTEGER PRIMARY KEY DEFAULT 1,
  "platformFeePct"            DOUBLE PRECISION   NOT NULL DEFAULT 0.10,
  "defaultCancellationPolicy" "CancellationPolicy" NOT NULL DEFAULT 'Flexible',
  "supportedCurrencies"       TEXT               NOT NULL DEFAULT 'SDG,USD,SAR',
  "payoutScheduleDays"        INTEGER            NOT NULL DEFAULT 30,
  "emailFrom"                 TEXT               NOT NULL DEFAULT '',
  "supportEmail"              TEXT               NOT NULL DEFAULT '',
  "updatedAt"                 TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP
);
