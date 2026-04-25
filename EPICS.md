# Mkan — Production-Readiness Epics & Stories

> **Synthesized from a full-codebase audit** of `/Users/abdout/mkan` (Next.js 16,
> React 19, Prisma 7, Tailwind 4, NextAuth v5 beta, Neon, Vercel, Upstash).
> 583 TS/TSX files (~81 k LOC), 27 Prisma models, 9 migrations, 8 audit reports.
> Last revised: **2026-04-25**.

This document is the canonical roadmap from current state (~60–70 % built, mostly
not production-grade) to **fully production-ready**. It is organised as a tree of
**Epics → Stories → Acceptance criteria**, with priorities, dependencies, and a
recommended phase plan.

---

## 0. Conventions

- **Priority** — P0 launch-blocker · P1 must-have within 30 days of public
  launch · P2 should-have · P3 nice-to-have / scale.
- **Vertical** — `Homes`, `Transport`, `Rides`, `Platform` (cross-cutting).
- **Story format** — `As a <role>, I want <capability>, so that <outcome>` with a
  testable acceptance list.
- **Done criteria** — every story ships with: tests (unit + at least one E2E
  where user-facing), i18n (EN+AR with RTL), a11y (axe pass), telemetry, and a
  short PR-description-grade comment in the touched module if the change is
  non-obvious.
- **File paths** are relative to repo root unless absolute.

## 1. Executive summary

### 1.1 Where Mkan is today

| Domain | Built | State |
|---|---|---|
| Schema (Prisma, 27 models) | 95 % | Solid; Booking + Application/Lease parallel needs disambiguation; missing Notification/Message/Conversation/Payout/RideReview models. |
| Auth (NextAuth v5 beta) | 80 % | JWT, OAuth (Google, Facebook only), 2FA email-only, password reset, suspension. **OAuth path bypasses suspension check**; **rate limit gone if Redis missing**. |
| Homes — host onboarding | 60 % | 14-step flow saves drafts. **No publish CTA**; listings stay `draft:true` forever. |
| Homes — listing editor | 30 % | ~50 % of pages are "Coming soon" stubs; cleaning fee / discounts / co-hosts / house rules / cancellation policy not persisted. |
| Homes — search | 70 % | Two parallel search pages (`/listings`, `/search`). No date-availability filter. Static map images on detail + search. |
| Homes — booking | 75 % | Reserve widget fully wired. **Card payment is a toast**; no email receipt; no auto-Complete; no review prompt. |
| Homes — reviews | 50 % backend / 0 % UI | Server actions complete; UI shows hardcoded Sarah/Ahmed/Fatima sample reviews and "Hosted by Faisal". |
| Homes — favorites | 50 % | Search-grid heart works; **detail-page heart is `console.log`**. |
| Transport — operator onboarding | 70 % | 7-step stepper, but `createTransportOffice` writes a placeholder row before any data is captured; **no admin-verify action exists**. |
| Transport — fleet/routes/trips | 65 % | Bus `seatLayout` JSON ignored on trip create (always 4-col); **no bulk/recurring trip creation** — 420 clicks per operator-month. |
| Transport — search | 90 % | TZ-correct (`Africa/Khartoum`), facets via parallel queries, cached popular routes. **Cache tags never invalidated**. |
| Transport — booking | 75 % | 30-min seat hold + cron sweep wired. **Single-passenger model for multi-seat bookings**. Read-Committed race on seat reservation. |
| Transport — payment | 20 % | All methods stubbed; `processPayment` fakes `TXN-{ts}-{rand}` and flips status to Paid. **Bank account `1234567890` hardcoded in checkout UI.** |
| Transport — ticket | 50 % | QR works, validation action exists. **No PDF, no email delivery, no boarding scanner UI**. |
| Rides | 5 % | Schema only. No code, no UI, no actions. |
| Payments (cross-vertical) | 10 % | Stripe SDK **not installed**. Webhook route absent. Refund/payout/cancellation-policy enforcement all missing. Currency mismatch (config says `SAR`, UI says `SDG`/`$`). |
| Notifications | 15 % | 3 transactional emails only (verification, reset, 2FA). `from: onboarding@resend.dev` (sandbox). No in-app notifications, no SMS, no booking emails. |
| Messaging | 0 % | No model, no UI, no transport. |
| Admin | 50 % | Users/listings/offices CRUD in admin; **settings page is "Coming soon"**; **no verifyOffice action**; audit log only `console.log`'d. |
| i18n / RTL | 70 % | Dictionaries in sync; ~20 listing-editor pages bypass i18n entirely; admin tables use `text-right` (breaks AR); carousel/calendar chevrons don't flip. |
| Accessibility | 65 % | Skip-link, landmarks present; transport-search labels not tied to inputs; debug panel renders in normal tree. |
| SEO | 55 % | sitemap leaks `/login`; **zero JSON-LD**; `og-default.png` missing; `og:locale=ar_SA` on a Sudan product; numeric listing IDs (no slug). |
| Performance | 70 % | TZ + caching mostly correct; **dead heavy deps** (`@tiptap/*`, `@react-pdf/renderer`); Mapbox not dynamically imported; sitemap query unbounded. |
| Observability | 10 % | Sentry removed; replacement not wired. Logger emits plain strings, no request-id, no PII redaction. No metrics. |
| Testing | 65 % | 831 unit + 117 E2E tests. **E2E does not run in CI**; coverage scope misses `src/app`, middleware, components. |
| CI/CD | 50 % | typecheck + lint + test + build. **Node 20 in CI vs `>=22.12` engines**. No deploy pipeline, no preview smoke, no migration step. |
| Legal / Compliance | 30 % | Privacy/Terms/Cookies pages exist but skeletal. **No cookie banner**, no GDPR data-export, no LICENSE file, no Sudan tenancy disclaimer. |

### 1.2 Top-level launch blockers (the "if these aren't done, do not launch" list)

1. Hosts cannot publish a listing.
2. Money cannot be moved end-to-end (Stripe + mobile-money both stubbed).
3. Refunds, cancellation-policy enforcement, and payouts do not exist.
4. Hardcoded sample data on listing detail (reviews, host, map) misrepresents every listing.
5. Two parallel data flows (Booking vs. Application/Lease/Payment) on the same listing — must be reconciled or one removed.
6. No transactional emails for booking confirmation, payment, cancellation, review request.
7. Admin cannot verify a transport operator (operators self-publish unchecked).
8. Production has no error tracking, no metrics, no structured logging, no request-id correlation.
9. Rate limiting silently no-ops without Redis; OAuth bypasses suspension check; CSP retains `unsafe-inline`.
10. Listing-editor and several admin pages are still hardcoded English.
11. Cookie consent banner missing; GDPR data-rights flows missing.
12. CI doesn't run E2E, doesn't gate coverage, doesn't run `prisma migrate deploy` on prod, and lints with `warn` only on most rules.

### 1.3 Recommended phasing

- **Phase 0 (weeks 1–2) — Stabilize**: kill dead deps, fix OAuth suspension, wire rate-limit hard-fail, JSON logger + request-id, instrumentation skeleton. No user-visible changes.
- **Phase 1 (weeks 3–8) — Soft-launch readiness (Homes + Transport, Sudan-only)**: payments (Stripe + Bankak/MoMo for Transport), publish flow, real listing detail, review prompt, transport admin-verify, bulk trip create, cancellation enforcement, transactional emails, cookie consent, observability live.
- **Phase 2 (weeks 9–14) — Public launch**: messaging, host calendar, multi-passenger transport, ticket PDF + scanner, full SEO/JSON-LD, full a11y/RTL polish, analytics.
- **Phase 3 (weeks 15+) — Growth**: Rides vertical MVP, multi-currency, payouts via Stripe Connect (or manual ledger), Superhost, smart pricing, data-export/delete, advanced analytics.

---

## 2. Epic catalog (index)

| # | Epic | Priority | Vertical | Phase |
|---|---|---|---|---|
| **F.** | **Foundation** | | | |
| F1 | Auth, RBAC & Account Security | P0 | Platform | 0–1 |
| F2 | Network Security, CSP & Rate Limiting | P0 | Platform | 0–1 |
| F3 | Observability — Errors, Logs, Metrics | P0 | Platform | 0–1 |
| F4 | Legal, Privacy & GDPR | P0 | Platform | 1 |
| F5 | Build, Type, Lint & Bundle Hygiene | P0 | Platform | 0 |
| F6 | Database Operations & Data Quality | P1 | Platform | 0–2 |
| **P.** | **Payments & Money** | | | |
| P1 | Stripe Card Payments (Homes + Transport) | P0 | Platform | 1 |
| P2 | Sudan Mobile Money & Bank Transfer | P0 | Transport / Homes | 1 |
| P3 | Refunds, Cancellation Policy Enforcement | P0 | Platform | 1 |
| P4 | Currency, Pricing & Service Fee Ledger | P1 | Platform | 1–2 |
| P5 | Host & Operator Payouts | P1 | Platform | 2 |
| **H.** | **Homes Vertical** | | | |
| H1 | Host Onboarding & Publish | P0 | Homes | 1 |
| H2 | Listing Editor (post-publish) | P1 | Homes | 1–2 |
| H3 | Search, Filters, Discovery | P0 | Homes | 1 |
| H4 | Listing Detail Page (real data) | P0 | Homes | 1 |
| H5 | Booking Flow (end-to-end) | P0 | Homes | 1 |
| H6 | Reviews & Ratings | P0 | Homes | 1 |
| H7 | Favorites / Wishlists | P1 | Homes | 1 |
| H8 | Tenant Dashboard | P1 | Homes | 1 |
| H9 | Host Dashboard & Calendar | P0 | Homes | 1–2 |
| H10 | Reconcile Booking vs Application/Lease/Payment | P0 | Homes | 0 |
| **T.** | **Transport Vertical** | | | |
| T1 | Operator Onboarding & Verification | P0 | Transport | 1 |
| T2 | Fleet, Routes, Trip Scheduling | P0 | Transport | 1 |
| T3 | Trip Search & Seat Selection | P1 | Transport | 1 |
| T4 | Multi-passenger Booking | P0 | Transport | 1 |
| T5 | Ticket Delivery (PDF, Email, SMS, QR scan) | P0 | Transport | 1–2 |
| T6 | Operator Dashboard & Manifest | P0 | Transport | 1–2 |
| **R.** | **Rides Vertical** | | | |
| R1 | Rides MVP (driver app + passenger request) | P2 | Rides | 3 |
| **N.** | **Notifications & Messaging** | | | |
| N1 | Transactional Emails (i18n, branded) | P0 | Platform | 1 |
| N2 | SMS Channel (Sudan rails) | P1 | Platform | 1–2 |
| N3 | In-app Notifications | P1 | Platform | 2 |
| N4 | Host ↔ Guest Messaging | P1 | Homes / Transport | 2 |
| **A.** | **Admin & Trust-and-Safety** | | | |
| A1 | Admin Operations Console | P0 | Platform | 1 |
| A2 | Content Moderation & Reporting | P1 | Platform | 1–2 |
| A3 | Identity, Phone & Host Verification | P1 | Platform | 2 |
| A4 | Audit Log Persistence & Viewer | P1 | Platform | 1 |
| **U.** | **UX, i18n, A11y, SEO, Marketing** | | | |
| U1 | i18n & RTL Parity Sweep | P0 | Platform | 1 |
| U2 | Accessibility (WCAG 2.1 AA) | P1 | Platform | 1–2 |
| U3 | SEO, Metadata & Structured Data | P1 | Platform | 1–2 |
| U4 | Performance & Caching | P1 | Platform | 1–2 |
| U5 | Marketing Surface (landing, footer, help) | P1 | Platform | 1–2 |
| U6 | Analytics & Conversion Instrumentation | P1 | Platform | 2 |
| **D.** | **DevOps & Quality** | | | |
| D1 | CI/CD Pipeline, Migrations, Preview Smokes | P0 | Platform | 0–1 |
| D2 | Test Coverage & Strategy | P1 | Platform | 1 |
| D3 | Staging Environment & Rollback Runbook | P0 | Platform | 1 |
| D4 | Backup, PITR & Incident Response | P1 | Platform | 1–2 |

