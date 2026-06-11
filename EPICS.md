# Mkan — Canonical Production-Readiness Backlog

> **Single source of truth.** This file consolidates the former `EPICS.md`
> strategic roadmap, the `docs/epics/001–012` BMAD tickets, the
> `docs/ship-readiness.md` tracker, and a fresh full-codebase audit into one
> backlog. It supersedes `MVP.md`, `OPTIMIZATION_PLAN.md`, `ARCHITECTURE_AUDIT.md`,
> `IMPLEMENTATION_SUMMARY.md`, `plan.md`, `SEARCH_IMPLEMENTATIONS.md`,
> `BOOKING_FORM_DOCUMENTATION.md`, and `docs/epics/*` (all moved to `docs/archive/`).
> Keep `docs/prd.md` (product), `docs/architecture.md` (architecture), and
> `docs/ship-readiness.md` (the v1.0 ship record) as supporting references.
>
> **Stack:** Next.js 16, React 19, Prisma 7, TS 6, Tailwind 4, NextAuth v5-beta, Neon, Vercel, Upstash, Stripe, Resend, ImageKit, Mapbox.
> **Last reconciled:** 2026-05-22 against branch `fix/calendar-shadcn-mirror` (code = ground truth; statuses below were re-verified file-by-file).

## 0. How to read this

