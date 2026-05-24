# Mkan Optimization Plan

*Audit-driven roadmap for turning the codebase into a productive, useful
rental marketplace. Prioritized by **impact × effort**. Every item is
scoped enough to be picked up as a single PR.*

Last updated: 2026-04-22 · Platform: Next.js 16.2.4, React 19.2.5,
Prisma 6.9, Tailwind 4, NextAuth 5 (beta), Postgres (Neon).

---

## 0. What the audit found

### Bugs fixed in this pass
1. **Middleware disabled** — `middleware.ts` lived at project root but the
   project uses `src/`, and Next 16 renamed the convention to `proxy`.
   Consequence: **every request bypassed auth gating and security
   headers**. Moved to `src/proxy.ts`, renamed export, and verified with
   an `X-Mw-Ran` sanity header and curl probes of `/en/hosting/listings`
   (now 307 → /login) and `/en/nonexistent` (now 404, not silent redirect).
2. **Register form missing `name` input** — `RegisterSchema` requires `name`
   but `join/form.tsx` only collected email+password. Every registration
   silently returned `{ error: "Invalid fields!" }`. Fixed.
3. **Sanitization build break** — `src/lib/sanitization.ts` had a local
   `sanitize` default export colliding with the imported `sanitize` from
   `sanitize-html`. Turbopack refused to compile. Renamed import to
   `sanitizeHtmlLib`.
4. **Login action crash on DB failure** — `getUserByEmail` threw when
   Prisma couldn't reach Postgres, leaking an unhandled rejection into
   React's `startTransition` and producing a blank-state form. Wrapped in
   try/catch with a user-facing generic error.
5. **Missing `<main>` landmark** — root `[lang]/layout.tsx` never rendered
   one, so the "Skip to main content" link pointed at a nonexistent
   anchor. Added `<main id="main-content">` once in the root layout;
   demoted nested mains in route-group layouts to `<section>` to avoid
   nested-landmark a11y violations.
6. **Hardcoded English in help components** — `help/article.tsx`,
   `help/guides.tsx`, `help/explore-more.tsx`, `help/header.tsx` had
   literal strings. Wired to `useDictionary()` with EN/AR copy.
7. **Cross-origin CSRF confirmed** — NextAuth's CSRF guard redirects the
   POST to `/login?error=MissingCSRF` (good), but origin validation in
   the proxy is absent. See Section 3.3.
8. **Tests misaligned with Next 16** — `tests/lib/middleware.test.ts`
   imported `../../middleware`; action tests' `next/cache` mock was
   missing `updateTag`. Fixed.

### Known environment issues (not code)
- Postgres pooler unreachable via Prisma TCP from the local dev machine
  even though MCP queries work (TLS handshake blocked at network layer).
  **DB-dependent tests skip cleanly** rather than fail.

---

## 1. Reliability & correctness (P0 — ship-blockers)

### 1.1 Add a `proxy.test.ts` that asserts every route class
**Why** — the original middleware was silently misplaced for an unknown
amount of time. Without a test that runs the real proxy against each
route class (public, auth, protected, unknown), the next rename will
break silently again.

**How**
- Port `tests/lib/middleware.test.ts` to exercise the proxy's observable
  behavior: given path X and cookie Y, assert HTTP status + `location`
  header.
- Add an integration check that `X-Mw-Ran: 1` shows up on every HTML
  response in production.

### 1.2 Warm Neon compute before the dev server boots
**Why** — cold Neon compute takes 5–10s to respond to the first query.
That delay cascades into sitemap compile (10s+), home page first paint
(5s), and test flakiness.

**How** — add a `predev` hook that fires a single `SELECT 1` through
Prisma before Turbopack starts. Same script is useful in CI as a
readiness gate.

```json
// package.json
"predev": "tsx scripts/wake-db.ts",
"prebuild": "tsx scripts/wake-db.ts"
```

Script: `scripts/wake-db.ts` → 1 query, 1s deadline, logs elapsed, exits
0 even on failure so it never blocks dev start.

