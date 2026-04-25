# Mkan v1.0 — Architecture

> **Status**: Approved · **Owner**: Architect · **Last updated**: 2026-04-25

## 1. Stack

| Layer | Choice | Version | Why |
|---|---|---|---|
| Framework | Next.js | 16 (App Router) | Server Components, route groups, edge middleware |
| UI runtime | React | 19 | Concurrent features, Suspense |
| Styling | Tailwind CSS | 4 | OKLCH tokens, RTL via logical properties |
| UI primitives | shadcn/ui (Radix) | latest | Accessible primitives we own |
| ORM | Prisma | 7 | Type-safe DB access, migrations |
| DB | PostgreSQL (Neon) | 16 | Serverless, branching, free tier |
| Auth | NextAuth | v5 (beta) | OAuth + credentials + JWT, Prisma adapter |
| Forms | React Hook Form + Zod | 7 / 4 | Schema-first validation |
| Email | Resend | 3 | Transactional email |
| Images | ImageKit | latest | CDN + transforms |
| Rate limit | Upstash Redis | latest | Edge-friendly KV |
| Maps | Mapbox GL + Leaflet | 3 / 1 | Listing + assembly point maps |
| PDF | @react-pdf/renderer | 4 | Lease documents, e-tickets |
| Test (unit) | Vitest | 4 | jsdom env, v8 coverage |
| Test (E2E) | Playwright | 1.59 | chromium headless, GitHub reporter |
| Lint | ESLint flat | 9 | next/core-web-vitals + TS |
| Format | Prettier | latest | Consistency, pre-commit |
| Hooks | Lefthook | latest | Pre-commit / pre-push |

## 2. Top-level directory layout

```
mkan/
├── docs/                       # BMAD planning artifacts (this folder)
├── prisma/                     # schema + migrations
├── public/                     # static assets
├── scripts/                    # seed + maintenance (excluded from tsc)
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [lang]/             # locale-prefixed routes (en, ar)
│   │   │   ├── (auth)/         # auth group: /login, /join, /reset, /new-password, /new-verification, /error
│   │   │   ├── (dashboard)/    # dashboard group: tenants, managers, offices, dashboard
│   │   │   ├── (nondashboard)/ # marketing/landing variant
│   │   │   ├── (site)/         # public site
│   │   │   ├── admin/          # admin: homes, transport, bookings, payments, users
│   │   │   ├── bookings/       # guest booking confirmation + checkout
│   │   │   ├── help/           # help center
│   │   │   ├── host/           # 17-step home host onboarding
│   │   │   ├── hosting/        # post-publish home host dashboard + 26-page editor
│   │   │   ├── listings/       # listings index, detail, photos
│   │   │   ├── transport/      # transport passenger surface
│   │   │   ├── transport-host/ # transport operator onboarding + dashboard
│   │   │   └── verify-listing/ # listing verification flow
│   │   └── api/                # API routes (health, upload, listings, search, webhooks, cron)
│   ├── components/             # React components, organized by feature
│   ├── context/                # React contexts (transport-office, onboarding-validation)
│   ├── hooks/                  # custom hooks (auth-redirect, image-upload, locale)
│   ├── lib/                    # utilities + server actions
│   │   ├── actions/            # server actions (one file per domain)
│   │   ├── constants/          # app constants
│   │   ├── env.ts              # ZOD env validation (Story 1.2)
│   │   ├── db.ts               # prisma client
│   │   ├── mail.ts             # Resend wrapper
│   │   ├── imagekit.ts         # ImageKit helpers
│   │   ├── rate-limit.ts       # Upstash tiered limits
│   │   ├── sanitization.ts     # sanitize-html
│   │   └── schemas.ts          # shared Zod schemas
│   ├── middleware.ts           # locale + auth + rate-limit + CSRF + security headers
│   └── types/                  # ambient types
├── tests/
│   ├── actions/                # vitest unit tests for server actions
│   ├── components/             # vitest component tests (jsdom)
│   ├── e2e/                    # Playwright specs (homes + platform)
│   ├── transport/              # Playwright specs (transport)
│   ├── helpers/                # test factories (Story 3.8)
│   ├── lib/                    # vitest unit tests for utilities
│   └── setup.ts                # @testing-library/jest-dom/vitest
├── .github/workflows/ci.yml    # typecheck, lint, test, build, e2e
├── auth.ts, auth.config.ts     # NextAuth v5 config
├── eslint.config.mjs           # flat config
├── next.config.ts              # build config
├── playwright.config.ts        # E2E config
├── prisma.config.ts            # Prisma 7 config
├── tsconfig.json               # strict TS
└── vitest.config.ts            # unit test config
```