---

## 3. Foundation epics

### Epic F1 — Auth, RBAC & account security

**Goal.** Production-grade authentication and authorization across all roles
(USER, TENANT, MANAGER, DRIVER, ADMIN, SUPER_ADMIN), with safe defaults,
auditable changes, and no provider-specific bypasses.

**Definition of done.** All roles enforce server-side checks at layout +
action level, NextAuth pinned off beta, OAuth honors suspension, 2FA
mandatory for admins, all auth flows rate-limited.

| Story | Acceptance |
|---|---|
| **F1.S1** Pin NextAuth to a stable GA release. | `pnpm list next-auth` returns non-beta; CI build green; auth E2E suite passes. |
| **F1.S2** OAuth path checks `User.isSuspended` in `auth.ts` `signIn` callback (not only credentials path). | Suspending a user revokes Google/Facebook re-entry within one sign-out cycle; covered by integration test. |
| **F1.S3** Apply `requireRole()` helper at layout level for `/hosting`, `/managers`, `/tenants`, `/offices`, `/transport-host`. | Direct visit by a USER returns 403; covered by `dashboard-access.spec.ts`. |
| **F1.S4** Enforce 2FA for ADMIN and SUPER_ADMIN; offer TOTP (RFC 6238) in addition to email. | Admin without 2FA cannot reach admin layout; QR-based enrolment flow works in EN+AR. |
| **F1.S5** Add `lastLogin` write on every successful auth (currently the column exists but never updates). | `User.lastLogin` updates within 200 ms of session creation; admin user table shows real timestamps. |
| **F1.S6** Add a server-action `requireOwnership(model, id)` helper used by every action that mutates a row. | Attempting to mutate another user's listing/booking returns 403 from the action; refactor reduces ad-hoc `canOverride` patterns. |
| **F1.S7** Add `User.locale` column; middleware prefers `session.user.locale` > cookie > Accept-Language. | Signed-in Arabic users keep RTL after a private-browsing session; settings page persists choice. |
| **F1.S8** Separate `NEXTAUTH_SECRET` vs `AUTH_SECRET` env mismatch. | `.env.example` and `env-check.ts` agree; Vercel envs documented. |
| **F1.S9** Unify auth audit logs (login, logout, role-change, suspend, 2FA-enrol, password-reset) to the new `AuditLog` model from F4. | Every event has `userId, action, ip, userAgent, requestId, createdAt`. |
| **F1.S10** Email-verification + password-reset emails are i18n-aware (read locale from caller). | Arabic users receive Arabic verification + reset emails; covered by snapshot tests. |

**Dependencies.** F2 (rate-limit), F3 (logger/request-id), N1 (email).

---

### Epic F2 — Network security, CSP & rate limiting

**Goal.** Defense-in-depth at the edge: strict CSP without `unsafe-inline`,
hardened cookies, mandatory rate-limiting for every state-changing action.

| Story | Acceptance |
|---|---|
| **F2.S1** Hard-fail boot in production if Upstash Redis env vars are absent. | Misconfigured deploy refuses to serve traffic; `/api/health` reports 503; alert fires. |
| **F2.S2** Wrap every `"use server"` mutation with `withRateLimit(action, opts)` (auth/upload/payment/mutation tiers). | `transport-actions.ts` (30+ actions) and `admin-actions.ts` and `payment-actions.ts` all have a tier; brute-force tests show 429 within budget. |
| **F2.S3** Rate-limit credentials login, register, reset, OAuth callback, 2FA verify at `auth` tier. | 100 sequential failed logins from a single IP rejected after the limit; verified by test. |
| **F2.S4** Clamp `/api/placeholder/[...dimensions]` at `width,height ≤ 4096`. | 4097-dimension request returns 400; current OOM vector closed. |
| **F2.S5** Implement nonce-based CSP and remove `'unsafe-inline'` from `script-src`. | Per-request nonce flows through `next/headers`; `Content-Security-Policy-Report-Only` clean for 24 h on staging before flip to enforce. |
| **F2.S6** Add `report-uri`/`report-to` for CSP violations; ingest into the new logger sink. | Violations show up in dashboard; test with deliberate violation. |
| **F2.S7** Move security headers from middleware-only to also `next.config.ts` `headers()` so API short-circuit responses still carry them. | All API routes reply with `X-Frame-Options`, `X-Content-Type-Options`, etc. |
| **F2.S8** `npm audit --audit-level=high` runs in CI on main-branch merges; fail on high. | New advisory blocks PRs; documented exception flow. |
| **F2.S9** Restrict `serverActions.allowedOrigins` to known origins; remove dev fallback. | Cross-origin POST to a server action returns 403 in prod. |
| **F2.S10** Document and test the proxy origin check (`isOriginMismatch`) including `ALLOWED_ORIGINS` allow-list. | New `proxy.test.ts` covers POST/PUT/PATCH/DELETE × authed/anon × allowed/blocked origin. |

**Dependencies.** D1 (CI), F3 (logger).

---

### Epic F3 — Observability: errors, logs, metrics

**Goal.** Every production request is observable: errors land in an APM, logs
are JSON with request-id correlation, mutations emit timing + outcome metrics,
and a real `/api/health` distinguishes healthy from ready.

| Story | Acceptance |
|---|---|
| **F3.S1** Wire error tracking via Next 16 `instrumentation.ts` (Sentry, BetterStack, or Highlight — pick one). Externalise ESM packages so Vercel boot is clean. | A thrown error in any server component or action appears in the dashboard within 60 s; `/api/health` reports the integration as `ready`. |
| **F3.S2** Replace string logger with structured JSON (`pino` or equivalent), level-driven by env, redact `password|token|authorization|email|stack`. | Vercel log drain parses fields; PII redaction unit-tested. |
| **F3.S3** Add request-id middleware: generate ULID per request, set `X-Request-Id` header, propagate via `AsyncLocalStorage` so logger auto-stamps. | Every log line for a single request shares the same `requestId`; CI test asserts this. |
| **F3.S4** Add `withMetrics(actionName, fn)` HOF: emits `duration_ms`, `success`, `error` to a metrics backend (Upstash or Datadog). | `createBooking`, `processPayment`, `searchTrips` p50/p95 visible on a dashboard. |
| **F3.S5** Split `/api/health` into `healthy` (DB, env required for traffic) and `ready` (Redis, ImageKit, Resend). Fix `checks.redis` reflecting actual ping, not env presence. | Vercel deployment-protect gate keys off `healthy`; uptime monitor keys off `ready`. |
| **F3.S6** Add `X-Mkan-Version: <git-sha>` header in proxy and surface it in `/api/health`. | Every response carries the SHA; rollback verifications are scriptable. |
| **F3.S7** Configure source-map upload to APM; flip `productionBrowserSourceMaps` to true in build, but exclude from public output. | Stack traces in APM are demangled; source maps aren't served from `/_next/static`. |
| **F3.S8** Add an external uptime monitor (BetterStack/UptimeRobot) hitting `/api/health` every 60 s with alert routing. | Down-event triggers PagerDuty/email/Slack within 2 min. |

**Dependencies.** F2 (security headers must include APM endpoints), D1 (CI).

---

### Epic F4 — Legal, privacy & GDPR

**Goal.** Mkan can lawfully accept users in Sudan, the GCC, and the EU. Cookie
consent, data-rights, and rental-law disclosures all in place.