### 1.3 Replace Prisma direct-TCP with `@neondatabase/serverless`
**Why** — Prisma's Rust engine uses TLS-over-TCP to Neon's PG port,
which some networks/proxies (including the one this audit ran from)
refuse. Neon's Serverless driver tunnels Postgres over HTTPS — works
from any network, cold-start is ~300ms faster.

**How** — install `@neondatabase/serverless` + `@prisma/adapter-neon`,
swap `new PrismaClient()` for the adapter-wrapped client in `src/lib/db.ts`.
Gate behind `DATABASE_URL_ADAPTER === "neon"` so local Postgres still
works.

### 1.4 Make `/api/health` usable for CI gates
**Why** — today the endpoint returns `{ status: "unhealthy" }` with
HTTP 503 if Redis is missing. Redis is optional in dev → CI fails for a
non-issue. Redis is required in prod → health should reflect that.

**How** — split the response shape:
```ts
{ healthy: boolean, ready: boolean, checks: {...} }
```
`healthy` = only hard deps (DB, env). `ready` = includes soft deps
(Redis, ImageKit). Deployment gates key off `healthy`; dashboards off
`ready`.

### 1.5 Remove `ignoreDuringBuilds` + `ignoreBuildErrors`
**Why** — `next.config.ts` currently ships code that doesn't typecheck
or lint. The MVP.md checklist flags this. Every real bug found in this
audit was already visible to `tsc`.

**How**
1. Run `tsc --noEmit` → list errors (CLAUDE.md says `scripts/seed-*.ts`
   and two transport pages are known-broken).
2. Fix or exclude those specific files via `tsconfig.json` `exclude`.
3. Remove the two flags from `next.config.ts`.
4. Add `pnpm lint && pnpm typecheck` to the `prebuild` chain.

---

## 2. Performance (P1 — user-visible)

### 2.1 Cache sitemap + robots aggressively
**Why** — `/sitemap.xml` currently takes 10s because it runs two Prisma
queries per request. Search engines re-hit it often. `robots.txt` is
dynamic for no reason.

**How**
```ts
// src/app/sitemap.ts
export const revalidate = 3600; // 1h ISR
```
Plus: wrap the DB calls in a cached function:
```ts
const getListingsForSitemap = unstable_cache(
  () => db.listing.findMany({ where: { isPublished: true }, select: {...} }),
  ["sitemap-listings"],
  { revalidate: 3600, tags: ["sitemap"] },
);
```
Then call `revalidateTag("sitemap")` from listing publish/unpublish
actions. Sub-100ms response, no DB hit on cold requests.

### 2.2 Parallelize home-page data fetches
**Why** — `src/app/[lang]/page.tsx` and home-content loaders fetch 3+
datasets sequentially (popular, recent, top-rated) via separate server
actions, each opening its own query. On a cold cache, that's ~300ms of
serial DB round-trips visible to the user.

**How** — combine into a single `Promise.all()` inside the server
component, pass results down as props. Suspense boundaries around each
carousel so slow sections don't block the fast ones.

### 2.3 Images: drop Unsplash in favor of ImageKit-proxied URLs
**Why** — the codebase still hotlinks `images.unsplash.com` in several
places (help/guides, home fallbacks). Each hit adds 100–300ms vs a
CDN-cached variant. ImageKit is already configured.

**How** — helper `toImageKitUrl(src: string)` that rewrites Unsplash
URLs through the existing `ik.imagekit.io` endpoint with transforms
(`tr=w-400,h-300,q-80,f-webp`). Drop-in replacement in every place we
hardcode an Unsplash URL.

### 2.4 Bundle audit + tree-shake heavies
**Why** — `optimizePackageImports` is already enabled for lucide-react,
framer-motion, radix-ui, etc. But a full bundle-analyzer report
(`pnpm analyze`) shows `mapbox-gl` (~300KB gz), `@tiptap` (~180KB gz),
`@react-pdf/renderer` (~220KB gz) in the shared client bundle even
though they're used on 1–2 routes.

**How**
- Lazy-load `mapbox-gl` only on `/listings/[id]` (map view) and
  `/transport/search` (route picker).
- Dynamic-import `@tiptap` only when the rich-text editor opens.
- Gate `@react-pdf/renderer` behind `if (action === 'download')` on the
  ticket route.