## 3. Routing model

- **Locale-first**: every non-API URL is prefixed with `/en/` or `/ar/`. Middleware detects from `Accept-Language` and redirects.
- **Route groups** organize layouts without affecting URL: `(auth)`, `(dashboard)`, `(nondashboard)`, `(site)`. Public homepage `/[lang]` lives outside groups.
- **Server Components by default**. `"use client"` only when state, refs, or browser APIs are needed.
- **Mirror pattern**: each `app/.../page.tsx` imports content from `src/components/<feature>/content.tsx` (server) and forms/UI from sibling components.

## 4. Data flow

### 4.1 Reads (Server Components)

```
Page (server) → server action OR direct Prisma query → DTO → Client Component (props)
```

DTOs are **derived** from server-action return values via `Awaited<ReturnType<typeof X>>` (Epic 2). No `as unknown as` casts. Prisma `Decimal` is mapped to `number` at the action boundary via `.toNumber()`.

### 4.2 Writes (Server Actions)

Every action follows the canonical shape:

```ts
"use server";
export async function createX(input: unknown) {
  // 1. AUTH
  const session = await auth();
  if (!session?.user) return { ok: false, error: "unauth" };
  
  // 2. VALIDATE
  const parsed = createXSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", issues: parsed.error.issues };
  
  // 3. AUTHORIZE
  if (!can(session.user, "create:X")) return { ok: false, error: "forbidden" };
  
  // 4. EXECUTE
  const x = await db.x.create({ data: parsed.data });
  
  // 5. REVALIDATE
  revalidatePath(`/[lang]/admin/x`);
  
  // 6. RETURN
  return { ok: true, data: x };
}
```

The return type is **always** `{ ok: true, data } | { ok: false, error, issues? }` — clients destructure on `.ok`.

### 4.3 Cache invalidation

- `revalidatePath(...)` after mutation.
- `unstable_cache` for hot reads (used in `search-actions.ts`).
- No client-side cache layer; React Server Components are the cache.

## 5. Auth model

- **NextAuth v5** with Prisma adapter, JWT session strategy.
- **Providers**: Google OAuth, Facebook OAuth, Credentials (email + password + bcrypt).
- **Verification**: email verification required for credential signups. `VerificationToken` model.
- **2FA**: optional, `TwoFactorToken` + `TwoFactorConfirmation` models.
- **Roles** (`UserRole` enum): `ADMIN`, `USER`, `MANAGER`, `TENANT`, `DRIVER`.
- **Session enrichment**: `auth.ts` extends JWT/session with `role`, `isTwoFactorEnabled`, `lastLogin`.
- **Middleware** (`src/middleware.ts`) enforces:
  - Locale prefix on all non-API routes.
  - Auth check for `/dashboard`, `/managers`, `/tenants`, `/hosting`, `/host`, `/transport-host`.
  - Rate limit per route tier (auth 10/min, upload 5/min, search 30/min, payment 5/min, general 20/min).
  - CSRF origin validation for non-GET.
  - CSP, HSTS, X-Frame-Options, etc. (production only).

## 6. Payment model (Epic 4 + Epic 10)

Six gateways supported. They split into two flows:

### 6.1 API gateway (Stripe)

```
Client clicks Pay → server action createStripePaymentIntent →
  Stripe API → returns clientSecret → client confirmCardPayment →
  Stripe webhook → server action handleStripeWebhook →
  marks Payment + Booking as PAID/CONFIRMED → email receipt
```

### 6.2 Reference-based gateway (Bankak, Cashi, mobile money, bank transfer)

```
Client selects gateway → sees payee account info + booking total →
  Client pays in their own banking/wallet app (off-platform) →
  Client returns, enters txn reference → server stores Payment with status PENDING_VERIFICATION →
  Admin opens /admin/payments queue → verifies reference matches receipt →
  marks Payment as PAID → Booking auto-confirms → email receipt
```

### 6.3 Cash on arrival / cash at check-in

```
Client selects cash → Booking marked CONFIRMED with payment status PENDING →
  Operator/host marks paid in person → admin or operator updates Payment to PAID
```

### 6.4 Refunds

- Stripe: `processRefund` calls Stripe API with `payment_intent` ID.
- Reference-based: admin processes refund out of band (bank app), then marks `Payment.refundedAt` in admin UI; emails refund confirmation.
- Cash: refund issued in person; admin records the action.

## 7. Multi-tenancy posture

**Single-tenant** in v1.0. The codebase has multi-tenant primitives (`schoolId` patterns from sibling project) intentionally not used here. Every record is scoped to its owner via `userId` (host owns Listing, operator owns TransportOffice). No cross-tenant data leakage at the schema level because there is no tenant boundary.

## 8. i18n

- **Source of truth**: `src/components/internationalization/{en.json,ar.json}` (parity-tested in `tests/components/i18n/`).
- **Server-only access**: `getDictionary()` in pages.
- **Client access**: import JSON directly OR via feature-scoped helper (`transport-dictionary.ts`).
- **No DB-side bilingual fields**: post-Epic 11.3, all human-readable text is in dictionaries; DB stores only IDs/slugs.
- **RTL**: Arabic uses logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) and `dir="rtl"` on `<html>`.

## 9. Testing model

```
Unit (vitest)      — utility functions, Zod schemas, server-action logic with mocked Prisma
Component (vitest) — React components with @testing-library/react, jsdom env
E2E (playwright)   — full user journeys against running dev server with seeded DB
```

- Unit tests live alongside their target type: `tests/actions/X-actions.test.ts`, `tests/lib/X.test.ts`, `tests/components/X/Y.test.tsx`.
- E2E tests group by surface: `tests/e2e/*.spec.ts` for homes & platform, `tests/transport/*.spec.ts` for transport.
- Test fixtures: `tests/helpers/factories.ts` (Story 3.8) — typed factory functions for User, Listing, Booking, TransportOffice, Trip.
- DB strategy for E2E: dedicated test schema seeded before run, torn down after.
- CI: typecheck → lint:strict → test (unit) → build → e2e (sharded).

## 10. CI/CD

`.github/workflows/ci.yml` (after Epic 1):

```yaml
name: CI
jobs:
  typecheck:    # node 22, prisma generate, tsc --noEmit
  lint:         # node 22, pnpm lint:strict (max-warnings 0)
  test-unit:    # node 22, pnpm test --reporter=verbose
  build:        # node 22, pnpm build (uses placeholder DATABASE_URL)
  e2e:          # node 22, playwright install, pnpm test:e2e (sharded 2 ways)
```

All jobs gate merging to `main`. Vercel auto-deploys `main` after merge. Epic 12 includes a manual smoke check + tag.

## 11. Observability

- **Logger**: structured JSON logger in `src/lib/logger.ts` (existing). All errors and significant events go through it.
- **No Sentry**: removed in earlier work due to Next 16 / Vercel ESM issues. `error.tsx` and `global-error.tsx` log via the structured logger.
- **Vercel logs**: production stdout/stderr → Vercel runtime logs (queryable via Vercel MCP).
- **Health check**: `/api/health` returns `{ ok: true, db: <ms> }` for uptime monitors.

