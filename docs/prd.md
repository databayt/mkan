# Mkan v1.0 — Product Requirements Document

> **Status**: Approved · **Owner**: PM · **Last updated**: 2026-04-25 · **Method**: BMAD

## 1. Vision

Mkan is a Sudan-focused dual-vertical marketplace that lets people **find a place to stay** and **find a way to get there** in one product. The first vertical is short-term home rentals (Airbnb-style). The second is intercity bus ticketing (Sudanese long-distance coach operators). Both run on the same account, same wallet, same payment rails — Sudan-native (Bankak, Cashi, mobile money, bank transfer, cash on arrival) plus international (Stripe).

## 2. Why now

- Sudanese travelers currently coordinate stays via WhatsApp and bus tickets via terminal-counter cash. Both are friction-heavy and fraud-prone.
- A bilingual (Arabic-RTL / English-LTR) marketplace with verified hosts/operators and a transparent price + payment trail is the smallest valuable product.
- The codebase is already 80% complete: data model, auth, search, listing detail, host onboarding (17 steps), passenger search→ticket flow, admin, i18n parity. Shipping v1.0 is closing the last 20%.

## 3. Personas

| Persona | Who | Top jobs |
|---|---|---|
| **Traveler / Guest** | A Sudanese resident or diaspora returnee booking a stay or a bus seat. Mobile-first. Often Arabic. | Search → compare → book → pay → receive ticket/confirmation. Cancel/refund. |
| **Home Host** | An individual property owner (apartment, house, room) in Sudan listing for short stays. | Onboard → publish → manage calendar → receive bookings → get paid. |
| **Transport Operator** | A coach company (e.g., Marwan, Almeerab, Tirhal) selling intercity tickets. | Onboard office → register fleet → define routes → schedule trips → receive bookings → manage seats → get paid. |
| **Property Manager** *(secondary)* | A long-term rental manager handling tenant applications and leases. | Review applications → approve → create lease → collect rent. |
| **Tenant** *(secondary)* | A long-term tenant in a managed property. | Apply → sign lease → pay rent monthly → request maintenance. |
| **Admin** | Mkan operator. | Verify listings/operators → moderate disputes → reconcile reference-based payments → analytics. |

## 4. Scope

### 4.1 In scope (v1.0)

**Homes (short-term)**
- Discover: home page, full-text search with filters, map view, listing detail with photo tour, reviews, amenities, hosted-by, meet-host.
- Book: date selection → checkout → multi-gateway payment → confirmation → email receipt.
- Host: 17-step onboarding (about-place → structure → privacy-type → location → floor-plan → stand-out → amenities → photos → title → description → finish-setup → price → discount → legal → instant-book → visibility → publish), dashboard with KPIs/calendar/listings/earnings/inbox, full editor (26 sub-pages including all "Coming Soon" stubs filled in).
- Long-term variant: tenant application → manager approval → lease creation (PDF) → monthly rent payments — fully wired to schema.

**Transport**
- Discover: home page, big-search (origin → destination → date → seats), trips list, trip detail with seat picker, popular routes, operator directory, operator profile.
- Book: seat selection → passenger details → checkout → multi-gateway payment → printable e-ticket with QR.
- Operator: onboarding (overview → office-info → assembly-point → buses → photos → routes → schedule → finish), post-launch dashboard at `/transport-host/[id]/{overview, bookings, earnings, trips}`.
- Cancel: passenger cancels (refund per policy); operator cancels trip (passengers notified).

**Payments (both verticals)**
- **Stripe**: international cards, full intent + webhook + refund.
- **Bankak**: reference-based — user pays in Bank of Khartoum app, enters txn ref, admin verifies.
- **Cashi**: reference-based — Sudan e-wallet, same flow.
- **Mobile money**: reference-based — generic carrier select + ref.
- **Bank transfer**: reference-based — bank account display + receipt upload.
- **Cash on arrival** (transport) / **Cash at check-in** (homes): no online payment.

**Platform**
- Auth: NextAuth v5 with Google, Facebook, credentials. Email verification. 2FA. Role-based access (USER, MANAGER, TENANT, DRIVER, ADMIN).
- i18n: en (LTR) + ar (RTL), parity-tested.
- Admin: listing/operator verification queue, payment-reference verification queue, user management.
- Help: 4 real content sections (home host, experience host, service host, travel admin) instead of "Coming Soon".
- Observability: structured logger sink (no Sentry; Sentry was removed for Next 16 / Vercel ESM compatibility).

### 4.2 Out of scope (post-v1.0)

- Live chat / messaging between guest and host (or passenger and operator).
- Mobile app (iOS/Android native).
- Insurance products.
- Loyalty program.
- Multi-tenant SaaS posture (mkan is single-tenant in v1.0).
- Driver-facing mobile app for ticket scanning (use web admin for v1.0).
- Real-time bus GPS tracking.

## 5. Success criteria (definition of "shipped")

We have shipped mkan v1.0 when **all** of the following are true:

