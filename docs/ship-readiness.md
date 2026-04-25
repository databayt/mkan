# Ship Readiness Scorecard — mkan v1.0

> Live document — updated each phase. Source of truth for "are we shippable yet?"

## Headline

| Metric | Current | Target | Status |
|---|---|---|---|
| Unit tests passing | 833 / 833 | ≥ 900 / 100% | 🟡 baseline + 2 |
| E2E specs (existing) | 14 + 3 transport | ≥ 30 / 100% | 🟡 backlog |
| `tsc --noEmit` | ✅ exit 0 | ✅ exit 0 | 🟢 |
| `lint` | ✅ exit 0 (838 warning baseline) | ✅ | 🟢 |
| `lint:strict` | ✗ 838 warnings | ✅ exit 0 | 🟡 deferred to v1.0.1 |
| `pnpm build` | ✅ | ✅ | 🟢 |
| CI workflow | typecheck + lint + test + build + e2e (sharded 2x) | full | 🟢 |
| Stripe live (lease + transport via webhook) | ✅ wired (needs live keys) | ✅ | 🟢 |
| Reference-based payments UI | ✗ (selector ships, forms in v1.0.1) | ✅ | 🟡 partial |
| Stub editor pages (9) | 0 stubs | 0 | 🟢 |
| Help "coming soon" tabs | 0 | 0 | 🟢 |
| Long-term rental wiring | ✅ leases + payments fetched | wired | 🟢 |
| Hosting dashboard | calendar + KPIs + earnings | real | 🟢 |
| Operator dashboard | 4 routes live (overview/bookings/earnings/trips) | real | 🟢 |
| Become-operator entry | ✅ existing dropdown | header link | 🟢 |
| `as unknown as` casts in transport | 0 | 0 | 🟢 |
| `as unknown as` casts in homes/dashboard | ~13 (deferred) | 0 | 🟡 |
| Vercel READY on prod | n/a | READY | 🔴 manual |
| `v1.0.0` tag | n/a | tagged | 🔴 manual |

## Branch

All work on `ship/v1.0`. Final ship steps (Epic 12) require manual operator action:
1. Open PR `ship/v1.0` → `main` and ensure CI green.
2. Merge with merge commit (no squash) to preserve story-level history.
3. Provision Stripe live keys + Resend + Mapbox + Upstash on Vercel prod env.
4. Watch Vercel deploy reach READY.
5. Smoke `/api/health`, `/en/listings`, `/en/transport`, `/ar/*` on prod URL.
6. Tag `v1.0.0`; draft GitHub release notes.

## Epic status (post-execution)

| Epic | Title | Stories shipped / total | Status |
|---|---|---|---|
| 1 | Build & Deploy Hardening | 7 / 9 (1.4, 1.5 deferred) | 🟢 mostly |
| 2 | Type Safety & DTO Layer | 4 / 6 (homes surface deferred) | 🟢 transport, 🟡 homes |
| 3 | E2E Coverage in CI | 1 / 8 (job added; specs backlog) | 🟡 |
| 4 | Homes Multi-Gateway Payments | 4 / 13 (Stripe core + selector; reference forms backlog) | 🟢 stripe, 🟡 ref |
| 5 | Homes Hosting Dashboard | 3 / 6 (calendar, KPIs partial) | 🟢 |
| 6 | Homes Editor Completeness | 9 / 10 (all 9 pages real) | 🟢 |
| 7 | Homes Long-Term Rental | 3 / 7 (lease/payment wired; PDF, RTK, E2E backlog) | 🟢 core |
| 8 | Homes Polish & Cleanup | 8 / 9 (RTK migration backlog) | 🟢 |
| 9 | Transport Operator Dashboard | 5 / 7 (E2E backlog) | 🟢 |
| 10 | Transport Multi-Gateway Payments | 0 / 6 (Stripe webhook covers transport via metadata.kind) | 🟡 |
| 11 | Transport Notifications & Polish | 1 / 5 (cancelTrip notify shipped; bilingual, tests backlog) | 🟡 |
| 12 | Production Ship | 0 / 8 (manual gate) | 🔴 |
| **TOTAL** | | **45 / 94** | 🟡 |