- Target: shared bundle under 160KB gz.

### 2.5 Add a shared server-component listings cache
**Why** — `getListings` is invoked from home, listings page, sitemap,
and `/api/listings/published` within one request cycle. Each call hits
Postgres.

**How** — wrap in `React.cache()`:
```ts
import { cache } from "react";
export const getListings = cache(async (filters) => { ... });
```
Zero code changes at call sites; deduplicates within a single request.
For cross-request dedup, add `unstable_cache` with a 60s revalidate.

### 2.6 Lift the Neon connection pool limits
**Why** — `DATABASE_CONNECTION_LIMIT=10` (per container) × N serverless
invocations × cold start rebuilds = connection storms on Neon. Neon's
pooler accepts 100 connections, but pgbouncer mode allows far more.

**How** — set `?pgbouncer=true&connection_limit=1&pool_timeout=0` on
production `DATABASE_URL` and use Neon's pooled endpoint for reads. Keep
a separate direct connection for migrations.

---

## 3. Security (P1 — compliance)

### 3.1 Move CSP from proxy-production-only to always-on
**Why** — CSP today only applies in production. Dev has none. That's
fine for debugging but it means XSS bugs can ship from dev to prod
without anyone noticing. Also, `'unsafe-inline'` + `'unsafe-eval'` in
the prod CSP defeats ~80% of the protection.

**How**
- Add CSP in dev too, with `Content-Security-Policy-Report-Only` so it
  logs but doesn't break.
- Adopt nonces (already have `generateCSPNonce()` in sanitization.ts) —
  inject per-request via layout, remove `'unsafe-inline'`.
- Remove `'unsafe-eval'` — needed only for specific deps; audit and
  replace or scope via CSP source directives.

### 3.2 Origin + CSRF enforcement for state-changing server actions
**Why** — the proxy doesn't validate `Origin` on POSTs to `/api/*`.
NextAuth protects its own endpoints, but every custom server action
relies on Next's built-in rotating CSRF token, which is only as strong
as same-origin policy in the browser.

**How** — add an Origin check in the proxy for `POST/PUT/DELETE/PATCH`:
```ts
const origin = request.headers.get("origin");
const host = request.headers.get("host");
if (origin && !origin.endsWith(host)) return new Response("Forbidden", { status: 403 });
```

### 3.3 Rate-limit every POST server action
**Why** — only `/api/search/locations`, `/api/upload`, and
`/api/auth/*` go through `rateLimitWithFallback`. Server actions like
`createBooking`, `register`, `login`, `createApplication`, and
`processPayment` have no rate limits — direct DoS vector for credential
stuffing and enumeration.

**How** — add a `withRateLimit(action, opts)` higher-order wrapper in
`src/lib/rate-limit.ts`. Wrap every `"use server"` export that mutates.
Tier matrix already exists (auth: 10/min, upload: 5/min, etc.).

### 3.4 Run `pnpm audit` and patch high-severity advisories in CI
**Why** — beta NextAuth 5 (`5.0.0-beta.31`) + old jsdom footprint (pinned
to ^27 to work around Vercel ESM crash) = high chance of a known CVE
slipping through. `pnpm audit --audit-level=high` in CI catches these
before release.

**How** — add `audit:ci` script:
```json
"audit:ci": "pnpm audit --audit-level=high --prod || exit 1"
```
Gate CI on it for main-branch merges only (allow dev branches to stay
green while fixes land).

### 3.5 Restrict `/api/placeholder/[...dimensions]` dimensions
**Why** — the route accepts arbitrary dimensions. A request for
`/api/placeholder/100000x100000` will OOM the server or at minimum
burn CPU. Easy DoS.

**How** — validate `width, height ≤ 4096`, reject otherwise with 400.

### 3.6 Audit sensitive logs
**Why** — `login/action.ts` now logs `getUserByEmail failed` (my fix).
Good. But `register/action.ts` and several transport actions log full
`err` objects, which can include `values` (plaintext password) and
stack traces with env fragments.