| Story | Acceptance |
|---|---|
| **F4.S1** Cookie-consent banner in EN+AR with Essential/Analytics/Marketing scopes; preference stored in `User.cookiePreferences` for signed-in users and `mkan_cookie_consent` cookie for anon. | Banner appears on first visit, persists choice, blocks analytics scripts when "deny all" chosen; covered by Playwright. |
| **F4.S2** GDPR data-export: `/tenants/settings/privacy` "Download my data" button creates a JSON+CSV bundle with all user-owned rows, sent via email link. | Pick a real user, request export, get a downloadable archive within 24 h. |
| **F4.S3** GDPR delete-my-account: soft-delete (anonymise PII) + `User.deletedAt`; bookings/reviews retained but author replaced by "Deleted user". | Deleted users cannot sign in; emails removed from rows; audit logged. |
| **F4.S4** Rewrite `/privacy`, `/terms`, `/cookies` to include: governing law (Sudan + venue choice), data-controller, dispute resolution, content-takedown notice, refund policy reference, rental-law disclaimer. | Reviewed by counsel (placeholder until then); both languages parity. |
| **F4.S5** Add LICENSE file to repo root (MIT or chosen); add `CODE_OF_CONDUCT.md`. | Visible at repo root; `pnpm audit:license` passes. |
| **F4.S6** Sanctions / export-control compliance check: refuse account creation from blocklisted countries (Sudan as a marketplace location is the operator decision; document it). | Configurable allow-list via env; documented in runbook. |
| **F4.S7** Replace `report-issue.tsx` GitHub-PAT path with a real ticketing endpoint that uses an AuditLog row + email to support. | User issue submissions are private (not posted to a public GitHub repo). |

**Dependencies.** F3 (logger), F1 (auth).

---

### Epic F5 — Build, type, lint & bundle hygiene

**Goal.** No silent build degradation; no dead heavy deps; consistent runtime
between dev, CI, and prod.

| Story | Acceptance |
|---|---|
| **F5.S1** Align Node version: bump CI matrix and Dockerfile to Node 22.12+ matching `package.json` `engines`. | `actions/setup-node@v4` uses `${{ env.NODE_VERSION }}` set to `'22'`; build green. |
| **F5.S2** Remove dead heavy deps: `@tiptap/react`, `@tiptap/starter-kit`, `@react-pdf/renderer` (currently zero imports). Decide whether to keep `react-pdf` for ticket PDF (T5); if yes, dynamic-import it. | `pnpm-lock.yaml` shrinks; bundle analyzer report drops these from shared chunk. |
| **F5.S3** Configure `serverExternalPackages` for `@prisma/client`, `@neondatabase/serverless`, `pg`, `ws`, `bcryptjs`, `sanitize-html`. | First request after deploy doesn't crash with `require() of ES Module`. |
| **F5.S4** Add `pnpm lint:strict` (`--max-warnings 0`) to CI; fix or downgrade-to-error each warning rule deliberately. | CI fails on new warnings; warning floor doesn't grow. |
| **F5.S5** Convert top-level Mapbox imports (`property/location.tsx`, `search/map.tsx`) to `next/dynamic({ ssr: false })`. | Listing detail and search routes shed ~300 KB gz. |
| **F5.S6** Convert `lodash` full import to `lodash/debounce` (or hand-rolled). Saves tens of KB. | Bundle analyzer shows lodash core gone. |
| **F5.S7** Delete the two stray root files `Drepomkanprismamigrationsadd_performance_indexes.sql` and `Drepomkansrcappapihealthroute.ts`. | Repo root clean. |
| **F5.S8** Decide Docker fate: either delete `Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml` (Vercel-only), or maintain parity with the live target (Node version, env). | One source of truth for runtime. |
| **F5.S9** Remove demo data from source: Unsplash hotlinks in `gallery.tsx`, `mobile-meet-host.tsx`. | Production bundle does not embed Unsplash URLs. |

**Dependencies.** D1 (CI).

---

### Epic F6 — Database operations & data quality

**Goal.** Schema drift is impossible to ship; common queries are indexed; cold
starts are mitigated; secrets aren't checked in.

| Story | Acceptance |
|---|---|
| **F6.S1** Rotate the Neon password leaked in `scripts/test-pg.mjs`; remove the file or read from env. | `git log -p` shows the rotation; secret scanning passes. |
| **F6.S2** Add Prisma migration `prisma migrate deploy` step to Vercel build (`prebuild` or a deploy-hook). | New migrations apply automatically on prod deploy; rollback runbook covers backwards. |
| **F6.S3** Fix seed script regressions (`seed-listings.ts`, `seed-transport.ts`). | `pnpm seed:listings && pnpm seed:transport` succeed against a fresh DB. |
| **F6.S4** Add missing indexes flagged by audit: `Review(listingId, createdAt)`, `TransportOffice(ownerId, isActive, isVerified, rating, name)`, `User(role, isSuspended, lastLogin)`, `Application(propertyId, status)`, `Payment(paymentStatus, dueDate)`, `TransportBooking(tripId, status)`. | Migration ships; `EXPLAIN ANALYZE` on listed queries shows index use. |
| **F6.S5** Enable `pg_trgm` extension; add GIN indexes on `Location.city/state/country` for ILIKE search. | `searchListings` location-text path uses index, not seq scan. |
| **F6.S6** Tune Neon connection-pool config for serverless: `pgbouncer=true&connection_limit=1&pool_timeout=0`. | Load test shows no pool exhaustion at 50 concurrent users. |
| **F6.S7** Add a runtime retry wrapper for Prisma read queries (P1001/P1017/P2024). | Cold-start P1001 doesn't surface to users; instrumented retry count visible in metrics. |
| **F6.S8** Add `Listing.title String NOT NULL` migration after backfill; same for any other should-be-required field. | Schema invariant matches business rule; UI no longer needs null guards. |
| **F6.S9** Document migration runbook in `docs/runbook-migrations.md`: branch naming, shadow DB, rollback, destructive-vs-safe split. | New engineer can ship a migration without ad-hoc help. |
| **F6.S10** Replace `AssemblyPoint.nameAr` ad-hoc field with a generic translation pattern (or freeze and document the deviation). | Same pattern for `TransportOffice.nameAr/descriptionAr`. |

**Dependencies.** D1 (CI), D3 (staging).

---

## 4. Payments epics

### Epic P1 — Stripe card payments (Homes + Transport)

**Goal.** A real card-payment path for both verticals, with webhook-driven
status updates, idempotency, and proper PCI segregation (no card data on our
servers).