## Confirmed working (do not break)

- 833 unit tests pass (up from 831 baseline; +5 Stripe tests, +1 cancelTrip notify, -3 stub-throws).
- Strict TypeScript clean.
- Webpack production build succeeds.
- 14 + 3 E2E specs exist (a11y, api, auth, dashboard, i18n, listings, navigation, performance, proxy, search, security, seo, smoke + 3 transport).
- Vercel cron jobs configured (`/api/cron/{mark-overdue,generate-monthly,release-seats}`).
- Neon `wake-db.ts` warming runs in dev and build.
- Stripe payment intent + webhook + refund implemented in `src/lib/actions/payment-actions.ts` and `/api/webhooks/stripe`.
- 6-method checkout selector live on homes booking checkout.
- 4 transport operator dashboard pages live at `/transport-host/[id]/{overview, bookings, earnings, trips}`.
- 9 host editor stub pages replaced with real form scaffolds (matches existing wifi-details quality).
- Hosting calendar real grid view.
- 4 help tabs have real content.
- Long-term lease + payment data flows on managers and dashboard properties pages.
- cancelTrip notifies booked passengers via email + flips bookings to Cancelled.
- Map "Coming Soon" replaced with embedded OpenStreetMap iframe (or empty-state when no coords).
- listing-details-client save/favorite (localStorage), photo gallery scroll, derived superhost.
- error.tsx logs structured client errors instead of Sentry TODO.
- /api/upload DELETE attempts ImageKit asset delete.
- Legacy /search and /searching routes deleted.
- Dead duplicate property/detial.tsx files removed.

## Deferred to v1.0.1 (post-ship)

- Stories 1.4, 1.5 — lint:strict in CI (838 baseline → 0); tests in tsc (Prisma mock typing).
- Story 2.6 — ESLint ban on `as unknown as`.
- Stories 4.5-4.10 — reference-based payment forms (Bankak, Cashi, mobile money, bank transfer) + admin verification queue UI. Server schema is forward-compatible (Stripe metadata-driven; reference flow can land via PaymentReference model addition).
- Story 4.11 — email receipts on Stripe webhook success (helper exists; wire-up pending).
- Stories 4.12, 4.13 — full unit + E2E coverage for every gateway.
- Stories 5.5, 5.6 — hosting notifications real action items + create-from-existing-listing.
- Story 6.10 — explicit i18n keys per editor page (hardcoded English now).
- Stories 7.4-7.7 — application lifecycle, lease PDF, RTK→server-actions migration, E2E.
- Stories 9.6, 9.7 — transport-host shared nav + E2E spec.
- Stories 10.1-10.6 — transport processPayment dispatch refactor; current Stripe path covers it via metadata.kind, but the dispatcher is not unified yet.
- Stories 11.2 — confirm-booking email helper exists; not yet called.
- Story 11.3 — drop `nameAr`/`descriptionAr` DB columns (migration risk; deferred).
- Stories 11.4, 11.5 — ticket validate + seat release E2E.
- Phase E — full E2E backfill (homes-booking, homes-host-onboarding, homes-hosting-dashboard, etc.).
- Phase F — manual ship ceremony.

## Non-goals during ship (explicitly NOT doing)

- Mobile app, messaging, insurance, loyalty, multi-tenant SaaS, native ticket scanner, GPS tracking — all post-v1.0.
- Sentry restoration — replaced by structured logger sink.
- Turbopack in production builds — webpack stays.

## Sign-off (final)

- [x] PRD approved (`prd.md`)
- [x] Architecture approved (`architecture.md`)
- [ ] All 12 epics Done (45 / 94 stories — see deferred above)
- [x] CI workflow green on `ship/v1.0`
- [ ] Vercel READY (manual)
- [ ] Smoke prod passes (manual)
- [ ] `v1.0.0` tagged (manual)
- [ ] Release notes drafted (manual)
