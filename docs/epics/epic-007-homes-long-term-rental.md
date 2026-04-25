# Epic 7 — Homes Long-Term Rental Flow

> **Priority**: P1 · **Owner**: Backend · **Status**: To Do · **Phase**: C

## Goal

Wire the long-term rental TODOs (lease and payment fetching in property pages) so the Tenant→Application→Lease→monthly Payment flow works end-to-end. Migrate `tenants/applications` from RTK Query to server actions for consistency.

## Background

Current state:
- `Application`, `Lease`, `Payment`, `Tenant` Prisma models exist alongside the short-term `Booking` model.
- `src/app/[lang]/(dashboard)/managers/properties/[id]/page.tsx:44` — `// TODO: Implement lease and payment fetching for listings`
- `src/app/[lang]/(dashboard)/dashboard/properties/[id]/page.tsx:62` — `// TODO: Implement lease fetching for listings`
- `src/app/[lang]/(dashboard)/dashboard/properties/[id]/page.tsx:72` — `// TODO: Implement payment fetching when lease system is ready`
- `src/app/[lang]/(dashboard)/tenants/applications/page.tsx` uses RTK Query (`useGetApplicationsQuery` from `state/api`) while every other dashboard page uses server actions.

The data model is in place. The pages just need their data wired and the application→lease lifecycle implemented.

## Stories

| ID | Title | Files |
|---|---|---|
| 7.1 | Implement lease+payment fetching at `managers/properties/[id]` | that page + action |
| 7.2 | Implement lease fetching at `dashboard/properties/[id]` | that page + action |
| 7.3 | Implement payment fetching for lease system | same page + action |
| 7.4 | Application lifecycle (submit → review → approve/deny → lease creation) | actions + UI |
| 7.5 | Lease document PDF generation (react-pdf) | `src/lib/lease-pdf.tsx`, action |
| 7.6 | Migrate `tenants/applications` from RTK to server actions | that page |
| 7.7 | E2E: application → lease → first rent payment | `tests/e2e/long-term-rental.spec.ts` |

## Epic Acceptance Criteria

- [ ] Manager can review pending applications, approve/deny.
- [ ] Approving an application creates a `Lease` record + sends notification email.
- [ ] Lease has a downloadable PDF (react-pdf).
- [ ] Tenant can see their lease + payment schedule.
- [ ] Tenant can pay monthly rent via the same multi-gateway flow as short-term bookings.
- [ ] Manager dashboard shows lease status + payment status per property.
- [ ] No RTK Query left in `(dashboard)/tenants/applications/`.
- [ ] E2E covers full happy path.

## Dependencies

- Epic 4 (multi-gateway payments — long-term rent uses the same payment surface).
- Existing `application-actions.ts` (426 lines) — extend, don't replace.
- Existing models: `Application`, `Lease`, `Payment`, `Tenant`.

## Out of scope

- Maintenance request flow (post-v1.0).
- Lease renewal automation (manual for v1.0).
- Multi-tenant per property (one lease per property at a time).

## Technical notes

- `Lease` has `monthlyRent`, `startDate`, `endDate`, `status` (assumed); verify schema and extend if missing.
- Payment scheduler: a daily cron (already exists at `/api/cron/generate-monthly`) creates the next month's `Payment` rows for active leases. Verify it runs and adjust if needed.
- PDF: use `@react-pdf/renderer` server-side; serve as `application/pdf` from a route handler.
- RTK Query removal: the `state/api` slice can be deleted after this story if no other consumer remains.
- Authorization: only the assigned `Manager` can act on a `Listing`'s applications/leases.
