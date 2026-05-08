-- Search-path indexes for Listing.
--
-- Each one targets a specific query the audit identified:
--
-- 1) (locationId, isPublished, draft) — every search joins through
--    location and filters published+non-draft. Without this, the planner
--    can hash-join through Listing's primary key index but has to evaluate
--    the (isPublished, draft) predicate row-by-row. With it, the planner
--    can short-circuit to "give me the published non-draft listings for
--    THIS locationId" in one index lookup.
--
-- 2) (isPublished, draft, createdAt) — getListings() in listing-actions.ts
--    orders by createdAt DESC. The existing (isPublished, draft, postedDate)
--    index covers searchListings (which orders by postedDate) but leaves
--    getListings doing a filesort on result sets that include drafts-converted-
--    to-published rows where postedDate may be null.
--
-- 3) GIN(amenities) — the search where-clause uses
--    `amenities = { hasEvery: [...] }`, which lowers to `amenities @> '{...}'`
--    in SQL. Without a GIN on the array column, every query with an amenity
--    filter is a sequential scan. With GIN, it's an index lookup that
--    intersects posting lists per requested amenity.
--
-- All three indexes are concurrent-safe to add (small Listing table) but
-- we use plain CREATE INDEX without CONCURRENTLY because Prisma migrations
-- run inside a transaction and CONCURRENTLY isn't allowed there. With
-- ~100 rows in production today this completes in milliseconds.
--
-- IF NOT EXISTS so re-running is a no-op.

CREATE INDEX IF NOT EXISTS "Listing_locationId_isPublished_draft_idx"
  ON "Listing"("locationId", "isPublished", draft);

CREATE INDEX IF NOT EXISTS "Listing_isPublished_draft_createdAt_idx"
  ON "Listing"("isPublished", draft, "createdAt");

CREATE INDEX IF NOT EXISTS "Listing_amenities_gin_idx"
  ON "Listing" USING GIN (amenities);
