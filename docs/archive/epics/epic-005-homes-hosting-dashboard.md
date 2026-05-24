# Epic 5 — Homes Hosting Dashboard

> **Priority**: P1 · **Owner**: Frontend · **Status**: To Do · **Phase**: C

## Goal

Replace the single-card stub at `/[lang]/hosting` with a real post-publish host dashboard: KPIs, calendar, listings overview, earnings, real notifications, navigation tabs.

## Background

Current state:
- `src/app/[lang]/hosting/page.tsx` renders one `NotificationCard` with `"hello mkan"`. Not a real dashboard.
- `src/app/[lang]/hosting/calendar/page.tsx` is a stub with hard-coded text.
- No `/hosting/earnings` route.
- `hosting-header.tsx` exists but has no tabs.
- `notification-card.tsx` shows static content instead of real action items.
- `host/content.tsx:49` has TODO for "create from existing listing".

`/hosting/listings` is real and works (shows listings table). Tenant dashboard is functional. The gap is the post-publish landing experience.

## Stories

| ID | Title | Files |
|---|---|---|
| 5.1 | KPI overview at `/hosting` (active listings, upcoming bookings, MTD revenue) | `src/app/[lang]/hosting/page.tsx`, components |
| 5.2 | `/hosting/calendar` — month grid (bookings + blocked dates per listing) | new components |
| 5.3 | `/hosting/earnings` — revenue table + CSV export | new route |
| 5.4 | Hosting nav tabs (Today / Calendar / Listings / Earnings / Inbox) | `src/components/hosting/hosting-header.tsx` |
| 5.5 | Real notifications card (pending bookings, expiring listings, low ratings) | `src/components/hosting/notification-card.tsx` |
| 5.6 | "Create from existing listing" implementation | `src/app/[lang]/host/content.tsx:49` |

## Epic Acceptance Criteria

- [ ] `/hosting` shows live KPIs from real data (3 cards: active listings, upcoming, MTD revenue).
- [ ] `/hosting/calendar` shows a month grid with bookings color-coded per listing.
- [ ] `/hosting/earnings` shows last-12-months revenue and an Export CSV button.
- [ ] All hosting pages share a tabbed header.
- [ ] Notifications show real action items (pending booking, calendar conflict, low rating) with clickthrough.
- [ ] "Create from existing listing" duplicates a listing (without bookings/reviews) and opens the editor.

## Dependencies

- Epic 4 (booking + payment data drives revenue KPI).
- Epic 1 (env validation).
- Existing actions: `getListingsByHost`, `getBookingsByHost`, `getRevenueByHost` — extend if needed.

## Out of scope

- Inbox / messaging UI (post-v1.0).
- Performance analytics chart with line graphs (use simple table for v1.0).

## Technical notes

- Server Components render KPIs; client components only for the calendar grid (stateful).
- Calendar grid: use existing `date-fns` + simple grid; no new heavy dep.
- CSV export: server action returns string; client triggers download via Blob.
- "Create from existing": duplicate `Listing` row, null out `id`/`bookings`/`reviews`/`publishedAt`, set `status = DRAFT`, redirect to editor.
