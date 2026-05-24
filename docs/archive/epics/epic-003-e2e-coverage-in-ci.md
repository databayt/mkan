# Epic 3 — E2E Coverage in CI

> **Priority**: P0 · **Owner**: QA · **Status**: In Progress · **Phase**: B (3.1, 3.8) + E (3.2-3.7)

## Goal

E2E suite runs on every PR and blocks regressions on user-critical journeys. Fill coverage gaps for booking, host onboarding, hosting dashboard, ticket validate, payment verify, seat-release sweeper.

## Background

Existing 14 E2E specs cover: a11y, api, auth, dashboard-access, i18n, listings, navigation, performance, proxy-sanity, search-consolidation, security, seo, smoke + 3 transport (booking, host-onboarding, search). Solid foundation.

**But**: `pnpm test:e2e` is not wired into CI. Specs can rot. And key flows lack coverage:
- Homes booking end-to-end (cash path) — exists at unit level only.
- Homes host onboarding 17-step navigation.
- Homes hosting dashboard reachable post-publish.
- Transport ticket QR validation.
- Transport payment verify (Stripe sandbox).
- Seat-release sweeper TTL behavior.

No shared test factories. Each spec rolls its own user/listing/office.

## Stories

| ID | Title | Files | Phase |
|---|---|---|---|
| 3.1 | Add `e2e` job to `ci.yml` (Playwright headless, 2-shard) | `.github/workflows/ci.yml` | B |
| 3.2 | E2E homes booking flow (guest → cash → confirmation) | `tests/e2e/homes-booking.spec.ts` | E |
| 3.3 | E2E homes host onboarding 17-step navigation | `tests/e2e/homes-host-onboarding.spec.ts` | E |
| 3.4 | E2E homes hosting dashboard reachable post-publish | `tests/e2e/homes-hosting-dashboard.spec.ts` | E |
| 3.5 | E2E transport ticket QR validate (admin scans) | `tests/transport/ticket-validate.spec.ts` | E |
| 3.6 | E2E transport payment verify (Stripe sandbox) | `tests/transport/payment-verify.spec.ts` | E |
| 3.7 | E2E seat-release sweeper TTL test | `tests/transport/seat-release.spec.ts` | E |
| 3.8 | Test factory helpers (User, Listing, TransportOffice, Trip) | `tests/helpers/factories.ts` | B |

## Epic Acceptance Criteria

- [ ] CI runs Playwright on every PR.
- [ ] All 14 existing + 6 new E2E specs pass in CI.
- [ ] Test factories used by ≥3 specs (DRY).
- [ ] CI runtime < 12 min total (sharded if needed).
- [ ] One specific tagged subset (`@smoke`) runs against prod URL in Phase F.

## Dependencies

- Epic 1 (Node 22) — baseline.
- Stories 4.x, 5.x, 6.x land before 3.2-3.4 (they exercise that UI).
- Stories 9.x, 10.x land before 3.5-3.6.

## Out of scope

- Visual regression tests (post-v1.0).
- Cross-browser matrix (chromium only for v1.0).

## Technical notes

- Use Playwright's `webServer` config to start `next dev` on port 3000 if `BASE_URL` is unset.
- For seeded data, run `pnpm seed` against a dedicated test DB before E2E job.
- For Stripe sandbox, use Playwright's network mocking on `api.stripe.com` to avoid real network calls in CI; full sandbox runs only in nightly.
- Tag smoke-only specs with `@smoke`; Phase F runs `pnpm test:e2e --grep "@smoke"` against prod.
