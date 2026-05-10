-- Trigram-based fuzzy search for the location autocomplete.
--
-- The location-suggestions and popular-locations server actions hit
-- "Location"."city"/"state"/"country" with ILIKE '%query%'. Without a
-- trigram index, every autocomplete request is a sequential scan; and
-- with the default `text_pattern_ops` B-tree, ILIKE with leading
-- wildcards isn't sargable at all.
--
-- pg_trgm gives us:
--   1. Sargable ILIKE '%foo%' substring search via the GIN index.
--   2. The `%` similarity operator and the `similarity()` function for
--      typo tolerance — e.g. 'khartom' % 'Khartoum' returns true under
--      the default 0.3 similarity threshold.
--
-- One GIN index per searchable column. They're not free (each insert
-- touches the index), but Location is a low-write table and the
-- autocomplete is hot, so the trade-off is firmly in favour.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Location_city_trgm_idx"
  ON "Location" USING GIN (city gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Location_state_trgm_idx"
  ON "Location" USING GIN (state gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Location_country_trgm_idx"
  ON "Location" USING GIN (country gin_trgm_ops);