- **Status legend** — ✅ DONE · 🟡 PARTIAL · ⬜ OPEN. Status reflects the **actual code on disk on 2026-05-22**, not the older docs (which were stale in both directions).
- **Priority** — P0 launch-blocker · P1 must-have within 30 days of public launch · P2 should-have · P3 nice-to-have / scale.
- **Story format** — concise title + acceptance, with **now:** = the current verified state and **gap:** = what remains. Evidence is `file:line`.
- **Epic IDs** use the strategic taxonomy (`F/P/H/T/R/N/A/U/D`). The BMAD ticket IDs (`Epic 1–12`) map onto these — see the [ID crosswalk](#16-id-crosswalk).
- **Done criteria** for every story: tests (unit + an E2E where user-facing), i18n (EN+AR/RTL), a11y (axe pass), telemetry, and a short PR-grade comment where non-obvious.

## 1. Executive summary

### 1.0 Where we are: v1.0 shipped, not yet production-grade

A **v1.0 was shipped 2026-04-25** (PR #2 `425d393` → `main`, Vercel `dpl_7TuHGKSS…` READY, tag `v1.0.0`, live at `https://mk.databayt.org`). Per `docs/ship-readiness.md` that release closed **45 of 94 stories** and consciously deferred 49. This backlog is the path from that shipped-but-thin v1.0 to **fully production-ready**. Two pre-existing tracked issues remain from the ship: `#4` (`/api/listings/published` 500) and `#3` (Vercel env-var checklist).

**Reconciliation headlines (what changed since the docs were written):**
- **Stripe is wired end-to-end for the Homes booking flow** — server (`createStripePaymentIntent`, `handleStripeWebhook`, `processRefund`) was real at v1.0; client `<PaymentElement>` (`src/components/booking/payment/card-checkout.tsx`) + the `BookingPayment` data model landed 2026-05-24 (commit `ba6ba02`). Reference methods (Bankak/Cashi/mobile money/bank transfer) and cash both persist `BookingPayment` rows; admin reconciles reference flow via `verifyBookingPayment`. **Transport payment is still honor-system** — see below.
- **Transport payment is still honor-system** — `processPayment` fabricates `TXN-{ts}-{rand}` (`transport-actions.ts:1644`) and never reaches Stripe; bank account `1234567890` is still hardcoded (`transport/booking/checkout/content.tsx:258`).
- **Shipped since the docs but were marked "to do":** publish flow (`publishListing` + validation + `/api/upload` DELETE), editor "Coming soon" stubs replaced, real Mapbox search map, transport operator dashboard (overview/bookings/earnings/trips), long-term lease/payment wiring, `cancelTrip` passenger notifications, Node 22 in CI, `requireRole` at layouts, `lastLogin` writes, pg_trgm search indexes, `prisma migrate deploy` in build.
- **"Config added but never wired" (regressions to watch):** `src/lib/env.ts` (throwing zod) is dead code while the live `env-check.ts` *fails open in prod*; `.prettierrc` + `lefthook.yml` exist but neither tool is installed; `serverExternalPackages` lists only `@react-pdf/renderer`; CI lint ceiling is 850 (not strict); E2E is `continue-on-error`.
- **`ship-readiness.md` is itself optimistic:** it marks the hosting dashboard 🟢, but `/hosting` is a static illustration, `/hosting/calendar` a hardcoded grid, and there is no earnings route.

### 1.1 Current state by domain (verified 2026-05-22)

| Domain | Built | State |
|---|---|---|
| Schema (Prisma, 27 models) | 95 % | Solid. Missing: Notification, Message/Conversation, Payout, PlatformConfig/PlatformFee, AuditLog, Report, Passenger, EmailLog, Wishlist. `PaymentStatus` lacks `Refunded`. |
| Auth (NextAuth v5-beta.31) | 80 % | `requireRole` at layouts ✅, `lastLogin` ✅. **Suspension not checked on *either* sign-in path** (`auth.ts:112`); 2FA opt-in only; still on beta. |
| Homes — onboarding & publish | 85 % | Publish CTA + validation + draft→public all work (`use-finish-setup.tsx`, `publishListing`). Steps mostly English. |
| Homes — listing editor | 35 % | Stubs replaced with forms, but only ~4 of ~25 pages persist (amenities/location/description/instant-book). Pricing/house-rules/co-hosts/travel/availability/title don't save. |
| Homes — search | 70 % | Real Mapbox search map ✅. **Two routes again** (`/listings` + a re-added `/search` that loads all + filters in JS). No date-availability filter. Detail map still static Bordeaux PNG. |
| Homes — booking | 80 % | Reserve→createBooking works ✅. **Checkout pays for real** (card via Stripe test mode; reference flow persists `BookingPayment` Pending-Verification; cash persists Pending). Confirmation email helper exists but uncalled; no auto-Complete; no review prompt. |
| Homes — reviews | 50 % backend / 0 % UI | `review-actions.ts` complete; **zero UI callers**. Detail shows hardcoded reviews + "Hosted by Faisal". |
| Homes — favorites | 50 % | Search-grid heart works; detail heart writes **localStorage only** (`addFavoriteProperty` exists, uncalled). Dead `useFavorite.ts` remains. |
| Homes — host dashboard | 20 % | `/hosting` + `/hosting/calendar` are static stubs; no earnings route; `new-property` still RTK Query. |
| Transport — operator onboarding | 70 % | 7-step flow. **No `verifyTransportOffice`**; unverified offices appear in search; orphan office row on entry; license is free-text. |
| Transport — fleet/routes/trips | 65 % | TZ-correct ✅, `cancelTrip` notifies ✅. `seatLayout` JSON ignored (always 4-col); no bulk/recurring create; cache tags never invalidated. |
| Transport — booking | 75 % | 30-min hold + cron sweep. Single-passenger model; Read-Committed seat race; two seat-picker codepaths. |
| Transport — payment | 20 % | Honor-system; `processPayment` fakes TXN, flips Paid; hardcoded bank account. Stripe webhook *can* handle `kind=transport` but checkout never routes there. |
| Transport — ticket | 50 % | QR + validate action. No PDF, no email delivery (helper exists, uncalled), no HMAC signing, no scanner UI. |
| Transport — operator dashboard | 75 % | Overview KPIs + bookings + earnings + trips routes live ✅. No manifest export, no CSV, no occupancy report. |
| Rides | 5 % | Schema only (`Ride`, `RideDriver`). Zero actions/routes/UI. |
| Payments (cross-vertical) | 60 % | Stripe server + webhook ✅; client `<PaymentElement>` ✅ for Homes; `BookingPayment` model + reference + cash flows ✅; admin verify action ✅. Still open: transport-checkout Stripe path; admin verification **UI**; refund-on-cancel (`cancelBooking` doesn't refund); payouts; fee ledger. Currency config still `SAR`. |
| Notifications | 20 % | 5 email helpers (2FA, reset, verify, trip-cancel, booking-confirm[uncalled]); auth mails from sandbox `onboarding@resend.dev`. No in-app, no SMS, no booking/payment/application emails. |
| Messaging | 0 % | No model, no UI. |
| Admin | 50 % | Users/listings/offices CRUD + read-only payment ledger. Settings "Coming soon"; no verify-office; no refund panel; audit is `logger.info` only. |
| i18n / RTL | 70 % | Dictionaries in sync (1931 keys, genuine AR). ~20 editor pages hardcoded English; admin tables `text-right`; `og:locale=ar_SA`, currency `SAR` (Sudan product). |
| Accessibility | 70 % | Skip-link ✅, debug panel now dead-code ✅, 0 raw `<img>`. Transport-search labels lack `htmlFor`; one card uses div-onClick. |
| SEO | 50 % | sitemap leaks `/login` + unbounded; **zero JSON-LD**; no `og-default.png`; `og:locale=ar_SA`; numeric IDs (no slug). |
| Performance | 72 % | Search/transport Mapbox lazy ✅; property-detail map eager. Dead deps (`@tiptap/*`, `@react-pdf/renderer`) still in `package.json`; sitemap unbounded; `/search` loads all listings. |
| Observability | 10 % | No APM, no `instrumentation.ts`. Logger emits plain strings, no request-id, no PII redaction. `/api/health` pings Redis but isn't split healthy/ready. |
| Testing | 70 % | 833 unit + 14+3 E2E. **E2E `continue-on-error` (non-gating)**; no coverage threshold; `tests/` excluded from tsc. |
| CI/CD | 60 % | Node 22 ✅, typecheck/lint/test/build/e2e + `migrate deploy` ✅. Lint ceiling 850 (not strict); no deploy/preview-smoke; no `pnpm audit`/Dependabot. |
| Legal / Compliance | 25 % | Privacy/Terms/Cookies skeletal. No cookie banner, no GDPR export/delete, no LICENSE. report-issue posts to a GitHub repo. |

### 1.2 Remaining launch blockers ("do not call it production-ready until")

1. **Money path: Homes ✅, Transport ✅, refund-on-cancel ✅** *(closed 2026-06-11)* — Homes booking takes card (Stripe), reference, or cash and persists `BookingPayment` rows; webhook flips Booking → Confirmed. Transport mirrors it: `createTransportPaymentIntent` card path, reference claims pending operator `verifyPayment`, per-office bank/momo details, no fabricated TXN. `cancelBooking` computes the policy refund (`src/lib/refund.ts`) and fires the Stripe refund; transport cancel refunds per 24h/6h policy. *(P1.S5, P3.S3)*
2. **Refunds & cancellation policy not enforced** — `cancelBooking` flips status only; no `Refunded` enum; policy not persisted from editor. *(P3)*
3. **Fake data on listing detail** — hardcoded reviews, "Hosted by Faisal", static map; the real review API has zero callers. *(H4, H6)*
4. **No transactional emails** for booking/payment/application (helpers exist, uncalled; auth mail from sandbox sender). *(N1)*
5. **Operators self-publish unverified** — no `verifyTransportOffice`; unverified offices show in search. *(T1)*
6. **No observability** — no APM/error tracking, unstructured logs, no request-id. *(F3)*
7. **Safety nets fail open/silent** — env validation never throws in prod, rate-limit no-ops without Redis, CSP keeps `unsafe-inline`. *(F2, F5)*
8. **Two parallel rental flows** (Booking vs Application/Lease/Payment) unreconciled. *(H10)*
9. **Soft CI gates** — E2E non-gating, lint ceiling 850, no security scanning, no preview smoke. *(D1, D2)*
10. **No cookie consent / GDPR / LICENSE.** *(F4)*
11. **Host dashboard is a static stub** — hosts can't see bookings/calendar/earnings. *(H9)*
12. **In-flight branch is incoherent** — `/search` re-added as JS-filter route, contradictory comments/`revalidatePath`, 18 MB of debug artifacts at repo root. *(see [§17](#17-immediate-branch-cleanup))*

### 1.3 Recommended phasing

- **Phase 0 — Stabilize (1–2 wks):** branch cleanup (§17), F5 hygiene, F2.S1/S4, F1.S2 (suspension) + F1.S8 (env), F3.S1–S3/S5 (APM + JSON logs + request-id + health), F6 indexes, D1 strict gates, H10 decision.
- **Phase 1 — Soft-launch readiness (3–8 wks):** P1 (Stripe client), P2 (reference rails), P3 (refunds), P4 (currency→SDG); H1 i18n, H3 search consolidation, H4 real detail, H5 booking E2E, H6 reviews, H9 host dashboard; T1 verify, T2 bulk/seatLayout/cache, T3 race, T4 multi-passenger, T5 PDF+email; N1 emails, N2 SMS-OTP; A1 admin ops, A4 audit log; U1 i18n sweep, U3.S6 sitemap, U4 perf; D2 coverage, D3 staging.
- **Phase 2 — Public launch (9–14 wks):** H2 editor, H8 tenant polish; T6 manifest, T5 scanner; N3 in-app, N4 messaging; A2 moderation, A3 verification; U2 a11y AA, U3 full SEO/JSON-LD, U5 marketing, U6 analytics.
- **Phase 3 — Growth (15+ wks):** R1 rides MVP, P5 payouts, P4.S6 multi-currency, Superhost/smart-pricing/iCal, D4 backups.

---

## 2. Epic catalog (status rollup)

| # | Epic | Pri | Done/Total | Status |
|---|---|---|---|---|
| **F1** | Auth, RBAC & Account Security | P0 | 2 / 10 | 🟡 |
| **F2** | Network Security, CSP & Rate Limiting | P0 | 0 / 10 | ⬜ |
| **F3** | Observability — Errors, Logs, Metrics | P0 | 0 / 8 | ⬜ |
| **F4** | Legal, Privacy & GDPR | P0 | 0 / 7 | ⬜ |
| **F5** | Build, Type, Lint & Bundle Hygiene | P0 | 4 / 12 | 🟡 |
| **F6** | Database Operations & Data Quality | P1 | 3 / 10 | 🟡 |
| **P1** | Stripe Card Payments | P0 | 5 / 8 | 🟢 |
| **P2** | Sudan Mobile Money & Bank Transfer | P0 | 3 / 7 | 🟡 |
| **P3** | Refunds & Cancellation Policy | P0 | 1 / 7 | ⬜ |
| **P4** | Currency, Pricing & Fee Ledger | P1 | 1 / 6 | 🟡 |
| **P5** | Host & Operator Payouts | P1 | 0 / 6 | ⬜ |
| **H1** | Host Onboarding & Publish | P0 | 5 / 8 | 🟢 |
| **H2** | Listing Editor (post-publish) | P1 | 1 / 10 | 🟡 |
| **H3** | Search, Filters, Discovery | P0 | 1 / 9 | 🟡 |
| **H4** | Listing Detail Page (real data) | P0 | 1 / 9 | ⬜ |
| **H5** | Booking Flow (end-to-end) | P0 | 1 / 9 | 🟡 |
| **H6** | Reviews & Ratings | P0 | 0 / 7 | ⬜ |
| **H7** | Favorites / Wishlists | P1 | 0 / 5 | ⬜ |
| **H8** | Tenant Dashboard | P1 | 1 / 7 | 🟡 |
| **H9** | Host Dashboard & Calendar | P0 | 0 / 8 | ⬜ |
| **H10** | Reconcile Booking vs Lease | P0 | 0 / 3 | 🟡 |
| **T1** | Operator Onboarding & Verification | P0 | 0 / 7 | ⬜ |
| **T2** | Fleet, Routes, Trip Scheduling | P0 | 2 / 12 | 🟡 |
| **T3** | Trip Search & Seat Selection | P1 | 0 / 7 | ⬜ |
| **T4** | Multi-passenger Booking | P0 | 0 / 6 | ⬜ |
| **T5** | Ticket Delivery (PDF/Email/SMS/QR) | P0 | 0 / 7 | ⬜ |
| **T6** | Operator Dashboard & Manifest | P0 | 2 / 7 | 🟡 |
| **R1** | Rides MVP | P2 | 0 / 9 | ⬜ |
| **N1** | Transactional Emails | P0 | 1 / 7 | 🟡 |
| **N2** | SMS Channel | P1 | 0 / 5 | ⬜ |
| **N3** | In-app Notifications | P1 | 0 / 5 | ⬜ |
| **N4** | Host ↔ Guest Messaging | P1 | 0 / 6 | ⬜ |
| **A1** | Admin Operations Console | P0 | 1 / 7 | 🟡 |
| **A2** | Content Moderation & Reporting | P1 | 0 / 6 | ⬜ |
| **A3** | Identity, Phone & Host Verification | P1 | 0 / 5 | ⬜ |
| **A4** | Audit Log Persistence & Viewer | P1 | 0 / 5 | ⬜ |
| **U1** | i18n & RTL Parity Sweep | P0 | 0 / 10 | 🟡 |
| **U2** | Accessibility (WCAG 2.1 AA) | P1 | 2 / 10 | 🟡 |
| **U3** | SEO, Metadata & Structured Data | P1 | 0 / 8 | ⬜ |
| **U4** | Performance & Caching | P1 | 1 / 10 | 🟡 |
| **U5** | Marketing Surface | P1 | 0 / 8 | ⬜ |
| **U6** | Analytics & Conversion | P1 | 0 / 6 | ⬜ |
| **D1** | CI/CD, Migrations, Preview Smokes | P0 | 3 / 9 | 🟡 |
| **D2** | Test Coverage & Strategy | P1 | 0 / 7 | ⬜ |
| **D3** | Staging & Rollback Runbook | P0 | 0 / 6 | ⬜ |
| **D4** | Backup, PITR & Retention | P1 | 0 / 4 | ⬜ |

**Totals: ~38 / ~322 stories done.** (The v1.0 "45/94" counted only the Homes/Transport BMAD subset; this backlog tracks the full production surface.)

---

## 3. Foundation epics

### Epic F1 — Auth, RBAC & account security · P0 · 🟡 2/10
Done: ✅ S3 (`requireRole` at /hosting,/managers,/tenants,/offices,/admin layouts — `src/lib/auth-guard.ts:12`), ✅ S5 (`lastLogin` write — `auth.ts:92`).

| Story | St | Detail |
|---|---|---|
| F1.S1 Pin NextAuth off beta | ⬜ | now: `5.0.0-beta.31` (`package.json`). gap: move to GA; re-run auth E2E. |
| F1.S2 Suspension check on **all** sign-in paths | ⬜ | now: `auth.ts:112` returns `true` for OAuth immediately; credentials path checks only `emailVerified`/2FA — **`isSuspended` never checked**. gap: gate both paths. **(launch blocker)** |
| F1.S3b /transport-host role gate | 🟡 | now: `transport-host/[id]/layout.tsx:12` uses `requireAuth` only — any USER passes. gap: `requireRole`. |
| F1.S4 Enforce 2FA for ADMIN (+TOTP) | ⬜ | now: 2FA opt-in; admin layout doesn't require it. |
| F1.S6 `requireOwnership(model,id)` helper | ⬜ | gap: central ownership guard for every mutating action. |
| F1.S7 `User.locale` + middleware preference | ⬜ | gap: persist signed-in users' locale. |
| F1.S8 Resolve `NEXTAUTH_SECRET` vs `AUTH_SECRET` mismatch | 🟡 | now: live `env-check.ts` uses `NEXTAUTH_SECRET`; dead `env.ts` uses `AUTH_SECRET`; they disagree on length. gap: one schema (see F5). |
| F1.S9 Unify auth audit events → AuditLog | ⬜ | depends A4. |
| F1.S10 i18n verification/reset emails | ⬜ | depends N1. |

### Epic F2 — Network security, CSP & rate limiting · P0 · ⬜ 0/10
| Story | St | Detail |
|---|---|---|
| F2.S1 Hard-fail boot in prod if Upstash env absent | ⬜ | now: `rate-limit.ts:114,259` no-op when `redis=null`; env optional. **Rate limiting silently off on a misconfigured prod deploy.** **(launch blocker)** |
| F2.S2 `withRateLimit` on every `"use server"` mutation | ⬜ | now: ~11 call sites only. gap: cover transport/admin/payment actions. |
| F2.S3 Rate-limit login/register/reset/OAuth/2FA | 🟡 | partial coverage; verify auth tier. |
| F2.S4 Clamp `/api/placeholder` dimensions ≤4096 | ⬜ | now: `route.ts:8` no upper bound — OOM vector. |
| F2.S5 Nonce-based CSP; drop script `'unsafe-inline'` | ⬜ | now: `proxy.ts:107` keeps `'unsafe-inline'` in prod. **(launch blocker)** |
| F2.S6 CSP `report-uri` → logger sink | ⬜ | depends F3. |
| F2.S7 Security headers on `/api` responses | ⬜ | now: `proxy.ts:196` returns before `addSecurityHeaders`; `next.config.ts` adds only Cache-Control to /api. |
| F2.S8 `pnpm audit --audit-level=high` in CI | ⬜ | gap: fail on high-sev. |
| F2.S9 Restrict `serverActions.allowedOrigins` | 🟡 | now: env-driven, defaults `[]` (`next.config.ts:40`). |
| F2.S10 Test proxy origin check + allow-list | ⬜ | gap: `proxy.test.ts` matrix. |

### Epic F3 — Observability · P0 · ⬜ 0/8
| Story | St | Detail |
|---|---|---|
| F3.S1 APM via `instrumentation.ts` (externalise OTel ESM) | 🟡 | 2026-06-11: `src/instrumentation.ts` ships `onRequestError` → structured JSON to Vercel logs + boot-time env validation; dedicated APM SDK still unchosen. |
| F3.S2 Structured JSON logger + PII redaction | ⬜ | now: `logger.ts:3` plain strings. |
| F3.S3 Request-id (ULID) via AsyncLocalStorage | ⬜ | now: none in `src`. |
| F3.S4 `withMetrics` HOF on top actions | ⬜ | |
| F3.S5 Split `/api/health` healthy vs ready | 🟡 | now: real Redis ping ✅ (`health/route.ts:67`) but single endpoint; `checks.redis` reflects env presence. |
| F3.S6 `X-Mkan-Version: <sha>` header | ⬜ | |
| F3.S7 Source-map upload to APM | ⬜ | |
| F3.S8 External uptime monitor + alerting | ⬜ | |

### Epic F4 — Legal, privacy & GDPR · P0 · ⬜ 0/7
| Story | St | Detail |
|---|---|---|
| F4.S1 Cookie-consent banner (EN+AR, scoped) | ✅ | 2026-06-11: `consent/cookie-banner.tsx` + consent-gated Vercel Analytics. |
| F4.S2 GDPR data-export | ⬜ | now: none; no `User.deletedAt`. |
| F4.S3 GDPR delete/anonymise account | ⬜ | |
| F4.S4 Rewrite privacy/terms/cookies (governing law, etc.) | 🟡 | now: ~47-line skeletons. |
| F4.S5 Add `LICENSE` + `CODE_OF_CONDUCT.md` | ⬜ | now: no LICENSE at root. |
| F4.S6 Sanctions/export-control allow-list | ⬜ | |
| F4.S7 report-issue → private ticketing (not public GitHub) | ⬜ | now: `report/pipeline.ts:40` posts to GitHub via PAT (behind a credibility pipeline, but destination is a repo). |

### Epic F5 — Build, type, lint & bundle hygiene · P0 · 🟡 4/12
Done: ✅ Node 22 in CI (`ci.yml:14`), ✅ stray `Drepo*` removed, ✅ `tsbuildinfo` gitignored, ✅ `serverExternalPackages` present (partial set).

| Story | St | Detail |
|---|---|---|
| F5.env One env schema that throws in prod | 🟡 | now: live `env-check.ts:125` logs + returns (never throws); throwing `env.ts` imported by nobody. **(launch blocker — silent boot on bad env)** |
| F5.prettier Install prettier + `format` script | ⬜ | now: `.prettierrc` exists, prettier **not installed**, no `format` script. |
| F5.lefthook Install lefthook | ⬜ | now: `lefthook.yml` exists, binary **not installed** — hooks don't run. |
| F5.S2 Remove dead heavy deps | 🟡 | now: `@tiptap/*`, `@react-pdf/renderer` in `package.json`, 0 imports. gap: remove (or dynamic-import react-pdf for T5). |
| F5.S3 Full `serverExternalPackages` set | 🟡 | now: only `@react-pdf/renderer`; add prisma/neon/pg/ws/bcryptjs/sanitize-html. |
| F5.S4 `lint:strict` (`--max-warnings 0`) in CI | ⬜ | now: ceiling 850 (`ci.yml:42`). |
| F5.tsconfig Include `tests/` in typecheck | ⬜ | now: `tsconfig.json:54` excludes tests. |
| F5.S5 Mapbox dynamic everywhere | 🟡 | now: search+transport lazy; `property/location.tsx:3` still top-level. |
| F5.S6 `lodash` → `lodash/debounce` | ⬜ | now: full import in `filters-full.tsx:6`, `filters-bar.tsx:6`. |
| F5.S9 Remove demo Unsplash hotlinks | ⬜ | now: `gallery.tsx`, `photo-tour.tsx` mock arrays. |
| F5.docker Decide Docker fate | ⬜ | |

### Epic F6 — Database operations & data quality · P1 · 🟡 3/10
Done: ✅ `prisma migrate deploy` in build (`scripts/maybe-migrate.mjs`), ✅ seed scripts type-clean, ✅ pg_trgm GIN on Location (`20260508120000`).

| Story | St | Detail |
|---|---|---|
| F6.S1 Rotate any leaked DB creds; read from env | ⬜ | verify `scripts/test-pg.mjs`. |
| F6.S4 Missing indexes | ⬜ | now: Review(listingId,createdAt), TransportOffice composite, User(role,…), Payment(paymentStatus,dueDate), TransportBooking(tripId,status), **Account.userId, Session.userId** all absent; `Application(propertyId,status)` exists in a migration but **dropped from schema.prisma → drift**. |
| F6.S6 Tune Neon pool for serverless | ⬜ | |
| F6.S7 Prisma read-retry wrapper (P1001/P1017/P2024) | ⬜ | |
| F6.S8 `NOT NULL` on should-be-required fields | ⬜ | e.g. `Listing.title`. |
| F6.S9 Migration runbook | ⬜ | |
| F6.S10 Generalise `nameAr`/`descriptionAr` pattern | ⬜ | still in schema (`:52,469,471`). |

---

## 4. Payments epics

### Epic P1 — Stripe card payments · P0 · 🟢 5/8  ·  *(BMAD Epic 4)*
Done: ✅ `createStripePaymentIntent` (`payment-actions.ts:651`), ✅ `handleStripeWebhook` (`:694`, handles lease + `kind=transport_booking` + `kind=booking_payment`), ✅ webhook route, ✅ **S1 client SDKs installed** (`@stripe/stripe-js ^9.6.0`, `@stripe/react-stripe-js ^6.4.0`), ✅ **S4 Homes Payment Element mounted** (`src/components/booking/payment/card-checkout.tsx` + `BookingPayment` model + intent metadata routing).

| Story | St | Detail |
|---|---|---|
| P1.S5 Transport checkout = real card path | ✅ | 2026-06-11: `createTransportPaymentIntent` + `TransportCardCheckout`; webhook confirms booking + seats; fake TXN removed. |
| P1.S6 Idempotency-Key in `createBooking` | ⬜ | now: no idempotency. (Note: webhook itself is idempotent via Stripe event_id semantics + `$transaction`.) |
| P1.S7 3-D Secure verified | 🟡 | `confirmPayment({ redirect: 'if_required' })` handles SCA in-page. Needs a test-card matrix run. |
| P1.S8 Test/live env switch; never log card meta | 🟡 | server keys switch; verify in CI. |

### Epic P2 — Sudan mobile money & bank transfer · P0 · 🟡 3/7
Done (2026-05-24): ✅ S1 `BookingPaymentMethod`/`BookingPaymentStatus` enums + `BookingPayment` model with `reference`/`verifiedAt`/`verifiedBy` columns (the design's analogue to `PaymentGateway`/`PaymentReference`); ✅ S5 Reference forms inline in checkout (`bookings/[id]/checkout/content.tsx` `ReferenceForm`) for all 4 methods, plus `createBookingReferencePayment` server action; ✅ verify *action* shipped (`verifyBookingPayment` — flips PendingVerification → Paid + Booking → Confirmed in one `$transaction`).

| Story | St | Detail |
|---|---|---|
| P2.S5b Per-host bank details (drop hardcoded `1234567890`) | 🟡 | 2026-06-11: transport checkout reads office `bankName/bankAccount/bankHolder/momoNumber`; operators edit them on office-info. Homes reference form still generic. |
| P2.S6 Cash-on-arrival operator confirm + reminder | 🟡 | Booking cash path persisted ✅ (`createBookingCashPayment`); host-confirms-receipt action + SMS reminder still ⬜. |
| P2.S7 Admin verification **UI** | ⬜ | server action exists; `/admin/payments` is still a read-only ledger — needs a "Pending verification" tab + Approve/Reject buttons calling `verifyBookingPayment`. |
| P2.S2/S3 Real Bankak/MTN provider clients | ⬜ | (no public API — reference flow is the design.) |

### Epic P3 — Refunds & cancellation policy · P0 · ⬜ 1/7
Done: ✅ `processRefund` (`payment-actions.ts:789`, admin-gated, real `stripe.refunds.create`).

| Story | St | Detail |
|---|---|---|
| P3.S1 Add `Refunded` to `PaymentStatus` enum | ⬜ | now: enum is Pending/Paid/PartiallyPaid/Overdue; webhook `charge.refunded` sets lease back to `Pending` as a hack (`:770`). |
| P3.S2 Persist `Listing.cancellationPolicy` from editor | 🟡 | now: column+enum exist; editor uses local `useState` + a save button calling **no action**. |
| P3.S3 Compute refund eligibility in `cancelBooking` | ✅ | 2026-06-11: `src/lib/refund.ts` policy calculator + automatic Stripe refund against the paid card intent. |
| P3.S4 Transport cancellation policy + refund | ⬜ | |
| P3.S5 Capture `cancellationReason`/`cancelledBy` | ⬜ | |
| P3.S6 Cancellation email/notification both sides | ⬜ | depends N1/N3. |
| P3.S7 Idempotent `cancelBooking` | ⬜ | transport double-cancel double-increments seats. |

### Epic P4 — Currency, pricing & fee ledger · P1 · 🟡 1/6
Done: ✅ `formatCurrency` util (`src/lib/i18n/formatters.ts:9`, special-cases SDG).

| Story | St | Detail |
|---|---|---|
| P4.currency Fix config `SAR`→`SDG` | ⬜ | now: `internationalization/config.ts:24` ar=`SAR`. |
| P4.S1 `currency` columns on Payment/Booking/Transport* | ⬜ | none. |
| P4.S3 Replace 82 raw `toLocale*` with locale helpers | ⬜ | across 44 files. |
| P4.S4 `PlatformFee` ledger model | ⬜ | service fee stays virtual. |
| P4.S5 Externalise fee % to `PlatformConfig` | ⬜ | depends A1. |
| P4.S6 Multi-currency display (FX) | ⬜ | Phase 3. |

### Epic P5 — Host & operator payouts · P1 · ⬜ 0/6
All open — no `Payout` model, no payout UI/cron/ledger. Stripe Connect (international) + manual bank (Sudan). Phase 2–3.

---

## 5. Homes vertical epics

### Epic H1 — Host onboarding & publish · P0 · 🟢 5/8  ·  *(BMAD Epic 6 partial)*
Done: ✅ Publish CTA → `publishListing` (`use-finish-setup.tsx:28`), ✅ server validation gates, ✅ `/api/upload` DELETE (`route.ts:153`), ✅ draft→public path, ✅ no draft publicly visible.
Open: ⬜ S6 i18n every step (~most English); 🟡 S3 per-step `enableNext`; 🟡 S4 defer orphan row; gap: validation requires ≥1 photo (spec wanted ≥5).

### Epic H2 — Listing editor (post-publish) · P1 · 🟡 1/10  ·  *(BMAD Epic 6)*
Done: ✅ "Coming soon" stubs replaced with form UIs.
**Core gap: ~21 of 25 editor pages don't persist.** Only amenities/location/description/instant-book save.
| Story | St | Detail |
|---|---|---|
| H2.S1 Title editor saves | ⬜ | `details/title/page.tsx` static. |
| H2.S2 Pricing/guests/type/accessibility persist | ⬜ | `details/pricing/page.tsx` display-only. |
| H2.S3 Photo-tour rooms persist | ⬜ | |
| H2.S4 Co-hosts (`Listing.coHosts`) | ⬜ | local `useState` only. |
| H2.S5 House rules persist | ⬜ | local state. |
| H2.S6 Cancellation policy persist | ⬜ | see P3.S2. |
| H2.S7 Travel tab (directions/wifi/manual/check-in…) persist | ⬜ | 9 pages, none save. |
| H2.S8 Availability + `BlockedDate` CRUD editor | ⬜ | local state; no BlockedDate write action. |
| H2.S9 Seasonal pricing UI | ⬜ | |
| H2.S10 iCal import/export | ⬜ | Phase 3. |

### Epic H3 — Search, filters, discovery · P0 · 🟡 1/9
Done: ✅ Real Mapbox search map (`listings/search-map.tsx`).
**Decision taken: keep BOTH `/listings` (grid) and `/search` (map) — but `/search` must filter in the DB.**
| Story | St | Detail |
|---|---|---|
| H3.S1 Make `/search` DB-filtered (keep `/listings`) | ⬜ | now: `search/page.tsx:36` loads all + `.filter()` in JS; reuse `searchListings` (`search-actions.ts`). Remove dummy fallback cards (`:182`), use theme tokens, reconcile `listing-actions.ts:188` comment + dangling `revalidatePath("/search")`. |
| H3.S2 Date-availability filter | ⬜ | now: checkIn/out ignored. |
| H3.S4 Real coords on **detail** map | ⬜ | now: static Bordeaux `map.png` (`listings/map.tsx:21`). |
| H3.S5 Hero search → `/api/search/locations` combobox | 🟡 | verify wiring. |
| H3.S6 Server-side filter facets | 🟡 | |
| H3.S7 Recent searches (localStorage) | ⬜ | |
| H3.S8 Home carousels as server components | 🟡 | |
| H3.S9 Sudan-relevant categories (drop Islands/Yacht) | ⬜ | |

### Epic H4 — Listing detail page (real data) · P0 · ⬜ 1/9
Done: ✅ `/listings/[id]/photos` route exists.
| Story | St | Detail |
|---|---|---|
| H4.S1 Reviews from `getListingReviews`/`getReviewSummary` | ✅ | 2026-06-11: server-rendered `Review` slot + real MobileReviews; fabricated `atom/reviews.tsx` breakdown removed from detail page. |
| H4.S2 Real `listing.host` (not "Faisal") | ⬜ | now: `hosted-by.tsx` hardcoded Faisal + Unsplash. |
| H4.S3 Computed `isSuperhost` | 🟡 | derived proxy, not a program. |
| H4.S4 `isSaved` from server | 🟡 | from localStorage. |
| H4.S5 `handleSave` → `addFavoriteProperty` | ✅ | 2026-06-11: optimistic DB favorite for signed-in users (+`initialIsSaved` from server); localStorage only when anonymous. |
| H4.S6 Photo lightbox modal | 🟡 | now: `listing-details-client.tsx:57` scrolls instead. |
| H4.S8 Share button | ⬜ | |
| H4.S9 "Report this listing" → moderation | ⬜ | depends A2. |

### Epic H5 — Booking flow (end-to-end) · P0 · ⬜ 0/9
| Story | St | Detail |
|---|---|---|
| H5.S2 Card payment via P1 | ✅ | landed 2026-05-24 in commit `ba6ba02`: `CardCheckout` mounts `<PaymentElement>`, `createBookingPaymentIntent` creates a `BookingPayment(method=Card,status=Pending)` row + intent, webhook flips to Confirmed. Reference + cash paths shipped alongside (see P2). |
| H5.S3 Booking confirmation email (guest+host, iCal) | 🟡 | `mail.ts:71 sendBookingConfirmationEmail` exists but **never called**. |
| H5.S4 Reminder emails | ⬜ | |
| H5.S5 Auto-mark `Completed` cron | ⬜ | crons exist (overdue/monthly/seats); no auto-complete. |
| H5.S6 Review-request on completion | ⬜ | |
| H5.S7 Cancellation + refund | ⬜ | see P3. |
| H5.S8 Status timeline on `/bookings/[id]` | 🟡 | badge + dates, not a timeline. |
| H5.S9 Receipt PDF | ⬜ | |
| H5.S1 `specialRequests` captured | ⬜ | |

### Epic H6 — Reviews & ratings · P0 · ⬜ 0/7
All open — backend complete, **zero UI callers**. Post-stay form, detail-page list, host reply, two-sided reviews, reminder cron, moderation, distribution display. **(launch blocker)**

### Epic H7 — Favorites / Wishlists · P1 · ⬜ 0/5
| Story | St | Detail |
|---|---|---|
| H7.S1 Detail-page favorite persists to server | 🟡 | localStorage (see H4.S5). |
| H7.S2 Multi-list `Wishlist`/`WishlistItem` | ⬜ | only flat `Tenant.favorites`. |
| H7.S5 Remove dead `useFavorite.ts` | ⬜ | still on disk, 0 importers. |
| H7.S3/S4 Collections UI + share | ⬜ | |

### Epic H8 — Tenant dashboard · P1 · 🟡 1/7
Done: ✅ S1 trips cancel uses correct action per type (stays→`cancelBooking`; the old "transport uses homes action" bug is gone).
| Story | St | Detail |
|---|---|---|
| H8.S1b Transport tab cancel button | 🟡 | display-only; transport `cancelBooking` exists (`:1349`), not wired. |
| H8.S2 Receipts sub-tab + PDF | ⬜ | |
| H8.S4 Settings (profile/locale/currency/notifs/sessions) | ⬜ | |
| H8.S7 Replace RTK Query in residences/applications | ⬜ | `state/api.ts` (367 lines) still consumed. |
| H8.S5/S6 Messages + identity tabs | ⬜ | depends N4/A3. |

### Epic H9 — Host dashboard & calendar · P0 · ⬜ 0/8  ·  *(BMAD Epic 5 — ship-readiness marked 🟢, actually stubs)*
| Story | St | Detail |
|---|---|---|
| H9.S1 Today page: real check-ins via `getHostBookings` | ✅ | 2026-06-11: `/hosting` queries live Pending/Confirmed bookings, partitions Today/Upcoming, renders cards; empty state kept. |
| H9.S2 Multi-listing calendar (drag-to-block) | ⬜ | now: `hosting/calendar/page.tsx:43` hardcoded 35-cell grid. |
| H9.S3 Bookings list page | ⬜ | action exists, unconsumed. |
| H9.S4 Earnings page + CSV | ⬜ | no route. |
| H9.S5 Reviews page | ⬜ | |
| H9.S8 `/managers/new-property` → server action | ⬜ | still `useCreatePropertyMutation`. |
| H9.S6/S7 Analytics + inbox | ⬜ | |

### Epic H10 — Reconcile Booking vs Application/Lease/Payment · P0 · 🟡 0/3
| Story | St | Detail |
|---|---|---|
| H10.S1 Record decision in `docs/decisions/0001-rental-flow.md` | ⬜ | now: no `docs/decisions/`. **(launch blocker — unblocks H2/H8)** |
| H10.S2 Migrate/delete per decision | ⬜ | |
| H10.S3 If both: clear "Stays" vs "Rentals" labels | 🟡 | both flows coexist; leases now wired (`managers/properties/[id]`). |

---

## 6. Transport vertical epics

### Epic T1 — Operator onboarding & verification · P0 · ⬜ 0/7
| Story | St | Detail |
|---|---|---|
| T1.S1 `verifyTransportOffice` admin action | ✅ | 2026-06-11: `verifyOffice`/`unverifyOffice` + admin button; `searchTrips` gates on `office.isVerified`. |
| T1.S2 Exclude `isVerified=false` from search/public | ⬜ | now: `getOffices` filters `isActive` only; `isVerified` drives a badge. |
| T1.S3 License-doc upload before review | ⬜ | now: `licenseNumber` free-text. |
| T1.S4 Defer office row creation | ⬜ | now: `transport-host/overview:23` creates placeholder on entry. |
| T1.S5 Approve/deny notification | ⬜ | |
| T1.S6 Operator profile (bank/hours) | 🟡 | name/phone/email/license/logo only. |
| T1.S7 Verified badge on results/ticket | 🟡 | office pages only. |

### Epic T2 — Fleet, routes, trip scheduling · P0 · 🟡 2/12  ·  *(BMAD Epic 9)*
Done: ✅ S9 `cancelTrip` notifies passengers + emails (`transport-actions.ts:1052`), ✅ S11 TZ helper (`MARKET_TZ`/`dayWindow`).
| Story | St | Detail |
|---|---|---|
| T2.S1 Use `Bus.seatLayout` JSON in `createTrip` | ⬜ | now: hardcoded `ceil(capacity/4)` rows (`:945`); add seat-layout editor. |
| T2.S3/S4 Bulk + recurring trip creator | ⬜ | now: single `createTrip` only — ~420 clicks/operator-month. |
| T2.S5 "Both directions" shortcut | ⬜ | |
| T2.S8 Trip update regenerates seats safely | 🟡 | ownership re-check only. |
| T2.S10 Office calendar view | ⬜ | |
| T2.S12 `revalidateTag` on mutations | ⬜ | now: tags defined but never invalidated → stale cache. |
| T2.S2/S6/S7 Bus photos / route toggle / soft-delete | ⬜ | |

### Epic T3 — Trip search & seat selection · P1 · ⬜ 0/7
| Story | St | Detail |
|---|---|---|
| T3.S1 One SeatPicker codepath | ⬜ | now: standalone component + embedded picker in `trips/[id]/page.tsx:57`. |
| T3.S2 Race-safe reservation (`FOR UPDATE`/advisory lock) | ⬜ | now: `createBooking` plain `findMany`+`updateMany` in a Read-Committed tx (`:1196`). |
| T3.S3 Live availability (SSE/poll) | ⬜ | |
| T3.S4–S7 Sort options / fuzzy / alt-dates / cache | ⬜ | |

### Epic T4 — Multi-passenger booking · P0 · ⬜ 0/6
All open — no `Passenger` model; `createBooking:1211` stores one passenger for N seats. Manifest, per-passenger ticket, single-passenger cancel, optional ID field. **(launch blocker for groups)**

### Epic T5 — Ticket delivery · P0 · ⬜ 0/7
| Story | St | Detail |
|---|---|---|
| T5.S1 Ticket PDF (dynamic `@react-pdf/renderer`) | ⬜ | now: on-screen QR only. |
| T5.S2 Email ticket on confirmation | 🟡 | helper exists; `confirmBooking:1258` doesn't call it. |
| T5.S3 SMS ticket | ⬜ | depends N2. |
| T5.S4 Signed (HMAC) QR | ⬜ | now: plain JSON (`generateTicketData:1707`) — forgeable. |
| T5.S5/S6 Boarding scanner UI + verify endpoint | ⬜ | |
| T5.S7 Wallet pkpass | ⬜ | |

### Epic T6 — Operator dashboard & manifest · P0 · 🟡 2/7  ·  *(BMAD Epic 9)*
Done: ✅ S1 dashboard KPIs (`getOfficeDashboardStats:1819`), ✅ S2 bookings list.
Open: ⬜ S3 per-trip manifest (print/PDF) — **launch blocker for boarding**; 🟡 S4 revenue page exists, no CSV; ⬜ S5/S6 occupancy + cancellation reasons.

---

## 7. Rides vertical (Phase 3)

### Epic R1 — Rides MVP · P2 · ⬜ 0/9
Schema-only (`Ride`, `RideDriver`); **zero** actions/routes/UI/pricing. Scope-controlled spike in Phase 3: driver onboarding, request page, pricing lib, dispatch, driver app, live location, charge via P1/P2, two-way rating, cancellation.

---

## 8. Notifications & messaging

### Epic N1 — Transactional emails · P0 · 🟡 1/7  ·  *(BMAD Epic 11)*
Done: ✅ `cancelTrip` email wired.
| Story | St | Detail |
|---|---|---|
| N1.S1 Real `EMAIL_FROM` (not sandbox) | 🟡 | now: 3 auth emails hardcoded `onboarding@resend.dev`; transport env-aware w/ sandbox fallback. |
| N1.S2 React-Email templates (`src/emails/`) | ⬜ | now: inline HTML in `mail.ts`. |
| N1.S3 Event coverage (booking/payment/application/etc.) | 🟡 | now: 5 helpers; `sendBookingConfirmationEmail` **uncalled**; no payment/application emails. **(launch blocker)** |
| N1.S4 `EmailLog` + Resend bounce webhook | ⬜ | |
| N1.S5 Locale-aware mail (EN+AR) | ⬜ | all English. |
| N1.S6 Unsubscribe link | ⬜ | |
| N1.S7 SPF/DKIM/DMARC on domain | ⬜ | |

### Epic N2 — SMS channel · P1 · ⬜ 0/5
No provider integration. OTP, booking, boarding reminder, dispatch. Throttling + opt-out.

### Epic N3 — In-app notifications · P1 · ⬜ 0/5
No `Notification` model; only static `hosting/notification-card.tsx` banner. Bell + feed + per-event emit + preferences.

### Epic N4 — Host ↔ guest messaging · P1 · ⬜ 0/6
No `Conversation`/`Message` model, route, or UI. `/inbox`, contact-host CTA, system greeting, moderation hooks, notification.

---

## 9. Admin & trust-and-safety

### Epic A1 — Admin operations console · P0 · 🟡 1/7
Done: 🟡 `getPlatformMetrics` + user/listing/office CRUD + read-only payment ledger (`admin-actions.ts`).
| Story | St | Detail |
|---|---|---|
| A1.S1 Replace `/admin/settings` "Coming soon" → `PlatformConfig` | ⬜ | now: `admin/settings/page.tsx:23` stub. |
| A1.S2 User detail (history/sessions/audit) | ⬜ | |
| A1.S3 Impersonation (audited, 5-min) | ⬜ | |
| A1.S5 Verify office | ⬜ | see T1.S1. |
| A1.S6 Refund panel | ⬜ | depends P3. |
| A1.S4/S7 Force reset / revenue dashboards | ⬜ | |

### Epic A2 — Content moderation & reporting · P1 · ⬜ 0/6
No `Report` model; report-issue posts to GitHub, not a moderation queue. Report CTA, queue UI, auto-flag, action effects, reporter notification.

### Epic A3 — Identity, phone & host verification · P1 · ⬜ 0/5
| Story | St | Detail |
|---|---|---|
| A3.S4 `verify-listing` page becomes real | 🟡 | now: `verify-listing/[id]/page.tsx:13` hardcoded mock steps. |
| A3.S1/S2/S3/S5 Phone OTP / KYC upload / badge / TOTP | ⬜ | |

### Epic A4 — Audit log persistence & viewer · P1 · ⬜ 0/5
No `AuditLog` model; `admin-actions.ts:19 audit()` = `logger.info` only. Persist, migrate calls, viewer + CSV, auth events, retention.

---

## 10. UX, i18n, a11y, SEO, marketing

### Epic U1 — i18n & RTL parity sweep · P0 · 🟡 0/10
| Story | St | Detail |
|---|---|---|
| U1.S1 Translate ~20 listing-editor pages | 🟡 | hardcoded English. |
| U1.S2 Replace inline `lang==="ar"?…` ternaries | 🟡 | |
| U1.S4 Replace 82 raw `toLocale*` (see P4.S3) | ⬜ | |
| U1.S5 Admin tables `text-right` → logical props | ⬜ | all 5 admin tables. |
| U1.S6 Carousel/calendar chevrons flip in RTL | ⬜ | |
| U1.S9 `og:locale ar_SA`→`ar_SD`; `SAR`→`SDG` | ⬜ | `metadata.ts:35`. |
| U1.S7/S8/S10 sidebar `start-0` / phone input / currency unify | ⬜ | |
| U1.S3 Localise email/SMS | ⬜ | depends N1/N2. |
| U1.placeholders i18n 17 hardcoded form placeholders | ⬜ | `PropertyForm.tsx`, `application-modal.tsx`, host title/description, `city-select.tsx`. |

### Epic U2 — Accessibility (WCAG 2.1 AA) · P1 · 🟡 2/10
Done: ✅ S9 skip-link/landmarks; ✅ S4 `debug-auth.tsx` now dead-code (not rendered).
| Story | St | Detail |
|---|---|---|
| U2.S1 Tie transport-search inputs to labels | 🟡 | `search-widget.tsx:109` `<label>` no `htmlFor`. |
| U2.kbd Card div-onClick → button/Link | ⬜ | `hosting/listing/listing-card.tsx:112`. |
| U2.S2/S3/S5–S8/S10 icon labels / nested main / focus / contrast / headings / alt | 🟡 | spot fixes. |

### Epic U3 — SEO, metadata & structured data · P1 · ⬜ 0/8
| Story | St | Detail |
|---|---|---|
| U3.S2 `/og-default.png` (1200×630) | ⬜ | missing. |
| U3.S3 JSON-LD (LodgingBusiness/Trip/LocalBusiness/Organization) | ⬜ | zero `ld+json`. |
| U3.S4 Slug column + `/listings/[id]-[slug]` | ⬜ | numeric IDs. |
| U3.S6 Sitemap: drop `/login`/auth, bound + cache | ⬜ | `sitemap.ts:14` leaks login; unbounded `findMany`. |
| U3.S1/S5/S7/S8 metadataBase / trip+office metadata / hreflang / viewport | 🟡 | |

### Epic U4 — Performance & caching · P1 · 🟡 1/10
Done: 🟡 S3 Mapbox lazy on search+transport (property-detail still eager).
Open: ⬜ S1 cache sitemap; ⬜ S5 Neon pool; ⬜ S6 read-retry; ⬜ S7 dynamic PDF; ⬜ S9 Unsplash→ImageKit; ⬜ S10 bundle budget in CI; 🟡 S2/S4/S8 home `React.cache`/searchTrips cache/image priority.

### Epic U5 — Marketing surface · P1 · ⬜ 0/8
| Story | St | Detail |
|---|---|---|
| U5.S3 Footer `href="#"` → real routes | ⬜ | 8 occurrences. |
| U5.S4 Help articles in DB (`HelpArticle`) | ⬜ | static pages. |
| U5.S1/S2/S5–S8 imagery / categories / dedup footer / trust signals / newsletter / press | ⬜ | |

### Epic U6 — Analytics & conversion · P1 · ⬜ 0/6
Zero instrumentation (no PostHog/GA/Vercel Analytics). Provider, event taxonomy, consent-gated, funnels, web-vitals, server events.

---

## 11. DevOps & quality

### Epic D1 — CI/CD, migrations, preview smokes · P0 · 🟡 3/9  ·  *(BMAD Epic 3)*
Done: ✅ Node 22, ✅ `migrate deploy` on build, ✅ E2E job exists (sharded).
| Story | St | Detail |
|---|---|---|
| D1.S1 Make E2E gating | ⬜ | now: `ci.yml:110 continue-on-error:true`. |
| D1.S3 Coverage upload + drop-gate | ⬜ | no thresholds. |
| D1.S4 `lint:strict` in CI | ⬜ | ceiling 850. |
| D1.S6 Preview-deploy smoke | ⬜ | |
| D1.S7 `pnpm audit:ci` (high blocks) | ⬜ | |
| D1.S9 Bundle-size budget | ⬜ | |

### Epic D2 — Test coverage & strategy · P1 · ⬜ 0/7
Expand vitest `include` (route.ts/proxy/components), component tests (calendar/wizard/uploader/seat-picker/checkout), integration via Neon branch, E2E backfill (onboarding/booking+payment/review/bulk-trip/scan), faker factories, flake quarantine, perf budget.

### Epic D3 — Staging & rollback runbook · P0 · ⬜ 0/6
Vercel staging + Neon branch + Upstash staging; auto-deploy `develop`; protected `main`; `docs/runbook-rollback.md` + `docs/runbook-incident.md`; feature flags.

### Epic D4 — Backup, PITR & retention · P1 · ⬜ 0/4
Neon restore drill, off-site `pg_dump`, retention crons (AuditLog/EmailLog/Notification), secrets-rotation procedure.

---

## 12. Cross-epic dependency graph

```
F5 ──► (everything)
F1 ─┬─► H1, T1, A1, A3
    └─► F2 ─► every mutation ;  F4 ─► U6
F3 ─┬─► D1 ─► D3 ─► D4
    └─► A4 ─► A1, A2
F6 ─► H3, T2, T3, U4
P1 ─┬─► H5, T5, P3, P4, P5   (P1 server done → unblock client wiring first)
P2 ─┘
N1 ─┬─► H5, H6, T2, T5, A1
N2,N3┘
H10 ─► H2, H8        T4 ─► T5, T6
```

## 13. Phase sequencing (remaining work)

See [§1.3](#13-recommended-phasing). The single highest-leverage next step is **P1 client wiring** (the server is done) + **F-cluster Phase-0 stabilization** + **branch cleanup (§17)**, because they unblock revenue, observability, and a clean base for everything else.

## 14. Definition of "production-ready"

Ship when all hold (collapses the §1.2 blocker list to zero):
1. Money moves end-to-end (Stripe + ≥1 Sudan rail) on prod for 7 reconciled days.
2. Hosts publish + receive bookings + see them; guests get emails/tickets; both can cancel within policy → correct refund.
3. Operators verified before search; bulk trip creation works.
4. Auth hardened — admin 2FA, suspension honored on all paths, every mutation rate-limited, CSP without `unsafe-inline`.
5. Observable — APM live, JSON logs + request-id, metrics on top-10 actions, uptime alerting.
6. Legal — cookie consent, GDPR export/delete, counsel-reviewed terms, LICENSE.
7. Gates — typecheck + lint:strict + unit + E2E + preview-smoke on every PR; coverage stable >80 %.
8. Performance — home LCP <2.5 s, listings p75 LCP <3 s, search p95 <1 s.
9. i18n parity — AR users complete every flow without English (snapshot-asserted).
10. Rollback runbook practised once staging→prod.

## 15. Maintenance

- This file is the **only** backlog. On closing a story: flip its status here and tick the §2 rollup; on closing an epic, mark the header 🟢/✅ and link merged PRs. Reference epic/story IDs (e.g. `P1.S4`) in commit messages and PR titles.
- Re-run a reconciliation pass (audit code vs this file) at the start of each phase — the 2026-04-25 docs drifting from reality is the failure mode this consolidation fixes.
- New post-launch epics append with a `G.` (Growth) prefix.

## 16. ID crosswalk (BMAD `Epic N` ↔ strategic IDs)

| BMAD ticket (archived `docs/epics/`) | Strategic epics | v1.0 result |
|---|---|---|
| Epic 1 — Build & Deploy Hardening | F5, D1 | 7/9 — env throws & lint:strict deferred |
| Epic 2 — Type Safety / DTO Layer | (F-cross) | 4/6 — transport done, homes casts remain |
| Epic 3 — E2E Coverage in CI | D1, D2 | 1/8 — job added, non-gating |
| Epic 4 — Homes Multi-Gateway Payments | P1, P2, P3, N1 | 4/13 — Stripe server only |
| Epic 5 — Homes Hosting Dashboard | H9 | overstated 🟢; actually stubs |
| Epic 6 — Homes Editor Completeness | H1, H2 | stubs replaced, persistence missing |
| Epic 7 — Homes Long-Term Rental | H10, P (lease) | lease/payment wired; PDF/RTK deferred |
| Epic 8 — Homes Polish & Cleanup | H3, H4, U-cross | partial; `/search` re-added in current branch |
| Epic 9 — Transport Operator Dashboard | T6, T2 | 5/7 — dashboard live |
| Epic 10 — Transport Multi-Gateway Payments | P1/P2 (transport) | 0/6 — honor-system remains |
| Epic 11 — Transport Notifications & Polish | N1, T5 | 1/5 — cancelTrip notify only |
| Epic 12 — Production Ship | (gate) | v1.0 SHIPPED 2026-04-25 |

## 17. Immediate branch cleanup (`fix/calendar-shadcn-mirror`)

Before more feature work, land the current branch coherently:
- **`/search` (H3.S1):** keep both routes per decision, but rewrite `/search` to filter in the DB (reuse `searchListings`), drop the dummy fallback cards + raw `text-gray-*`, fix the contradictory `listing-actions.ts:188` comment and dangling `revalidatePath("/search")`, i18n the new components (`search-header`, `search-map`, `transport-map`, `transport-testimonials`).
- **Repo hygiene:** 20 root `*.mjs` debug scripts + 11 root `*.png` (~18 MB) are untracked and not gitignored — add ignore rules (excepting tracked `eslint.config.mjs`/`postcss.config.mjs`) and remove the artifacts.
- **Console cleanup:** route the 249 `console.*` (35 in `PropertyForm.tsx`) through `logger` (ties into F3.S2).
