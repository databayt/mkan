# Epic 8 — Homes Polish & Cleanup

> **Priority**: P2 · **Owner**: Frontend + Cleanup · **Status**: To Do · **Phase**: C

## Goal

Close every smaller TODO and remove every legacy/duplicate file in the homes surface. Improve perceived completeness.

## Background

Audit found:
- `src/components/listing-details-client.tsx`:
  - `:40` — TODO: implement save/favorite
  - `:45` — TODO: implement photo gallery modal
  - `:57` — `isSuperhost={false} // TODO: Add superhost logic`
  - `:60` — `isSaved={false} // TODO: Add saved state logic`
- `src/components/listings/property/detial.tsx:277` and `src/components/site/property/detial.tsx:277` — both show `"Map Coming Soon"` (also a duplicate file).
- `src/app/[lang]/help/content.tsx` — 4 `*ComingSoon` keys for home host, experience host, service host, travel admin.
- `src/app/api/upload/route.ts:143` — TODO: Call ImageKit API to delete the actual file.
- `src/app/error.tsx:20` — TODO: Send to Sentry or similar service (Sentry was removed; route to logger).
- Legacy redirected pages still on disk: `src/app/[lang]/search/page.tsx`, `src/app/[lang]/(nondashboard)/searching/page.tsx`, `src/app/[lang]/(nondashboard)/searching/[id]/page.tsx`.
- Duplicate component file: `src/components/{listings/property,site/property}/detial.tsx`.

## Stories

| ID | Title | Files |
|---|---|---|
| 8.1 | Implement save/favorite | `src/components/listing-details-client.tsx`, action |
| 8.2 | Implement photo gallery modal | new modal component |
| 8.3 | Wire `isSuperhost`/`isSaved` real state | `src/components/listing-details-client.tsx` |
| 8.4 | Real listing-detail map (Mapbox) — dedup the two copies | both `detial.tsx` files |
| 8.5 | Build real help content for 4 tabs | `src/app/[lang]/help/content.tsx` |
| 8.6 | ImageKit delete on upload route | `src/app/api/upload/route.ts:143` |
| 8.7 | `error.tsx` — replace Sentry TODO with structured logger sink | that file |
| 8.8 | Delete legacy redirected pages (search, searching) | delete files |
| 8.9 | Dedup `detial.tsx` (rename, keep one canonical) | both files |

## Epic Acceptance Criteria

- [ ] Zero TODOs in `listing-details-client.tsx`.
- [ ] Listing detail page shows a real map.
- [ ] Help center has real content in all 4 tabs (no "coming soon").
- [ ] DELETE on `/api/upload` actually removes the asset from ImageKit.
- [ ] `error.tsx` calls `logger.error(...)` instead of TODO.
- [ ] Legacy pages deleted; redirects in `next.config.ts` point to canonical routes.
- [ ] Single canonical `property-detail.tsx`; misspelled duplicates removed.

## Dependencies

- Epic 1, 2, 3 in place.
- Existing `listing-actions.ts` for favorite logic; extend.
- Mapbox token in env (already in `.env.example`).

## Out of scope

- Performance optimization beyond what's already in place.
- Help content beyond the 4 missing tabs.

## Technical notes

- Save/favorite: extend `User.savedListings` (or `Tenant.favorites` if model already has it) — a relation between users and listings. `toggleFavorite(listingId)` action.
- Photo gallery: portal-rendered modal with arrow keys + swipe; use existing `Dialog` primitive.
- Superhost: derive from `User.isSuperhost` flag (extend if missing) computed nightly via cron based on rating + booking count + cancellation rate.
- Map: Mapbox GL JS already a dep; render at the listing's lat/lng.
- ImageKit delete: use `imagekit.deleteFile(fileId)` from existing wrapper.
- Logger: replace TODO with `logger.error('client_error', { error, ... })`.
- File deletion: `git rm`, ensure no imports break.
- Filename: rename `detial.tsx` → `detail.tsx` (the typo is permanent if not fixed now).