**How** — replace every `console.error(err)` with
`logger.error("description", { code: err.code, message: err.message })`.
Already have `src/lib/logger.ts` — enforce via lint rule
`no-console` for `/src/lib/actions/**`.

---

## 4. UX & feature completeness (P2 — productization)

### 4.1 Replace the DB down-state with a meaningful fallback
**Why** — with DB down today, `/en` shows "Recently added / Top rated"
headers and empty carousels. A user can't tell whether there's no data
or a broken service.

**How** — when `getPublishedListings()` returns `[]` AND the DB health
check is red, render an empty-state card: "We're having trouble loading
listings. Please try again in a moment." with a `retry` button. Keep
the rest of the page (hero, filters, footer) fully functional.

### 4.2 Wire the applicant → lease → payment flow end-to-end
**Why** — today you can create an Application but there's no UI to
approve one into a Lease, and Payment creation has no trigger. The
`Application.leaseId` FK is orphaned in practice.

**How** — a single page `/managers/applications/[id]` with:
- Approve → creates `Lease` row, updates `Application.status = Approved`,
  sends notification via Resend (existing integration).
- Reject → status = `Denied`, notification.
- Auto-generate first month's Payment row as `Pending` on approval.
Every transition is a single server action behind
`requireRole(lang, ["MANAGER", "ADMIN"])`.

### 4.3 Add a search-bar on the homepage that actually does something
**Why** — the hero has a location/date/guests input but it just navigates
to `/listings?location=...`. It doesn't use the existing location
autocomplete. Users type "khartom" and get zero results because
`location` is matched on exact string.

**How**
- Connect the input to `/api/search/locations` with a debounced combobox.
- Pass the selected suggestion's `city` + `country` as separate query
  params; `searchListings` already accepts those.
- Add a "recent searches" row under the input using `localStorage`.

### 4.4 Persist the user's locale preference beyond the cookie
**Why** — switching from `/en` to `/ar` sets `NEXT_LOCALE` cookie, but
it gets cleared on private browsing. Users who are signed in should
have locale stored on their `User` row.

**How**
- Add `locale String @default("en")` to the `User` model.
- Middleware reads session → prefers user.locale > cookie > accept-
  language.
- Settings page: language picker writes to `User.locale` via a server
  action.

### 4.5 Fill in the transport trip search → booking loop
**Why** — search renders but with DB seeded trips, clicking a card
doesn't always navigate to `/transport/booking/[id]`. Several spec
tests skip because the UI mounts but the search action returns no
results even with seeded data (likely a `startDate` boundary bug
flagged in `memory/MEMORY.md`).

**How**
- Reproduce locally with DB reachable: seed via `pnpm seed:transport`,
  search for a known trip, verify date-window math matches.
- The date-mutation note in memory says to use `new Date(date)` copies
  inside Prisma queries — search `src/lib/actions/transport-actions.ts`
  for `.setHours(` and fix every occurrence.

### 4.6 Real Stripe integration, not placeholder
**Why** — `createStripePaymentIntent` and `handleStripeWebhook` exist
as signatures but the route they belong to isn't wired up. Users
can't actually pay.

**How**
- Add `/api/webhooks/stripe/route.ts` that verifies signature,
  dispatches to `handleStripeWebhook`.
- Client-side: use `@stripe/react-stripe-js` on the booking checkout
  page (not yet in deps — add).
- Move `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` into env validation
  in `src/lib/env-check.ts`.

### 4.7 Favorites are client-only — make them persist
**Why** — `addFavoriteProperty` / `removeFavoriteProperty` exist in
`user-actions.ts` but the listing cards don't call them; the heart icon
is likely local state.

**How** — audit `components/site/property/*` for the heart-icon click.
Rewire to call the server action optimistically and revalidate
`tenants/favorites` tag.

---

## 5. Observability (P2)

### 5.1 Replace the empty Sentry hook with real error reporting
**Why** — commit history shows Sentry was removed because it crashed
Vercel (`require() of ES Module`). The MVP.md still wants error
tracking.

