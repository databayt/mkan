# Epic 9 — Transport Operator Dashboard

> **Priority**: P0 · **Owner**: Frontend · **Status**: To Do · **Phase**: D

## Goal

After publishing their office, an operator should land in a real dashboard inside `/transport-host/[id]` with: overview KPIs, bookings inbox, earnings, trips list, navigation between sections. Add a clear "Become an operator" entry from the site header.

## Background

Current state:
- `/transport-host` lists offices owned by current user. Real.
- `/transport-host/[id]/{office-info,assembly-point,buses,photos,routes,schedule,finish}` — onboarding steps. Real.
- After publish, operator returns to `/transport-host` (list) with no "next" surface.
- `getOfficeBookings`, `getOfficeDashboardStats`, `getTripsByOffice` actions exist but are consumed only by the parallel `(dashboard)/offices/*` group, which is not linked from `/transport-host`.
- Header has a "Become a host" link to `/host` (homes); no transport operator entry.

The gap is operational — operators can publish but can't run their business inside `/transport-host/[id]`.

## Stories

| ID | Title | Files |
|---|---|---|
| 9.1 | `/transport-host/[id]` overview page (KPIs + quick actions) | new route + content component |
| 9.2 | `/transport-host/[id]/bookings` paginated, filterable, status update | new route, uses `getOfficeBookings` |
| 9.3 | `/transport-host/[id]/earnings` revenue per route/month + CSV | new route, uses `getOfficeDashboardStats` |
| 9.4 | `/transport-host/[id]/trips` flat trip list w/ status | new route, uses `getTripsByOffice` |
| 9.5 | Header "Become an operator" entry → `/transport-host/overview` | `src/components/site/header.tsx` |
| 9.6 | Operator side nav across `/transport-host/[id]/*` | shared `transport-host-nav.tsx` |
| 9.7 | E2E: operator post-publish full loop | `tests/transport/operator-dashboard.spec.ts` |

## Epic Acceptance Criteria

- [ ] After publish, operator lands at `/transport-host/[id]` and sees KPIs.
- [ ] Operator can view all bookings for their office, filter by status, mark a booking confirmed (cash on arrival).
- [ ] Operator can see earnings totals per route + per month, export CSV.
- [ ] Operator can see all trips at a glance (today / this week / past).
- [ ] Header has a clear "Become an operator" link distinct from "Become a host".
- [ ] Side nav consistent across all `/transport-host/[id]/*` pages.
- [ ] E2E covers onboarding → publish → bookings inbox → confirm one booking.

## Dependencies

- Epic 2 (DTO clean for transport host pages).
- Existing actions: `getOfficeBookings`, `getOfficeDashboardStats`, `getTripsByOffice`, `updateBookingStatus`.

## Out of scope

- Driver-facing app (post-v1.0).
- Real-time trip GPS tracking (post-v1.0).
- Office/agent role for in-person counter sales (post-v1.0).

## Technical notes

- Use existing `OnboardingStepsOverview` UI primitive for the post-publish overview header.
- Reuse `useTransportHostNavigation()` for breadcrumbs/active-tab logic.
- Operator nav: tabs (Overview / Bookings / Trips / Earnings / Routes / Buses / Settings).
- Booking status update is inline — `updateBookingStatus` action already exists; just expose in UI.
- CSV: server action returns string; client triggers download via Blob.
