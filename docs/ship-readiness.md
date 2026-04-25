# Ship Readiness Scorecard — mkan v1.0

> Live document — updated each phase. Source of truth for "are we shippable yet?"

## Headline

| Metric | Current | Target | Status |
|---|---|---|---|
| Unit tests passing | 831 / 831 | ≥ 900 / 100% | 🟡 need +69 |
| E2E specs passing | ? / 14 | ≥ 30 / 100% | 🟡 not in CI |
| `tsc --noEmit` | ✅ exit 0 | ✅ exit 0 | 🟢 |
| `lint:strict` | ? | ✅ exit 0 | 🟡 not in CI |
| `pnpm build` | ✅ | ✅ | 🟢 |
| CI workflow | partial (no e2e, lint not strict) | full | 🟡 |
| Stripe live | ✗ | ✅ | 🔴 |
| Reference-based payments | ✗ | ✅ | 🔴 |
| Stub pages | 9 | 0 | 🔴 |
| Help content | 4 "coming soon" | 0 | 🔴 |
| Long-term rental wired | TODOs | wired | 🟡 |
| Hosting dashboard | stub card | real KPIs | 🔴 |
| Operator dashboard | missing | real | 🔴 |
| Become-operator entry | missing | header link | 🔴 |
| `as unknown as` casts | 15 | 0 | 🔴 |
| Vercel READY on prod | n/a | READY | 🔴 |
| `v1.0.0` tag | n/a | tagged | 🔴 |

## Epic status

| Epic | Title | Stories Done / Total | Status |
|---|---|---|---|
| 1 | Build & Deploy Hardening | 0 / 9 | 🔴 |
| 2 | Type Safety & DTO Layer | 0 / 6 | 🔴 |
| 3 | E2E Coverage in CI | 0 / 8 | 🔴 |
| 4 | Homes Multi-Gateway Payments | 0 / 13 | 🔴 |
| 5 | Homes Hosting Dashboard | 0 / 6 | 🔴 |
| 6 | Homes Editor Completeness | 0 / 10 | 🔴 |
| 7 | Homes Long-Term Rental | 0 / 7 | 🔴 |
| 8 | Homes Polish & Cleanup | 0 / 9 | 🔴 |
| 9 | Transport Operator Dashboard | 0 / 7 | 🔴 |
| 10 | Transport Multi-Gateway Payments | 0 / 6 | 🔴 |
| 11 | Transport Notifications & Polish | 0 / 5 | 🔴 |
| 12 | Production Ship | 0 / 8 | 🔴 |
| **TOTAL** | | **0 / 94** | 🔴 |

## Confirmed working (do not break)

- All 831 unit tests pass.
- Strict TypeScript clean.
- Webpack production build succeeds.
- 14 E2E specs exist (a11y, api, auth, dashboard, i18n, listings, navigation, performance, proxy, search, security, seo, smoke + 3 transport).
- Vercel cron jobs configured (`/api/cron/{mark-overdue,generate-monthly,release-seats}`).
- Neon `wake-db.ts` warming runs in dev and build.
- Existing actions cover homes (listing, booking, payment, review, application, search, admin) and transport (~1984 lines) thoroughly.
- i18n parity en/ar (transport block 432 lines identical).

## Non-goals during ship (explicitly NOT doing)

- Mobile app, messaging, insurance, loyalty, multi-tenant SaaS, native ticket scanner, GPS tracking — all post-v1.0.
- Sentry restoration — replaced by structured logger sink.
- Turbopack in production builds — webpack stays.

## Sign-off (filled at end)

- [ ] PRD approved (this doc + `prd.md`)
- [ ] Architecture approved (`architecture.md`)
- [ ] All 12 epics Done
- [ ] All 94 stories Done
- [ ] CI green on `main`
- [ ] Vercel READY
- [ ] Smoke prod passes
- [ ] `v1.0.0` tagged
- [ ] Release notes drafted
