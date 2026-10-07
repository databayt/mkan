-- Per-listing currency. Until now every price was implicitly SDG (the locale
-- config carried the currency, not the listing), which cannot express a Kigali
-- home priced in Rwandan francs. ISO 4217 code; every existing row is Sudanese
-- and keeps SDG through the default, so this is instant and cannot fail.
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'SDG';
