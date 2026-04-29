# Mkan

Mkan is a bilingual (Arabic/English, RTL/LTR) rental + transport marketplace operating primarily in Sudan. Hosts list short-term stays and long-term rentals; transport operators sell intercity bus seats. Guests browse, book, pay (Stripe + Sudan mobile money + bank transfer), review, and cancel under a configurable refund policy.

> Live: https://mkan.databayt.org
> Architecture: see [`docs/booking-vs-application.md`](docs/booking-vs-application.md) for the dual-track rental flow.

---

## Stack

| Layer | Choice |
|------|--------|
| Framework | Next.js 16 (App Router, Turbopack dev, Webpack build) |
| UI | React 19, Tailwind 4, shadcn/ui, Radix primitives |
| Auth | Auth.js v5 (JWT + 2FA + Google/Facebook OAuth) |
| Database | Postgres on Neon (serverless), Prisma 7 ORM |
| Payments | Stripe (cards + webhooks) + per-office Sudan bank/MoMo fields |
| Storage | ImageKit |
| Observability | Vercel Analytics + Speed Insights (consent-gated) |
| i18n | `[lang]` segment + monolithic dictionaries (en.json + ar.json) |
| Tests | Vitest (unit) + Playwright (E2E) |

---

## Quick start

```bash
pnpm install
cp .env.example .env  # then fill in DATABASE_URL, AUTH_SECRET, Stripe keys
pnpm dev              # auto-runs `wake-db` then `next dev` on port 3000
```

Open http://localhost:3000 — cookieless visitors land on `/ar`, English visitors on `/en`.

### Required env (minimum to boot)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | Neon Postgres connection string |
| `AUTH_SECRET` | Auth.js JWT signing key (32+ bytes) |
| `NEXTAUTH_URL` | Your origin (`http://localhost:3000` in dev) |

### Optional env (feature-gated)

| Var | Feature |
|-----|---------|
| `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Card payments |
| `RESEND_API_KEY` + `EMAIL_FROM` | Transactional email |
| `IMAGEKIT_PRIVATE_KEY` + `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` + `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | Image uploads |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Rate limit + cache |
| `GITHUB_PERSONAL_ACCESS_TOKEN` + `GITHUB_REPO` | In-app "Report an issue" widget |
| `DATABASE_URL_ADAPTER` | `neon` to force the serverless driver, otherwise auto-detects from URL |

---

## Scripts

```bash
pnpm dev              # next dev --turbopack -p 3000
pnpm build            # prisma generate + wake-db + next build
pnpm start            # next start
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint .
pnpm test             # vitest run
pnpm test:e2e         # playwright test
pnpm i18n:check       # audit inline ternaries / raw date formatters
```

Seeders:
```bash
pnpm seed             # full seed
pnpm seed:admin       # one super admin user
pnpm seed:listings    # sample listings
pnpm seed:transport   # sample bus operators + routes
```

---

## Code map

```
src/app/[lang]/             # locale-prefixed routes (en + ar)
  ├── (auth)/               # login / join / reset
  ├── (dashboard)/          # tenants / managers / offices
  ├── admin/                # super-admin surface
  ├── hosting/              # short-term host dashboard
  ├── host/[id]/            # short-term host onboarding wizard
  ├── transport/            # public transport browsing + booking
  └── transport-host/[id]/  # transport-host onboarding
src/app/api/                # /api/health, webhooks, cron, auth
src/components/             # ui/, atom/, listings/, transport/, internationalization/
src/lib/actions/            # server actions (booking, payment, transport, admin, ...)
src/lib/refund.ts           # pure cancellation policy calculator (unit-tested)
src/lib/i18n/               # date-locale + formatters
prisma/schema.prisma        # 28 models incl. PlatformSetting + WebhookEvent
tests/                      # vitest unit + playwright e2e
docs/                       # canonical specs incl. booking-vs-application
```

---

## Deploy

Vercel: connect the GitHub repo, set the env above, and pushes to `main` ship to production.

The `predev` and `build` scripts auto-run `wake-db` so a cold Neon compute is warmed before Next compiles. Production should set `DATABASE_URL_ADAPTER=neon` (auto-detected when the URL ends in `.neon.tech`).

---

## Contributing

Read [CONTRIBUTING.md](/CONTRIBUTING.md). Workflow:
1. Open an issue first.
2. Branch with the `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/` prefix.
3. One PR per phase. Squash-merge with `Closes #N`.

---

## License

Licensed under the [MIT license](LICENSE).