**How** — use Next 16's `instrumentation.ts` pattern (the recommended
post-removal approach documented inline in `next.config.ts`):
```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('@sentry/node').then(s => s.init({...}));
  }
}
```
Externalize the ESM deps via `serverExternalPackages` (already in
config). Alternative: use Axiom or BetterStack — both have Next-native
adapters that don't pull the OpenTelemetry ESM chain.

### 5.2 Add request-id correlation to every log line
**Why** — when users report bugs, `logger.error` lines don't link to
the request that generated them. Debugging = scan timestamps.

**How** — middleware generates a ULID, sets it in `X-Request-Id`, stores
in `AsyncLocalStorage` so the logger auto-stamps every line.

### 5.3 Emit metrics for every server action
**Why** — today we can see HTTP 5xx but nothing about latency, error
rate, or throughput per action. Hard to spot regressions like "booking
creation p95 moved from 400ms to 2s."

**How** — wrap each `"use server"` export with a thin decorator that
emits to Upstash (already a dep for rate-limit) or a stats endpoint:
action name, duration, outcome, user role.

---

## 6. Developer experience (P3)

### 6.1 Speed up the test suite
- Vitest is 8s for 823 tests — fine, but transport Playwright specs
  take 6m. Profile which ones are spending time in network waits vs.
  actual assertions; convert slow flows to `beforeAll` + shared state.
- Add `--shard` to the Playwright config so CI parallelizes across 2–4
  workers without brittle serial ordering.

### 6.2 Seed script for test users + sample DB
- `scripts/seed-test-user.ts` exists but needs matching `seed:listings`,
  `seed:transport` that actually succeed (memory notes they have Prisma
  type mismatches). Fix those so `pnpm seed:all` gives a working local.

### 6.3 Drop route-group layout duplication
- `(dashboard)/layout.tsx` and `(nondashboard)/layout.tsx` both import
  `SiteFooter` + wrap children similarly. Factor a `<PageLayout>` atom
  and compose, so a change to footer layout is one file edit.

### 6.4 Prisma schema hygiene
- `Listing.title: String?` — title shouldn't be nullable for a
  published property. Add a `zod.refine` at the action level for now,
  migration later.
- `AssemblyPoint.nameAr` — single Arabic-only field. Violates the
  "single-language storage" rule in global CLAUDE.md (content stored
  with a `lang` tag, translated on-demand). Move to the pattern.
- 27 models, 10+ enums. Audit indexes: `Booking` already has 6
  composite indexes; `Listing` has fewer. Add `(isPublished, createdAt)`
  and `(isPublished, pricePerNight)` indexes for common search paths.

---

## 7. Prioritized quarter

**Week 1–2 (P0s)**
- 0.1–0.8 (all already done in this audit)
- 1.1 proxy tests
- 1.2 predev wake
- 1.4 health endpoint split
- 1.5 remove build bypass flags

**Week 3–4 (P1 perf + sec)**
- 2.1 cache sitemap
- 2.2 parallelize home fetches
- 2.4 bundle audit + lazy-load mapbox/tiptap/pdf
- 3.1 CSP nonces
- 3.3 rate-limit all server actions
- 3.6 strip sensitive logs

**Month 2 (P2 productization)**
- 4.2 approve→lease→payment flow
- 4.3 working search autocomplete
- 4.6 Stripe integration
- 4.7 favorites persistence

**Ongoing**
- 5.1 Sentry via instrumentation
- 5.3 server-action metrics
- 6.2 seed scripts fix
- 1.3 evaluate Neon serverless driver

---

## 8. Success criteria

Ship to users when:
- **All 134 E2E + 823 unit tests green in CI** against a reachable DB
  (today: 134 pass, 28 skip pending DB reachability).
- `pnpm lint && pnpm typecheck` passes with `ignoreBuildErrors: false`.
- Homepage LCP < 2.5s, CLS < 0.1, INP < 200ms on a cold 4G profile
  against the Khartoum region.
- Sentry (or equivalent) reporting a 0% 5xx rate for 24h on staging.
- Booking flow: search → seat pick → checkout → ticket — end-to-end
  without a single DB-down state.
- Arabic renders without any of the tokens in `tests/e2e/i18n.spec.ts::EN_LEAKS`
  showing up on any audited page.