## 12. Performance

- **LCP**: home / listing / transport home all targeted < 2.5s p75 via streaming Suspense + above-the-fold image priority.
- **CLS**: explicit `width`/`height` on all `<Image>`; font-display: swap.
- **INP**: heavy work pushed to server actions; client islands kept small.
- **DB**: Neon connection via `@prisma/adapter-neon` (serverless-safe). `wake-db.ts` warms connection in dev/build.
- **Cache**: `unstable_cache` for popular search queries; no per-user caching.

## 13. Security

- **Input validation**: Zod at every server-action boundary; `safeParse` returns structured errors.
- **Output sanitization**: `sanitize-html` for user rich text (replaces `isomorphic-dompurify`/jsdom).
- **CSRF**: middleware enforces `Origin` header on non-GET.
- **CSP**: production middleware sets strict CSP and HSTS.
- **Rate limit**: tiered by route (auth/upload/search/payment/general) via Upstash.
- **Secrets**: `src/lib/env.ts` Zod schema (Story 1.2) fails fast at boot if any required env is missing.
- **Cookies**: `httpOnly`, `secure` (prod), `sameSite=lax`, `__Host-` prefix where applicable.

## 14. Patterns to reuse (DO NOT recreate)

When implementing a new story, **first** look for these:

| Need | Existing utility | Where |
|---|---|---|
| Get current user | `await auth()` | `@/auth` |
| DB access | `db` | `@/lib/db` |
| Validate input | `<feature>Schema.safeParse()` | `@/lib/schemas.ts` or feature-local |
| Send email | `sendMail({...})` | `@/lib/mail` |
| Upload image | `uploadToImageKit()` | `@/lib/imagekit` |
| Rate limit | `rateLimit('payment')` | `@/lib/rate-limit` |
| Sanitize HTML | `sanitize(input)` | `@/lib/sanitization` |
| Format currency | `formatCurrency(n, locale)` | `@/lib/formatters` |
| Get dictionary | `getDictionary(lang)` | `@/components/internationalization/dictionaries` |
| Pagination | `pagination(...)` | `@/lib/pagination` |
| Logger | `logger.info/warn/error` | `@/lib/logger` |
| Onboarding state | `useListing()` (homes), `useTransportOffice()` (transport) | `@/components/host/use-listing`, `@/context/transport-office-context` |

## 15. Conventions

- **File naming**: `kebab-case.tsx`. Page: `page.tsx`. Layout: `layout.tsx`. Loading: `loading.tsx`. Error: `error.tsx`. Not-found: `not-found.tsx`.
- **Component naming**: `PascalCase` exports.
- **Server action filename**: `actions.ts` (one per feature folder) OR centralized in `src/lib/actions/<domain>-actions.ts`.
- **Form filename**: `form.tsx`. Uses RHF + Zod, controlled inputs.
- **Validation schema**: `validation.ts` per onboarding step, `schemas.ts` for shared.
- **Authorization**: `authorization.ts` per feature (RBAC checks).
- **Server vs client**: never put `"use client"` on a page; put it on the leaf component that needs it.
- **No barrel files** in `src/lib`; named exports only.
- **No prop drilling** more than 2 levels — fetch data closer to where it's used.

## 16. Brownfield notes

mkan was built before the BMAD method was adopted. The architecture above describes the **target** state at v1.0 ship time. Some of these items are still in flight (tracked in epic files):

- DTO derivation across server-action ↔ client boundary (Epic 2).
- Single-language source of truth — bilingual DB fields removed (Epic 11.3).
- Lease/application long-term flow fully wired (Epic 7).
- E2E in CI (Epic 3.1).
- Env validation (Story 1.2).

Until those land, the code may show transitional patterns (e.g., `as unknown as RouteData[]`). Do not propagate transitional patterns to new code; follow the target state.