| Story | Acceptance |
|---|---|
| **P1.S1** Install `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`; add Stripe envs to `env-check.ts` and `.env.example`. | `pnpm install` clean; envs documented. |
| **P1.S2** Implement `createStripePaymentIntent` (replaces stub at `payment-actions.ts:623`) for Homes bookings (amount=`totalPrice`, currency=`SDG`/`USD`, metadata `bookingId`). | `Booking.status=Pending` row gets a `paymentIntentId`; Payment Element renders. |
| **P1.S3** Implement `/api/webhooks/stripe/route.ts` — verifies signature, dispatches `payment_intent.succeeded` → `confirmBooking`, `.payment_failed` → mark booking failed, `charge.refunded` → mark refunded. | Webhook tested with `stripe trigger`; idempotent (replays don't duplicate state). |
| **P1.S4** Replace Homes "Card payment coming soon" toast with a real Payment Element checkout (`/bookings/[id]/checkout`). | Test card `4242…` results in a confirmed booking; receipt email sends. |
| **P1.S5** Replicate the same flow for Transport (`/transport/booking/[id]/checkout` Card method): payment intent → confirm → boarding ticket emitted. | Fake `TXN-{ts}-{rand}` removed from `processPayment` for card path; real Stripe charge ID stored. |
| **P1.S6** Idempotency: `createBooking` accepts an `Idempotency-Key`; double-submit doesn't create duplicate bookings or charges. | Test posts the same booking twice; only one row exists. |
| **P1.S7** Apply Strong Customer Authentication (3-D Secure) — Payment Element handles by default; verify on test cards. | `requires_action` flow completes correctly. |
| **P1.S8** Test mode vs live mode via env; never log full card metadata. | `STRIPE_SECRET_KEY` switching observed in CI. |

**Dependencies.** F3 (logger), N1 (email), P3 (refunds), F4 (terms).

---

### Epic P2 — Sudan mobile money & bank transfer

**Goal.** Real integration with the local rails users actually have: Bankak
(Bank of Khartoum), MTN MoMo, mCash, BoK direct. Honor-system removed.

| Story | Acceptance |
|---|---|
| **P2.S1** Replace honor-system `processPayment` for `MobileMoney`/`BankTransfer`/`CashOnArrival`. Each method gets a real handler with provider HTTP client. | `transport-actions.ts:processPayment` no longer fabricates `TXN-*`; real provider IDs stored. |
| **P2.S2** Bankak integration: HTTP client, signed-request auth, status-poll worker (or webhook if available). | Test booking via Bankak sandbox completes end-to-end. |
| **P2.S3** MTN MoMo (Sudan) integration: sign-up flow for OTP-based payment, retry policy. | Test booking via MTN sandbox completes; SMS OTP arrives. |
| **P2.S4** mCash, Cashi, Zain Cash optional providers behind feature flags. | Each gated by `ENABLE_<PROVIDER>=true`; UI shows only configured ones. |
| **P2.S5** Replace hardcoded "Bank of Khartoum / Mkan Transport Services / 1234567890" in `transport/booking/checkout/content.tsx:284-288` with per-operator bank details from `TransportOffice`. | Add columns `TransportOffice.bankName`, `bankAccount`, `bankAccountName`; surfaced in checkout. |
| **P2.S6** Cash-on-arrival workflow: booking stays `Pending`, operator marks Paid via `verifyPayment`; SMS reminder to passenger 24 h before departure. | Operator sees "Mark paid" CTA; passenger receives reminder. |
| **P2.S7** Reconciliation report (admin): list of all `TransportPayment` rows with mismatched provider TXN; export CSV. | Admin can audit fakes / discrepancies daily. |

**Dependencies.** P1 (webhook pattern), N2 (SMS).

---

### Epic P3 — Refunds, cancellation policy enforcement

**Goal.** Cancelling a booking actually moves money back, per the cancellation
policy that the host selected.

| Story | Acceptance |
|---|---|
| **P3.S1** Implement `processRefund` (replaces stub at `payment-actions.ts:663`). Calls Stripe refund API; updates `Payment.paymentStatus = Refunded` (add `Refunded` to `PaymentStatus` enum). | Cancelled-then-refunded booking shows refund timestamp; webhook updates status. |
| **P3.S2** Persist `Listing.cancellationPolicy` (already in schema — but UI doesn't save it). Wire the editor field. | Selecting Flexible/Moderate/Firm/Strict/NonRefundable on host editor persists; reads back correctly. |
| **P3.S3** Compute refund eligibility on `cancelBooking`: read policy + nights-to-checkin, calculate refundable amount, call `processRefund` with that amount. | Test matrix: each policy × cancel-time bucket → expected refund. |
| **P3.S4** Implement Transport cancellation policy: free cancel up to `routeDeparture - 24h`, 50 % refund 24–6 h, no refund <6 h. Configurable per office. | Add `TransportOffice.cancellationPolicy` JSON column; refund flow mirrors Homes. |
| **P3.S5** Cancellation reason capture on both verticals (`cancellationReason`, `cancelledBy`). | Booking detail shows reason; admin queryable. |
| **P3.S6** Email + in-app notification on cancellation (both sides). | Tested via N1/N3. |
| **P3.S7** Idempotency on `cancelBooking` — calling twice is a no-op (current code increments `availableSeats` twice in transport). | Unit test repro of double-cancel. |

**Dependencies.** P1 (Stripe), P2 (Bankak refund mode), N1 (email), F1 (auth).

---

### Epic P4 — Currency, pricing & service-fee ledger

**Goal.** One source of truth for currency display and storage; service fee is
a real row, not a virtual column; multi-currency display is locale-aware.

| Story | Acceptance |
|---|---|
| **P4.S1** Add `currency: String` columns to `Payment`, `TransportPayment`, `Booking`, `TransportBooking`. Backfill via migration (`SDG` for transport, `SDG` for homes by default). | Schema invariant; old rows have value. |
| **P4.S2** Replace `localeConfig.ar.currency = "SAR"` with `SDG`. Add `formatCurrency(amount, currency, locale)` util in `src/lib/format.ts` using `Intl.NumberFormat`. | Single helper used in every price-rendering site. |
| **P4.S3** Replace 40+ `toLocaleDateString()` / `toLocaleString()` calls with locale-aware helpers (`formatDate(date, locale)`, `formatNumber(n, locale)`). | Arabic users see Arabic-Indic digits where appropriate; spot-check screenshots. |
| **P4.S4** Add a platform-fee ledger model: `PlatformFee { id, sourceType, sourceId, amount, currency, createdAt }`. Capture the 12 % service fee per booking. | Admin can SUM by date range. |
| **P4.S5** Externalise service-fee % to `PlatformConfig` table (env-overridable). Admin can edit; change applies to new bookings only. | Admin settings page (A1) edits this. |
| **P4.S6** Multi-currency display: convert `SDG` to user's locale-currency at view time using a daily FX rate column (BoK reference). | Storage stays in `SDG`; UI shows `~ $25` next to `100,000 SDG`. |

**Dependencies.** P1, A1.

---

### Epic P5 — Host & operator payouts

**Goal.** Mkan moves money from guests to hosts/operators on a defined
schedule, net of platform fees, with a viewable ledger and audit trail.

| Story | Acceptance |
|---|---|
| **P5.S1** Add `Payout` model: `{id, recipientUserId, amount, currency, method, status, scheduledAt, paidAt, txnRef, createdAt}`. | Schema migration ships. |
| **P5.S2** Stripe Connect onboarding for international hosts; for Sudan operators offer manual bank transfer. | Hosts/operators have "Payout settings" in dashboard. |
| **P5.S3** Daily cron: aggregate `Booking.status=Completed` (or `confirmedAt + nights` past) per host, subtract platform fee, create `Payout` row in `Pending`. | Cron tested with seed data. |
| **P5.S4** Ops UI to mark a manual payout as `Paid` with TXN ref; logs to AuditLog. | Two-person rule (admin + finance role) before mark-paid. |
| **P5.S5** Host/operator ledger view: earnings, pending, paid, taxes withheld. | Per-month CSV export. |
| **P5.S6** Notification on payout completion (email + in-app). | Verified end-to-end. |

**Dependencies.** P1, P3, A1, A4.

---

## 5. Homes vertical epics

### Epic H1 — Host onboarding & publish

**Goal.** A host can complete the 14-step onboarding flow and **actually
publish** a listing visible in search.

| Story | Acceptance |
|---|---|
| **H1.S1** Add a Publish CTA on the final step (`/host/[id]/visibility` or `/host/[id]/finish-setup`) that calls `publishListing(id)`. | Listing flips to `isPublished:true`; appears in `/listings` immediately. |
| **H1.S2** Server-side validation gates publish: title (10–100 chars), description (≥ 50 chars), `pricePerNight > 0`, `propertyType`, `bedrooms ≥ 1`, `bathrooms ≥ 0.5`, location complete, `photoUrls.length ≥ 5`. | `publishListing` throws `ValidationError` per missing field, surfaced inline in UI. |
| **H1.S3** Each onboarding step's `enableNext()` is data-driven (e.g. photos step requires ≥ 5 uploaded). | "Next" disabled with tooltip until satisfied. |
| **H1.S4** Avoid orphan placeholder `Listing` rows on flow abandonment: defer DB insert until step 1 ("about-place") submission, not on `/host/overview` entry. | New row only appears after first real save. |
| **H1.S5** Implement DELETE on `/api/upload` to actually remove the file from ImageKit (currently TODO at `route.ts:143`). | Removed photos disappear from CDN; storage cost auditable. |
| **H1.S6** i18n every onboarding step (currently most are EN only). | Arabic spot-check passes; covered by `tests/e2e/i18n.spec.ts`. |
| **H1.S7** Add "Save and exit" to every step that surfaces a draft list at `/hosting/listings?tab=drafts`. | Resuming a draft re-enters the flow at the last step. |
| **H1.S8** Ensure no listing is publicly visible while `draft:true`. | `searchListings`, sitemap, and home carousels all filter `draft:false`. |

**Dependencies.** F1 (auth), F5 (deps), U1 (i18n).

---

### Epic H2 — Listing editor (post-publish)

**Goal.** Every field a host configures during onboarding is also editable
afterward, and the "Coming soon" stubs become real.

| Story | Acceptance |
|---|---|
| **H2.S1** Wire `/hosting/listings/editor/[id]/details/title/page.tsx` to load + save `title`. | Edit + reload shows update. |
| **H2.S2** Same for: pricing (`pricePerNight`, `cleaningFee`, `weeklyDiscount`, `monthlyDiscount`), number-of-guests (`guestCount`, `bedrooms`, `bathrooms`), property-type, accessibility flags. | All persisted; covered by integration test. |
| **H2.S3** Photo tour: replace mock rooms with a real "rooms" sub-model or use `Listing.photoUrls` with metadata array `{ url, room, caption }`. | Editing one room's photos persists. |
| **H2.S4** Co-hosts: add `Listing.coHosts UserId[]` relation; editor add/remove invites via email; co-host has scoped permissions. | Co-host can edit listing but not delete it. |
| **H2.S5** House rules: replace local-only state with persisted JSON column on `Listing`. | Rules render on listing detail. |
| **H2.S6** Cancellation policy: persist via P3.S2 above. | |
| **H2.S7** Travel tab: ship `directions`, `wifi-details`, `house-manual`, `check-in-method`, `checkout-instructions`, `interaction-preferences`, `guidebooks`. Add columns or a `ListingTravelInfo` related model. | Each step persists; included in booking confirmation email post-stay. |
| **H2.S8** Replace static availability stub with a real date picker + `BlockedDate` editor (CRUD). | Host can block dates from a calendar; reflected in search & booking. |
| **H2.S9** Seasonal pricing UI on top of `SeasonalPricing` model. | High-season pricing applies during overlap. |
| **H2.S10** iCal import/export per listing (Airbnb parity). | URL exported; pasted into Airbnb / Google Calendar shows blocks. |

**Dependencies.** H1, H9 (calendar), H6 (reviews tab).

---

### Epic H3 — Search, filters, discovery

**Goal.** One canonical search experience that respects published-only,
date-availability, and full filter parity.

| Story | Acceptance |
|---|---|
| **H3.S1** Delete `/[lang]/search/page.tsx` (legacy) and the static `search-map.png`; redirect to `/listings` (already half-redirected). | One search page only. |
| **H3.S2** Date-availability filter: search excludes listings with overlapping `Booking` (status Confirmed/Pending) or `BlockedDate`. | Test seeded scenario verifies. |
| **H3.S3** Real Mapbox map on `/listings` with markers, bounds-driven re-search, marker clustering. | Lazy-loaded; bundle delta < 80 KB on the route. |
| **H3.S4** Listing detail map shows real coordinates (replace static `assets/map.png` + Bordeaux text). | Marker centred on listing. |
| **H3.S5** Hero homepage search: connect to `/api/search/locations` debounced combobox; pass selected suggestion's structured city/country into `/listings`. | Typing "khartom" yields "Khartoum, Sudan" suggestion; click navigates with proper params. |
| **H3.S6** Server-side filter facets (price min/max, amenity counts, property type counts) computed from current query, returned with results. | Filter sliders bound by real data; cached 5 min. |
| **H3.S7** Save the user's recent searches in `localStorage`; show in the hero on focus. | Persists across reloads; click re-executes search. |
| **H3.S8** Replace home-content client-side filter with three server-component carousels (popular, recent, top-rated), each `unstable_cache(revalidate=300)`. | Page LCP improves; verified by Lighthouse run. |
| **H3.S9** Drop irrelevant categories ("Islands", "Yacht", "Beachfront", "Shipping container") for the Sudan market; replace with locally meaningful ones. | Curator-provided list ships. |

**Dependencies.** F5 (Mapbox dynamic), F6 (trigram indexes), U4 (perf).

---

### Epic H4 — Listing detail page (real data)

**Goal.** Every element on the listing detail page reflects the actual listing,
not a static demo.

| Story | Acceptance |
|---|---|
| **H4.S1** Replace `AirbnbReviews` static component with one driven by `getListingReviews()` + `getReviewSummary()`. Render rating distribution, sub-categories. | First page of reviews appears on detail; sort by recency / rating. |
| **H4.S2** Replace `HostedBy` Faisal placeholder with the real `listing.host` (image, name, joined date, response rate when computed). | Real hosts render. |
| **H4.S3** `isSuperhost` driven by computed metric (4.8+ avg rating, 90 %+ response, 1 %+ cancellation, ≥10 stays in last 365 d). Cron evaluates monthly. | Badge appears for qualifying hosts. |
| **H4.S4** `isSaved` from server: detail page receives `initialIsSaved` from `getTenantFavorites`. | Heart shows correct state on load. |
| **H4.S5** Wire `handleSave` to call `addFavoriteProperty` / `removeFavoriteProperty` (currently `console.log`). Optimistic UI + revalidate `/tenants/favorites`. | Heart click persists across reload. |
| **H4.S6** Photo gallery modal: full-screen, keyboard nav, swipe on mobile, deep-link via `?photo=N`. | Replaces TODO stub at `listing-details-client.tsx:45`. |
| **H4.S7** "Show all photos" route `/listings/[id]/photos` exists. | 404-free. |
| **H4.S8** Share button: web share API on mobile, copy-to-clipboard fallback, locale-aware tweet/wa intent. | Verified on iOS Safari + Android Chrome. |
| **H4.S9** "Report this listing" link → opens modal that creates a moderation report (A2). | Submit handler tested. |

**Dependencies.** H1, H6, H7, A2.

---

### Epic H5 — Booking flow (end-to-end)

**Goal.** Search → reserve → pay → receive ticket/receipt → check-in →
check-out → review request — all wired with real money and real emails.

| Story | Acceptance |
|---|---|
| **H5.S1** Reserve widget collects `specialRequests`. | `Booking.specialRequests` populated. |
| **H5.S2** Card payment via P1 (real Stripe Element). Cash kept as alternate. | Test booking ends in `Confirmed`. |
| **H5.S3** Booking confirmation email (guest + host) via N1, with iCal attachment. | Both inboxes receive. |
| **H5.S4** Reminder email 48 h before check-in (guest); 7 d before (host). | Cron tested. |
| **H5.S5** Auto-mark `Booking.status=Completed` 24 h after `checkOut`. | Existing cron extended. |
| **H5.S6** Trigger review-request email on Completion (post-stay). | One per booking, throttled. |
| **H5.S7** Cancellation enforcement (P3) + refund. | Refund email sent. |
| **H5.S8** Booking detail page (`/bookings/[id]`) shows real-time status timeline. | Each transition is a list item with timestamp. |
| **H5.S9** Receipt PDF via dynamic-imported `@react-pdf/renderer`. | Downloadable from booking detail. |

**Dependencies.** P1, P3, N1, U4.

---

### Epic H6 — Reviews & ratings

**Goal.** Real reviews, real ratings, real moderation.

| Story | Acceptance |
|---|---|
| **H6.S1** Post-stay review form on tenant trips page after Completion. | Submit creates `Review`; subratings collected. |
| **H6.S2** Listing detail review section uses `getListingReviews()` (paginated, sortable by recency / highest rating). | Replaces static sample. |
| **H6.S3** Host can reply via `addHostReply`; replies render under each review. | E2E test. |
| **H6.S4** Two-sided reviews: hosts review guests post-stay (`HostReview` model or extend `Review` with direction). | Both visible on respective profiles. |
| **H6.S5** Review reminder cron: 3 d, 7 d, 14 d after Completion. | Email throttled, opt-out respected. |
| **H6.S6** Moderation queue (A2) for flagged reviews. | Flagged review hidden until approved. |
| **H6.S7** Display rating distribution + sub-rating breakdown on detail page. | Server-aggregated, cached. |

**Dependencies.** H5, A2, N1.

---

### Epic H7 — Favorites / Wishlists

**Goal.** Persistent, multi-list favorites with sharing.

| Story | Acceptance |
|---|---|
| **H7.S1** Fix `handleSave` on detail page (covered in H4.S5). | |
| **H7.S2** Multi-list (collections): `Wishlist { id, userId, name, isPublic }` + `WishlistItem`. | Users can name lists; default "Saved". |
| **H7.S3** `/tenants/favorites` lists collections; clicking a collection lists its items. | Same map view available. |
| **H7.S4** Share a wishlist via tokenised URL. | Public wishlist viewable without auth. |
| **H7.S5** Dead `useFavorite.ts` hook removed; one canonical hook used. | grep returns one definition. |

**Dependencies.** H4.

---

### Epic H8 — Tenant dashboard

**Goal.** Guests have one home for trips, payments, applications,
saved listings, settings, messages, identity.

| Story | Acceptance |
|---|---|
| **H8.S1** `/tenants/trips` filters Stays/Transport/Past/Upcoming. Cancel/repeat buttons wired correctly per type. | Transport cancel uses transport action (currently incorrectly imports homes action). |
| **H8.S2** Receipts sub-tab listing all payments + downloadable PDF (via Stripe receipts or our own renderer). | One row per Payment / TransportPayment. |
| **H8.S3** `/tenants/payments` (lease flow) only renders if H10 keeps the lease vertical alive; otherwise removed. | Visible only when `User.role === TENANT && hasLeases`. |
| **H8.S4** Settings page: profile, password, locale, currency, notifications preferences, privacy, sessions, deactivate. | All persist. |
| **H8.S5** Messages tab linking to N4 inbox. | |
| **H8.S6** Identity tab linking to A3. | |
| **H8.S7** Replace RTK Query in `/tenants/residences` and `/tenants/applications` with server-action equivalents. | Pages render under H10 decision. |

**Dependencies.** H10, N4, A3, P1.

---

### Epic H9 — Host dashboard & calendar

**Goal.** Hosts can see all their bookings, reviews, calendar, earnings, and
inbox in one place.

| Story | Acceptance |
|---|---|
| **H9.S1** Today page shows real check-ins/check-outs/inquiries via `getHostBookings({ today })`. | Empty state when truly empty; otherwise list. |
| **H9.S2** Multi-listing calendar: monthly grid, drag-to-block, see bookings overlaid. | Block creates `BlockedDate`; visible in search results immediately. |
| **H9.S3** Bookings list page (`/hosting/bookings`): filter by listing, status, date range, paginated. | Action `getHostBookings` consumed. |
| **H9.S4** Earnings page: weekly/monthly chart, by listing, gross/net/fees breakdown. | CSV export. |
| **H9.S5** Reviews page: see all reviews across listings, reply, flag. | Aggregated rating per listing. |
| **H9.S6** Listing-level analytics: views, conversion (search → booking), price suggestion. | Tracked via U6. |
| **H9.S7** Host inbox (N4). | |
| **H9.S8** Replace RTK Query in `/managers/new-property` with server-action form (the schema is already correct in DB; just rebuild the form). | Submit creates a draft, redirects to onboarding flow. |

**Dependencies.** H1, H6, N4, P5, U6.

---

### Epic H10 — Reconcile Booking vs Application/Lease/Payment

**Goal.** Decide whether Mkan is a short-stay marketplace, a long-term rental
platform, or both — then collapse the data model accordingly.

| Story | Acceptance |
|---|---|
| **H10.S1** Product decision recorded in `docs/decisions/0001-rental-flow.md`. Three options: (a) short-stay only (drop Application/Lease/Payment), (b) long-term only (drop Booking/Review nightly flow), (c) both with a `listing.rentalType` enum. | One option chosen and signed off. |
| **H10.S2** Per chosen option, migrate or delete: routes, components, server actions, schema columns. | No dead code; tenant dashboard reflects chosen reality. |
| **H10.S3** If both: clear UI labels ("Stays" vs "Rentals"), separate flows, distinct prices (`pricePerNight` vs `monthlyRent`). | A/B navigability test. |

**Dependencies.** None (unblocks H2, H8).

---

## 6. Transport vertical epics

### Epic T1 — Operator onboarding & verification

**Goal.** Operators don't appear in search until an admin verifies them.

| Story | Acceptance |
|---|---|
| **T1.S1** Add `verifyTransportOffice(officeId, decision, reason?)` admin action. UI button on admin offices table. | Admin can verify/unverify; audited. |
| **T1.S2** Search and public office pages exclude `isVerified=false`. | Tested. |
| **T1.S3** Operator onboarding requires document upload (license PDF) before submitting for review. | Stored in ImageKit, linked to office row. |
| **T1.S4** Defer office row creation until the first onboarding form submission (currently created on entry to `/transport-host`). | Orphan rows eliminated. |
| **T1.S5** Operator notification when admin approves/denies (email + in-app). | E2E. |
| **T1.S6** Operator profile fields complete: bank, contact phone, support email, operating hours. | All editable. |
| **T1.S7** "Verified" badge surfaces on listings, search results, ticket. | Visible. |

**Dependencies.** A1, N1, A3, A4.

---

### Epic T2 — Fleet, routes, trip scheduling

**Goal.** Operators can manage a fleet of buses with custom seat layouts and
schedule trips in bulk.

| Story | Acceptance |
|---|---|
| **T2.S1** Per-bus seat-layout editor (the `Bus.seatLayout` JSON column already exists, ignored). UI grid editor; preview matches passenger view. | Saved layout used by `createTrip`'s seat-generation step. |
| **T2.S2** Per-bus photos via ImageKit. | Uploaded photos stored in `Bus.photoUrls`. |
| **T2.S3** Bulk trip creator: route + bus + days-of-week + departure times + price overrides + start/end date → generates N trips with one click. | One creator generates 84 trips for 4 weeks × 3 daily departures × 7 days. |
| **T2.S4** Recurring schedules: weekly templates a host can publish or unpublish (auto-creates next 4 weeks). | Tested with end-date. |
| **T2.S5** "Both directions" route shortcut. | Reverse route created in one step. |
| **T2.S6** Route enable/disable toggle (column exists). | UI surfaces it. |
| **T2.S7** Soft-delete trips/routes when bookings exist (avoid P2003 cascade errors). | UI handles gracefully. |
| **T2.S8** Trip update: changing `busId` regenerates seats safely (delete unbooked seats, refuse change if booked seats would be lost). | Tested. |
| **T2.S9** Cancel trip: notifies all booked passengers (currently TODO at `transport-actions.ts:1050`). | Email + SMS sent. |
| **T2.S10** Calendar view: monthly grid of all trips for the office; click to edit. | New page under `transport-host/[id]/calendar`. |
| **T2.S11** Fix TZ bug in `getOfficeTrips`, `getTrips`, `getMyBookings` — use `dayWindow(MARKET_TZ)` everywhere, not raw UTC. | Operator on Vercel sees correct dates. |
| **T2.S12** Cache invalidation: every mutation calls `revalidateTag(TAG_POPULAR_ROUTES, TAG_CITIES)`. | Stale-cache window closed. |

**Dependencies.** F6 (TZ helpers), N1, N2.

---

### Epic T3 — Trip search & seat selection

**Goal.** Search results render fast, seats reflect live availability, and
race conditions are eliminated.

| Story | Acceptance |
|---|---|
| **T3.S1** Replace embedded seat picker in `trips/[id]/page.tsx:343` with the standalone `SeatPicker` component. | One seat-picker codepath. |
| **T3.S2** Use `SELECT ... FOR UPDATE` (or Postgres advisory locks) in `createBooking` seat-status check. | Concurrent test — 100 simultaneous attempts on the same seat — only one succeeds. |
| **T3.S3** Live availability via SSE or 5-second polling — picker reflects another user's reservation within 10 s. | Test with two browsers. |
| **T3.S4** Search sort options expanded: `departure-desc`, `arrival-asc`, `seats-available-desc`, `popularity` (bookings/30 d). | UI surfaces them. |
| **T3.S5** Fuzzy matching on origin/destination text (`pg_trgm`). | "khartoom" returns Khartoum. |
| **T3.S6** Empty-state for "no trips on this date but trips on adjacent dates" — show alternative dates carousel. | Alt dates clickable. |
| **T3.S7** Tag-invalidation for popular-routes cache when trips change (currently dead). | Cache freshness ≤ 60 s. |

**Dependencies.** T2 (TZ fix), F6 (trigram).

---

### Epic T4 — Multi-passenger booking

**Goal.** A booking with N seats records N passengers with names and phones.

| Story | Acceptance |
|---|---|
| **T4.S1** Add `Passenger { id, transportBookingId, seatId, name, phone, idNumber? }` model. | Migration. |
| **T4.S2** Booking form accepts per-seat passenger details. | UI ergonomics: copy first to others, save addresses for repeat use. |
| **T4.S3** Boarding manifest export (CSV/PDF) lists all passengers for a trip. | Operator dashboard surfaces it (T6). |
| **T4.S4** Booking confirmation email includes per-passenger ticket. | Tested. |
| **T4.S5** Cancel a single passenger from a multi-passenger booking. | Refund prorated. |
| **T4.S6** ID-number field optional but required when operator opts in. | Per-office config. |

**Dependencies.** T2, P3, N1.

---

### Epic T5 — Ticket delivery (PDF, email, SMS, QR scan)

**Goal.** Passengers receive a real ticket; operators verify it at boarding.

| Story | Acceptance |
|---|---|
| **T5.S1** Ticket PDF via dynamic-imported `@react-pdf/renderer` (don't bundle into shared chunk). | `TransportBooking.ticketUrl` populated post-confirm. |
| **T5.S2** Email ticket on confirmation (Arabic + English templates). | Inbox screenshot test. |
| **T5.S3** SMS ticket link on confirmation. | Sudan SMS via N2. |
| **T5.S4** QR code is signed (HMAC) so offline operators can verify integrity. | Tampered QR rejected. |
| **T5.S5** Boarding scanner web UI for operators: camera scan, mark `BoardingStatus`. | One-tap mark-boarded; offline-cache last 100 bookings of the trip. |
| **T5.S6** API endpoint `/api/transport/ticket/verify` for the scanner. | Authed by operator role. |
| **T5.S7** Booking detail page in tenant dashboard re-renders ticket; "Add to Apple Wallet/Google Wallet" pkpass support. | Pkpass file generated. |

**Dependencies.** P1/P2 (confirmed bookings), N1, N2.

---

### Epic T6 — Operator dashboard & manifest

**Goal.** Operators have one place to monitor revenue, occupancy,
upcoming trips, manifests, and cancellations.

| Story | Acceptance |
|---|---|
| **T6.S1** Operator dashboard home: today's departures, today's revenue, occupancy %, pending bookings to confirm. | Backed by `getOfficeDashboardStats`. |
| **T6.S2** Bookings list: filterable, paginated, with single-click confirm/cancel. | Backed by `getOfficeBookings`. |
| **T6.S3** Per-trip manifest: passenger list with seat, contact, payment status, board status. | Print-friendly + PDF export. |
| **T6.S4** Revenue report: daily/weekly/monthly chart, CSV export. | Tested with seeded data. |
| **T6.S5** Occupancy report: by route, by trip-time bucket. | Helps schedule optimisation. |
| **T6.S6** Cancellation reasons captured and reported. | Required field on cancel. |
| **T6.S7** Notification preferences (email, SMS) for operator events. | Settings page. |

**Dependencies.** T1, T4, A4, U6.

---

## 7. Rides vertical (Phase 3)

### Epic R1 — Rides MVP

**Goal.** Ship the smallest functional ride-hailing flow: driver onboarding +
passenger request + dispatch + complete + pay + rate.

> Treat as **scope-controlled spike** in Phase 3. ~6–8 engineering weeks. The
> Audit shows ~5 % built (schema only, no actions, no UI).

| Story | Acceptance |
|---|---|
| **R1.S1** Driver onboarding `/[lang]/driver/onboard` — vehicle, license, photos, assembly point. | Admin verifies via T1-style flow. |
| **R1.S2** Passenger request page `/[lang]/rides/request` with Mapbox pickup/dropoff, vehicle-type select, fare estimate. | Creates `Ride` in `Requested`. |
| **R1.S3** `src/lib/ride-pricing.ts` — base + per-km + per-min × vehicle type, configurable. | Unit-tested. |
| **R1.S4** Dispatch action `requestRide` — finds nearest active+verified driver by haversine; FIFO queue. | Tested with seed data. |
| **R1.S5** Driver app `/[lang]/driver/dashboard` — incoming card, accept/start/complete actions; status transitions enforced. | E2E with two browsers. |
| **R1.S6** Passenger sees driver location every 30 s (polling, not WS for MVP). | Verified. |
| **R1.S7** On `Completed`, charge via P1/P2 (cash on arrival or MoMo/card). | Refund possible. |
| **R1.S8** Two-way rating: passenger rates driver, driver rates passenger. New `RideReview` model (or extend `Review` with `direction`). | `RideDriver.rating` updates. |
| **R1.S9** Cancellation handling for both sides; no-show timer. | Configurable cutoff. |

**Dependencies.** F1 (DRIVER role), T1 (verify pattern), P1, P2, N2.

---

## 8. Notifications & messaging

### Epic N1 — Transactional emails (i18n, branded)

**Goal.** Replace the 3-line inline-HTML mail layer with a real React Email
template system, branded, i18n-aware, and broadcasting all the events users
expect.

| Story | Acceptance |
|---|---|
| **N1.S1** Switch `from:` to verified `EMAIL_FROM` env (currently `onboarding@resend.dev`). | Real sender; reply-to set. |
| **N1.S2** React Email components in `src/emails/` for each event. Locale-aware (EN+AR), RTL-correct. | All templates rendered with locale snapshot tests. |
| **N1.S3** New event coverage: welcome (post-verify), booking-confirmed (guest+host), booking-cancelled (guest+host), booking-reminder, review-request, application-approved/denied, payment-receipt, payment-failed, payout-paid, password-changed, role-granted, suspension. | Each event sends. |
| **N1.S4** Add `EmailLog` table for sent emails with status from Resend webhook. | Bounce handling possible. |
| **N1.S5** Mail-helper accepts `locale: Locale` arg; auth flows pass it (also F1.S10). | Existing 3 emails localised. |
| **N1.S6** Unsubscribe / preferences link in every non-critical email. | Recipient lands on settings page. |
| **N1.S7** SPF/DKIM/DMARC configured for sending domain. | Verified in Resend dashboard. |

**Dependencies.** F4 (preferences page), F3 (logger).

---

### Epic N2 — SMS channel (Sudan rails)

**Goal.** Reach users where email doesn't.

| Story | Acceptance |
|---|---|
| **N2.S1** Pick provider (Africa's Talking, Twilio, MTN Sudan API). Add envs. | Documented. |
| **N2.S2** Send-helper with locale-aware templates (Arabic/English). | Snapshot. |
| **N2.S3** Events: 2FA OTP, booking confirmed (transport), boarding reminder, ride dispatch, payment confirmation. | Tested in sandbox. |
| **N2.S4** Throttling and cost cap; alert on over-budget day. | Cron sums daily spend. |
| **N2.S5** Opt-out via STOP keyword. | Provider hooks. |

**Dependencies.** P2 (mobile money confirms), T5 (ticket SMS).

---

### Epic N3 — In-app notifications

**Goal.** Bell icon with unread count, notification feed, granular prefs.

| Story | Acceptance |
|---|---|
| **N3.S1** `Notification { id, userId, type, title, body, link, data, readAt, createdAt }` + `NotificationPreference` model. | Migration. |
| **N3.S2** Header bell dropdown (currently dead import). | Polls every 30 s; unread count badge. |
| **N3.S3** `/notifications` page with full feed and filter. | Mark-read on click. |
| **N3.S4** Server actions emit notifications alongside emails (booking, review, payout, message, application, suspension). | One per event. |
| **N3.S5** Preferences UI: per channel (email, SMS, in-app) × per event type. | Persists. |

**Dependencies.** N1.

---

### Epic N4 — Host ↔ Guest messaging

**Goal.** A real inbox so users don't fall back to off-platform channels.

| Story | Acceptance |
|---|---|
| **N4.S1** `Conversation { id, participants[], listingId?, bookingId? }` + `Message { id, conversationId, senderId, body, attachments?, readAt }`. | Migration. |
| **N4.S2** `/inbox` page (tenant + host shared) with thread list + thread view. | Real-time via SSE or polling (post-MVP: Pusher/Ably). |
| **N4.S3** "Contact host" button on listing detail starts a conversation, scoped to that listing. | Pre-booking allowed. |
| **N4.S4** Auto-message on booking creation: greeting from system. | Tested. |
| **N4.S5** Message moderation: profanity / phone-leak detection (warn user). | Heuristic — flagged messages reviewed in A2. |
| **N4.S6** Notification on new message (in-app + email if offline > 5 min). | N3 hooked. |

**Dependencies.** N3, A2.

---

## 9. Admin & trust-and-safety

### Epic A1 — Admin operations console

**Goal.** Admins can run the platform from the UI.

| Story | Acceptance |
|---|---|
| **A1.S1** Replace `/admin/settings` "Coming soon" stub with: feature flags, platform fee %, FX reference, support email, social links, default cancellation policy. | All editable; persists in `PlatformConfig`. |
| **A1.S2** User detail page: profile, login history, sessions, bookings, listings, payouts, AuditLog. | Reachable from user table. |
| **A1.S3** Impersonation ("view as user") with 5-min limit, audited. | Banner shows impersonation; revert button. |
| **A1.S4** Force password reset / sign-out. | E2E. |
| **A1.S5** Verify office (T1.S1). | |
| **A1.S6** Refund panel — reverse a Stripe charge, mark refunded, log. | P3 hooks. |
| **A1.S7** Revenue & analytics dashboards (occupancy, GMV, take rate). | |

**Dependencies.** F1, F3, A4, P5.

---

### Epic A2 — Content moderation & reporting

| Story | Acceptance |
|---|---|
| **A2.S1** `Report { id, reporterId, targetType, targetId, reason, description, status, decision, decidedBy, createdAt }`. | Schema. |
| **A2.S2** "Report" CTA on listings, reviews, users, messages, transport offices. | Consistent modal. |
| **A2.S3** Moderation queue UI in admin — filter, assign, decide, audit. | Reviewer role can resolve; SUPER_ADMIN reviews appeals. |
| **A2.S4** Auto-flag rules (regex, ML later) for messages/reviews. | Configurable. |
| **A2.S5** Action effects: hide, soft-delete, suspend user, escalate. | Audited. |
| **A2.S6** Reporter notification on outcome. | N1/N3. |

**Dependencies.** N4, A1, A4.

---

### Epic A3 — Identity, phone & host verification

| Story | Acceptance |
|---|---|
| **A3.S1** Phone verification flow (SMS OTP) — required for hosts and drivers; optional for guests. | `User.phone`, `phoneVerified` columns added. |
| **A3.S2** ID upload + admin review (KYC-lite) for hosts/drivers/operators. | `User.idDocumentUrl`, `kycStatus`. |
| **A3.S3** Verified-badge displayed on profiles, listings, offices. | Visible. |
| **A3.S4** `verify-listing` page becomes real — checklist of host requirements + Publish gating. | Currently a non-functional mock. |
| **A3.S5** TOTP 2FA option (also F1.S4). | |

**Dependencies.** F1, A1, A2, N2.

---

### Epic A4 — Audit log persistence & viewer

| Story | Acceptance |
|---|---|
| **A4.S1** `AuditLog { id, actorId, action, targetType?, targetId?, ip, userAgent, requestId, metadata, createdAt }`. | Schema. |
| **A4.S2** All `logger.info("admin:…")` calls migrated to `audit(action, …)` writing to DB. | grep returns no string-only audit. |
| **A4.S3** Admin AuditLog viewer with filters (actor, action, date, target). | CSV export. |
| **A4.S4** Auth events (login, logout, 2FA, suspension, role change) audited. | |
| **A4.S5** Retention policy (7 y for financial events; 1 y otherwise). | Cron prunes. |

**Dependencies.** F1, F3.

---

## 10. UX, i18n, a11y, SEO, marketing

### Epic U1 — i18n & RTL parity sweep

| Story | Acceptance |
|---|---|
| **U1.S1** Translate all 20+ listing-editor pages (`/hosting/listings/editor/[id]/**`). | EN/AR snapshot tests. |
| **U1.S2** Replace inline `lang === "ar" ? …` ternaries with dictionary keys (listings/transport/bookings/admin pages). | grep returns near-zero remaining. |
| **U1.S3** Localise email + SMS templates (cross-link N1, N2). | |
| **U1.S4** Replace 40+ raw `toLocaleString()` / `toLocaleDateString()` with `formatDate(date, locale)` / `formatNumber(n, locale)` helpers (P4.S3). | |
| **U1.S5** Convert `text-left`/`text-right`/`ml-*`/`mr-*`/`pl-*`/`pr-*` to logical equivalents in admin tables (`*-tables.tsx`), filters, modals, mobile components. | grep clean. |
| **U1.S6** Carousel chevrons + calendar nav rotate in RTL (`ui/carousel.tsx`, `ui/calendar.tsx`). | Tested in AR. |
| **U1.S7** `AppSidebar` `fixed left-0` → `start-0`. | RTL screenshot. |
| **U1.S8** Phone-number input adopts a country-code component with E.164 validation; Arabic-digit normalisation. | Tested. |
| **U1.S9** og:locale `ar_SA` → `ar_SD`; `localeConfig.ar.currency` `SAR` → `SDG`. | |
| **U1.S10** Currency display unified (P4.S2). | |

**Dependencies.** N1, P4.

---

### Epic U2 — Accessibility (WCAG 2.1 AA)

| Story | Acceptance |
|---|---|
| **U2.S1** Tie every form control to a label (transport-search-widget critical). | axe pass. |
| **U2.S2** Aria-label every icon-only button (carousel arrows, image previews, share, save). | axe pass. |
| **U2.S3** Resolve nested `<main>` (e.g. `dev/credentials/page.tsx:56`). | One main per page. |
| **U2.S4** `debug-auth.tsx` rendered only in dev; `aria-hidden="true"` defensively. | |
| **U2.S5** Keyboard trap test for every modal (Radix passes by default; audit custom modals). | |
| **U2.S6** Color contrast audit; bump `text-muted-foreground` if AA fails. | Lighthouse a11y > 95. |
| **U2.S7** Focus-visible ring policy via Tailwind plugin; remove `focus:outline-none` without replacement. | |
| **U2.S8** Headings hierarchy: one h1 per page; verify in tests. | E2E test enumerates h1s. |
| **U2.S9** Skip-link present on all top-level layouts incl. root not-found and error. | |
| **U2.S10** Image alt-text audit; all decorative images `role="presentation"`. | |

**Dependencies.** U1, U5.

---

### Epic U3 — SEO, metadata & structured data

| Story | Acceptance |
|---|---|
| **U3.S1** Add `metadataBase` in `[lang]/layout.tsx`. | Canonical URLs absolute. |
| **U3.S2** Ship `/og-default.png` (1200×630). | Social shares show image. |
| **U3.S3** JSON-LD on listing detail (`LodgingBusiness`+`Offer`), trip detail (`Trip`+`Offer`), office detail (`LocalBusiness`), site-wide (`Organization`+`WebSite`). | Google Rich Results test passes. |
| **U3.S4** Slug column on `Listing` (`title-kebab`); URL `/listings/[id]-[slug]`; backwards-compatible redirect. | SEO-friendly URLs. |
| **U3.S5** `generateMetadata` on `/transport/trips/[id]`, `/transport/offices/[id]`. | |
| **U3.S6** Fix sitemap: drop `/login`/`/register`/auth routes; add transport trips + offices; cache via `unstable_cache`. | LH SEO > 95. |
| **U3.S7** `hreflang` alternates correct (already partially done). | |
| **U3.S8** Add `viewport` export. | |

**Dependencies.** F4 (canonical), U1.

---

### Epic U4 — Performance & caching

| Story | Acceptance |
|---|---|
| **U4.S1** Cache sitemap via `unstable_cache(revalidate=3600, tags=['sitemap'])`. Invalidate on listing/office publish. | Cold sitemap < 100 ms. |
| **U4.S2** Wrap home-page data fetches in `React.cache` and parallelise with `Promise.all`. | Home page p75 LCP < 2.5 s. |
| **U4.S3** Lazy-load Mapbox (F5.S5); lazy-load FilePond behind interaction. | Bundle delta < 80 KB. |
| **U4.S4** `unstable_cache` `searchTrips` facets keyed by `(originId, destinationId, date)` 60 s. | |
| **U4.S5** Tune Neon pool for serverless (`pgbouncer=true&connection_limit=1`). | Load test 50 concurrent users. |
| **U4.S6** Add Prisma read retry wrapper (F6.S7). | |
| **U4.S7** Add `next/dynamic` for ticket PDF, rich-text editor (if reintroduced), share-modal. | |
| **U4.S8** Image optimisation: `priority` + `sizes` on hero/listing-card LCP images; `placeholder="blur"` for gallery. | LCP improvements measured. |
| **U4.S9** Replace Unsplash hotlinks with ImageKit URLs + transforms (q-80, f-webp, w-… per breakpoint). | grep clean. |
| **U4.S10** Bundle analyzer in CI on main; fail PR if shared bundle > 200 KB gz. | Threshold enforced. |

**Dependencies.** F5, F6.

---

### Epic U5 — Marketing surface (landing, footer, help)

| Story | Acceptance |
|---|---|
| **U5.S1** Replace Western model imagery with culturally appropriate visuals for the Sudan/MENA market (commission new shots or use a vetted stock pack). | New assets ship. |
| **U5.S2** Drop irrelevant categories ("Islands", "Yacht", "Beachfront"). | Curated list. |
| **U5.S3** Footer: every `href="#"` either points to a real route or is removed. Update copyright year. | grep no `href="#"`. |
| **U5.S4** Help center: real articles in DB (`HelpArticle { slug, locale, title, body, category }`); search; tags; deep-link. | At least 30 articles seeded. |
| **U5.S5** Remove duplicate footer (`landing/footer.tsx` vs `template/footer/site-footer.tsx`). | One canonical. |
| **U5.S6** Trust signals on home: live counters (listings in Sudan, hosts onboarded), aggregate review rating. | Real values. |
| **U5.S7** Newsletter signup (Resend audience). | Tested. |
| **U5.S8** Press / partners section if applicable (placeholder until real). | |

**Dependencies.** N1.

---

### Epic U6 — Analytics & conversion instrumentation

| Story | Acceptance |
|---|---|
| **U6.S1** Pick provider (PostHog / Plausible / GA4). Add envs. | Env documented. |
| **U6.S2** Define event taxonomy: `search_started`, `listing_viewed`, `reserve_clicked`, `booking_created`, `payment_succeeded`, `host_published`, `signup_completed`. | Documented in `docs/events.md`. |
| **U6.S3** Cookie-consent gates analytics scripts (F4.S1). | |
| **U6.S4** Funnel dashboards in PostHog/GA: search → detail → booking → payment. | Visible. |
| **U6.S5** Web-vitals beacon to collector. | LCP/CLS/INP captured. |
| **U6.S6** Server-side event tracking (signup, booking) via secure ingest endpoint. | |

**Dependencies.** F4 (consent).

---

## 11. DevOps & quality

### Epic D1 — CI/CD pipeline, migrations, preview smokes

| Story | Acceptance |
|---|---|
| **D1.S1** Add `e2e` job to `ci.yml` (Playwright headless against a seeded preview/staging DB). | Required check on PR to main. |
| **D1.S2** Migrate Node 20 → 22.12 across CI + Docker. | `pnpm install` + tests green. |
| **D1.S3** Coverage upload (Codecov or artifact); fail PR if coverage drops > 1 %. | Trend visible. |
| **D1.S4** Strict lint: `pnpm lint:strict` in CI. Burndown of warnings tracked. | |
| **D1.S5** `prisma migrate deploy` runs on Vercel deploy — either via `vercel.json` build command or a deploy hook with safe ordering. | Prod migrations apply automatically. |
| **D1.S6** Preview deploy smoke: after Vercel preview is ready, run a thin Playwright suite (login, search, create-listing draft) against the preview URL. | Required check. |
| **D1.S7** Add `pnpm audit:ci` step (high severity blocks). | |
| **D1.S8** Lockfile drift check (`pnpm install --frozen-lockfile`). | Green. |
| **D1.S9** Bundle-size budget check (U4.S10). | |

**Dependencies.** D2, D3.

---

### Epic D2 — Test coverage & strategy

| Story | Acceptance |
|---|---|
| **D2.S1** Expand Vitest `include` to `src/app/**/route.ts`, `src/middleware`, `src/proxy.ts`, `src/components/**/*.tsx` (selected). | Coverage report covers them. |
| **D2.S2** Component tests for booking calendar, host onboarding wizard, FilePond uploader, transport seat picker, checkout. | Each ≥ 80 % branch. |
| **D2.S3** Integration tests (real DB via Testcontainers or a Neon branch) for booking, payment, transport flows. | Schema drift now fails CI. |
| **D2.S4** E2E suite expanded: full host onboarding flow, booking + payment, review submission, transport bulk-trip create, ticket scan. | Run on every PR. |
| **D2.S5** Test fixture / factory library (`@faker-js/faker`). | |
| **D2.S6** Flake quarantine: failing tests retry 2 ×; quarantined tests file. | |
| **D2.S7** Performance budget e2e (`tests/e2e/performance.spec.ts`) tightened to 4 s LCP / 200 ms INP. | |

**Dependencies.** D1.

---

### Epic D3 — Staging environment & rollback runbook

| Story | Acceptance |
|---|---|
| **D3.S1** Provision Vercel staging project + Neon branch DB + Upstash staging Redis. | Distinct env vars. |
| **D3.S2** Auto-deploy `develop` branch to staging; smoke test post-deploy. | Slack notification. |
| **D3.S3** Production deploy from `main`; protected branch with required checks. | |
| **D3.S4** Document rollback runbook (`docs/runbook-rollback.md`): instant Vercel rollback, DB rollback (Neon branch restore), webhook rotation, secret revocation. | |
| **D3.S5** Document incident response (`docs/runbook-incident.md`): severity matrix, PagerDuty rotation, comms templates, post-mortem flow. | |
| **D3.S6** "Gate" feature flags (`PlatformConfig.featureFlags`) for risky launches. | Verified. |

**Dependencies.** F3 (alerting), D1.

---

### Epic D4 — Backup, PITR & data retention

| Story | Acceptance |
|---|---|
| **D4.S1** Document Neon backup posture: branch restore tested monthly. | Restore drill report. |
| **D4.S2** Off-site backup of nightly `pg_dump` to S3 (cold storage). | |
| **D4.S3** Retention policies for `AuditLog`, `EmailLog`, `Notification` (configurable). | Cron prunes. |
| **D4.S4** Secrets rotation procedure (Stripe, Resend, OAuth, Neon, Upstash, ImageKit). | Quarterly drill. |

**Dependencies.** D3.

---

## 12. Cross-epic dependency graph (high-level)

```
F5 ──► (everything else)
F1 ─┬─► H1, T1, A1, A3
    └─► F2 ─┬─► every action mutation
            └─► F4 ─► U6
F3 ─┬─► D1 ─► D3 ─► D4
    └─► A4 ─► A1, A2
F6 ─► H3, T2, T3, U4
P1 ─┬─► H5, T5, P3, P4, P5
P2 ─┘
N1 ─┬─► H5, H6, T2, T5, A1
N2 ─┤
N3 ─┘
H10 ─► H2, H8 (decision unblocks both)
T4 ─► T5, T6
```

## 13. Phase sequencing (concrete)

### Phase 0 — Stabilize (weeks 1–2, ~2 engineer-weeks)

- F5 (build hygiene)
- F2.S1 (hard-fail Redis missing), F2.S4 (placeholder clamp)
- F1.S2 (OAuth suspension), F1.S5 (lastLogin), F1.S8 (env mismatch)
- F3.S2 (JSON logger), F3.S3 (request-id), F3.S5 (health split)
- F6.S1 (rotate Neon password), F6.S3 (seed scripts), F6.S4–S6 (indexes + pool)
- D1.S2 (Node 22), D1.S4 (lint:strict), D1.S5 (migrate deploy), D1.S6 (preview smoke)
- H10.S1 (rental-flow decision)

Outcome: stable production, no silent failures, no leaked secrets.

### Phase 1 — Soft launch readiness (weeks 3–8, Sudan-only beta with 50–100 hosts/operators)

- F1 remainder, F2.S2/S3/S5/S7, F3.S1/S4/S7/S8, F4 (cookie + GDPR + legal pages), F6 remainder
- P1 (Stripe), P2 (mobile money), P3 (refunds), P4 (currency)
- H1 (publish flow), H3 (search), H4 (real detail page), H5 (booking E2E), H6 (reviews), H7 (favorites fix)
- T1 (verify), T2 (bulk trip create + TZ + cache invalidate), T3 (race fix), T4 (multi-passenger), T5 (PDF + email)
- N1 (transactional emails), N2 (SMS for OTP + booking)
- A1 (admin operations), A4 (audit log)
- U1 (i18n sweep), U3.S6 (sitemap fix), U4.S1–S6 (perf wins)
- D2 (test coverage expansion), D3 (staging)

Outcome: pay real money, ship real bookings, ship real tickets, observe real errors.

### Phase 2 — Public launch (weeks 9–14)

- H2 (full editor), H8 (tenant dashboard polish), H9 (host calendar + bookings list)
- T6 (operator dashboard + manifest), T5 remainder (scanner, wallet)
- N3 (in-app), N4 (messaging)
- A2 (moderation), A3 (verification)
- U2 (a11y AA), U3 (full SEO + JSON-LD), U5 (marketing polish), U6 (analytics)

Outcome: feature parity with established marketplaces; ready for paid acquisition.

### Phase 3 — Growth (weeks 15+)

- R1 (rides MVP)
- P5 (payouts via Stripe Connect / manual ledger)
- P4.S6 (multi-currency display)
- Superhost / smart pricing / iCal sync (H2.S10)
- Advanced analytics
- Geographic expansion

---

## 14. Definition of "production-ready"

Mkan ships when **all of the following are true**:

1. **Money moves end-to-end** — Stripe + at least one Sudan rail (Bankak or MoMo) confirmed via real transactions on production with reconciled reports for 7 consecutive days.
2. **Hosts can publish + receive bookings**, hosts can see them, guests get confirmation emails + tickets, both sides can cancel within policy and trigger correct refunds.
3. **Operators are verified** before they appear in transport search; operators can run trips with bulk creation.
4. **Auth is hardened** — 2FA enforced for admins, suspension honored across providers, every mutation rate-limited, CSP enforced without `unsafe-inline`.
5. **Production is observable** — APM live, JSON logs with request-id, metrics dashboards for top 10 actions, uptime monitor with on-call rotation.
6. **Legal coverage** — cookie consent live, GDPR data-export/delete working, terms reviewed by counsel, LICENSE present.
7. **Test gates** — typecheck + lint:strict + unit + E2E on every PR; preview smoke; coverage stable >80 %.
8. **Performance** — homepage LCP < 2.5 s, listings p75 LCP < 3 s, search p95 latency < 1 s.
9. **i18n parity** — Arabic users go through every flow without seeing English (snapshot tests assert).
10. **Rollback runbook tested** — staging-to-prod failover practised at least once.

The "Top 10 launch blockers" list in §1.2 collapses to zero.

---

## 15. Maintenance

This document supersedes the bullet checklists in `MVP.md`,
`OPTIMIZATION_PLAN.md`, `ARCHITECTURE_AUDIT.md`, `IMPLEMENTATION_SUMMARY.md`,
and `plan.md`. Those files remain useful as historical artefacts; new work
should reference epic IDs from this file in commit messages and PR titles.

For each closed story, update the audit-state row in `§1.1` and tick the
acceptance row in this document. When all stories under an epic close, mark
the epic header `✓` and link the merged PRs.

When new epics emerge (post-launch growth, regulatory changes), append to the
catalog with a new prefix (e.g. `G.` for "Growth").