1. `pnpm test` — green, ≥900 tests (up from 831).
2. `pnpm test:e2e` — green, ≥30 specs (up from 14).
3. `pnpm lint:strict` — exit 0.
4. `pnpm tsc --noEmit` — exit 0.
5. CI workflow on `main` is green.
6. Vercel production deploy state = READY.
7. Smoke checks: `/api/health` returns 200; `/en/listings`, `/en/transport`, `/ar/listings`, `/ar/transport` render under 2.5s LCP.
8. Stripe sandbox: a test card payment completes through webhook → booking confirmed → email sent.
9. Bankak: a reference-based payment is recorded, admin verifies in queue, booking confirms automatically.
10. One real operator onboarded end-to-end on prod and visible in their `/transport-host/[id]/bookings` inbox.
11. One real guest books a stay and a bus seat on prod with cash payment.
12. `v1.0.0` git tag pushed; release notes drafted.
13. All 12 epic files marked Done; all ~60 story files marked Done.

## 6. KPIs to track (post-launch)

| KPI | Target | Source |
|---|---|---|
| Time to first booking from a new visitor | < 5 min | analytics |
| Search → listing-detail CTR | ≥ 25% | server-side log |
| Listing-detail → checkout CTR | ≥ 8% | server-side log |
| Booking creation success rate | ≥ 95% | server-side log |
| Payment success rate (Stripe) | ≥ 92% | Stripe dashboard |
| Payment verification SLA (reference-based) | < 24h | admin queue |
| Operator onboarding completion rate | ≥ 60% | onboarding step events |
| LCP p75 (homepage, listing detail, transport home) | < 2.5s | Web Vitals |

## 7. Constraints

- **Stack** is fixed: Next.js 16, React 19, Prisma 7, TypeScript 5, Tailwind CSS 4, shadcn/ui, NextAuth v5, PostgreSQL (Neon), Vitest, Playwright. Do not introduce competing primitives.
- **Languages**: en + ar only. Single-language source of truth in dictionaries (`src/components/internationalization/{en,ar}.json`); no `nameAr`/`descriptionAr` on DB records (refactored in Epic 11.3).
- **Port**: dev server always 3000.
- **Env**: only one `.env` file at repo root.
- **Sentry**: not used (removed for Vercel/ESM reasons; replaced by structured logger sink).
- **Build**: webpack (not Turbopack) for production; Turbopack only in dev.
- **Currency**: Sudanese Pound (SDG) primary, USD secondary for Stripe.

## 8. Dependencies (external)

- **Stripe** test + live keys (Vercel env vars).
- **Resend** API key (transactional email).
- **ImageKit** public + private keys (image storage).
- **Upstash Redis** REST URL + token (rate limiting).
- **Neon** Postgres connection string (DATABASE_URL).
- **Bankak** / **Cashi** — no public APIs known; reference-based reconciliation only.

## 9. Releases & sequencing

| Phase | Output | When |
|---|---|---|
| **A — BMAD authoring** | 12 epic files + ~60 story files + this PRD + `architecture.md` | Day 1 |
| **B — Foundation hardening** | Epic 1, 2, 3 (partial) | Day 1-2 |
| **C — Homes completion** | Epics 4, 5, 6, 7, 8 | Day 2-5 |
| **D — Transport completion** | Epics 9, 10, 11 | Day 5-7 |
| **E — E2E backfill** | Remainder of Epic 3 | Day 7 |
| **F — Production ship** | Epic 12 | Day 8 |

## 10. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Sudanese gateways (Bankak, Cashi) have no public API | Cannot auto-confirm payments | Reference-based flow with admin verification queue (Epic 4.10) |
| Stripe live keys not provisioned at ship time | Cannot charge real cards | Story 12.3 explicitly checks Vercel env before merging to main |
| 30+ E2E specs push CI past 10 min | Slow PR feedback | Shard Playwright into 2 parallel jobs in Story 3.1 |
| Long-term rental flow surfaces deeper data model questions | Scope creep in Epic 7 | If discovered, file new stories; do not block ship — long-term rental can ship to admin-only if guest UX is incomplete |
| `as unknown as` removal surfaces real Prisma `Decimal` ↔ `number` mismatches | Type errors | DTOs explicitly map `Decimal` → `number` via `.toNumber()` at the action boundary |

## 11. Glossary

- **Listing** — a short-term rental home/apartment/room.
- **Booking** — a short-term reservation against a Listing for given dates.
- **Application** — a long-term rental application against a Listing.
- **Lease** — a long-term contract between Tenant and Manager for a Listing.
- **Payment** — one money movement (booking checkout, lease rent, refund). Has a `status`, `gateway`, optional `reference`.
- **TransportOffice** — an operator's profile (one or more buses + assembly points + routes + trips).
- **Bus** — a vehicle owned by an operator.
- **Route** — origin → destination geographic pair.
- **Trip** — a scheduled departure of a specific Bus on a specific Route on a specific Date/Time.
- **Seat** — one selectable spot on a Trip; has SeatStatus (Available / Reserved (held 30 min) / Booked / Blocked).
- **TransportBooking** — a passenger's reservation of one or more Seats on a Trip.
- **Ticket** — the QR-encoded artifact a passenger shows the operator at boarding; tied to a TransportBooking.
- **Reference (payment)** — the txn ID a user enters after paying via a non-API gateway (Bankak, Cashi, mobile money, bank transfer).
- **Verify (payment)** — admin marks a reference-based payment as received → booking auto-confirms.
