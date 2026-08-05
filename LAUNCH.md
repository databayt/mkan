# Mkan — Phase 1 Launch (Port Sudan)

**Status:** ✅ Delivered & verified live · production build green · `tsc` 0 · i18n parity in sync.

## Goal
Traffic + trust for Port Sudan. Honest, Arabic-first, mobile-first, **contact-only**:
- **Client journey:** search → filter → find preferred home → **get contact info & call the host** (no online booking in phase 1).
- **Owner journey:** we seed their homes, hand them credentials, keep them **logged in ~1 year**, and nudge them (calibrated, cookie-style) to keep **Available / Busy** fresh.

## Operating principles
1. **Preserve the current UI.** Minimum change, only when necessary.
2. **Hide, never delete.** Mock / fabricated / not-yet-wired UI is feature-flagged off (code preserved) — see the register below.
3. **Honest info only** — real, current data (SDG currency, Port Sudan, real amenities, no fabricated claims).
4. **Arabic-first** — dictionaries at `src/components/internationalization/{en,ar}.json`, verified by `scripts/dev-i18n-sync.ts` + `tests/i18n/`.

---

## 🔦 Hide / Visible register — `src/config/phase-flags.ts`

Single source of truth for what's visible this phase. Each hidden section is `{PHASE1.<flag> && <Section/>}` — flip the flag in phase 2 to re-enable (nothing to un-delete).

| Flag | Phase 1 | Hides / controls | Phase 2 to turn on |
|---|---|---|---|
| `enableOnlineBooking` | `false` | Desktop reserve widget, availability calendar, price breakdown, checkout→Stripe, "payment protection" notices | When online payments go live |
| `showListingAmenities` | `true` | Amenities section — **WIRED** to real `listing.amenities` (self-hides when empty) | — (already live) |
| `showListingHighlights` | `true` | Highlights section — **WIRED** to real `listing.highlights` (self-hides when empty) | — (already live) |
| `showWhereYouSleep` | `false` | "Where you'll sleep" beds (fabricated per-room data) | Wire real per-room bed data (schema change) |
| `showThingsToKnow` | `false` | House rules / safety / cancellation (fabricated) | Wire `houseRules` + `cancellationPolicy` (+ dict labels) |
| `showMobileInfoCards` | `false` | Mobile "Fast wifi / Free cancellation before Aug 7" (fabricated) | Only if real, per-listing data exists |
| `showSqFt` | `false` | Square-footage spec (imperial, usually null) | Convert to m² if populated |
| `showMessageHost` | `false` | "Message host" buttons (inert) | Wire `src/lib/actions/message-actions.ts` |
| `showFooterLocaleSwitcher` | `false` | Footer currency/language buttons (non-functional) | When they actually switch |
| `deferSearchMapMobile` | `false` | `/search` mobile map: `true` = mount on tap (saves ~200 KB mapbox-gl); `false` = render on load | Owner preference toggle |
| `availabilityReminderDays` | `14` | Days before an owner is nudged to reconfirm Available/Busy | Tune cadence |

---

## ✅ Delivered (all verified live in Arabic + English)

1. **Hide fabricated sections** via the phase-flags register (above).
2. **Currency → SDG** everywhere (`formatCurrency`/`formatNumber`, Arabic-Indic digits) + "Khartoum" → Port Sudan copy.
3. **Listing detail localized Arabic-first** (overview, specs, reviews, tabs, reserve) + RTL fixes.
4. **Amenities & highlights wired** to real enum data with lucide icons (`src/components/listings/feature-icons.ts`).
5. **Contact-only**: booking gated off; localized **"Call the host"** card (SDG + `tel:`) on desktop; mobile call bar already wired.
6. **~1-year owner login** (`auth.ts` session/jwt/cookie maxAge).
7. **Availability Check** — cookie-dialog-style nudge on `/hosting/listings` listing stale homes with one-tap Available/Busy (`src/components/hosting/availability-check.tsx` + `confirmAvailability`/`getStaleAvailabilityListings` in `listing-actions.ts`).
8. **Real catalogue only** — 74 Airbnb homes imported via the Growth Engine plus 23 belonging to the three Port Sudan owners. The 486 generated listings were purged 2026-08-05 (`pnpm purge:synthetic`).
9. **Low-bandwidth perf**: AVIF images + trimmed sizes (`next.config.ts`); cached narrow-select `getHomeListings`; `/search` mobile-map deferral (flag); detail-page query parallelized; `/search` initial 50→24.
10. **Arabic-first guard tests** (`tests/i18n/`): dictionary-parity + RTL-physical-class (71 checks).
11. **Production build green** (`pnpm build` exit 0).
12. **All assets on cdn.databayt.org** (CloudFront, `max-age=31536000 immutable`): Airbnb-derived assets on `/airbnb`, mkan media on `/mkan` via `src/lib/cdn.ts`. Listing photos (seed + **live DB**, 1,960 refs) serve from `/mkan/stock` — zero third-party image hosts in the hot path (unsplash fully retired). Heavy-media diet: transport hero video 38MB→1.4MB 720p + poster, homepage inspiration 3MB SVG-wrapped rasters→90KB jpgs, julia 1.3MB→98KB. `qualities:[50,65,75]` + `quality={65}` on card grids; CDN `preconnect` in the `[lang]` layout. Verify inventory anytime: every `cdn.*()` call site HEAD-checked 200 (91 keys).

## 🔜 Deferred to phase 2 (documented, flagged off — nothing lost)
Wire each still-`false` flag above to real data. Plus: web/browser push for the availability nudge (service-worker + VAPID + cron), full homepage server-component refactor, content-shaped loading skeletons, hardcoded-string ratchet test, and gating the card `averageRating || 4.5` fallback on `numberOfReviews > 0` for unreviewed homes.

---

## Ops notes
- **Seed homes:** the real-owner scripts only (`seed-heirs-homes.ts` / `seed-daqna-homes.ts` / `seed-hussein-homes.ts`), each scoped to its own host. Pre-load the env — `set -a && source .env && set +a && npx tsx …` — because they import the DB client before dotenv loads. Airbnb homes arrive via `pnpm crm:import`, not a seed.
- **Owner login:** number-only, e.g. `0001` / `1234` (username or email accepted). Lands on `/hosting/listings`.
- **Availability migration:** `Listing.lastAvailabilityConfirmedAt` was added via Neon MCP `run_sql` (project `solitary-water-49503410`) — `prisma db execute` is broken in this Prisma-7/pg-adapter setup. `prisma/schema.prisma` carries the field; re-run `prisma generate` after pulls.
- **After a production build on a running dev server, clear `.next` + restart dev** — a mixed build/dev `.next` cache glitches rendering.
- **CDN uploads:** stage files in `codebase/public/cdn/mkan/` (gitignored — S3 is source of truth), then `pnpm cdn:sync --prefix=mkan` with a **clean env** (`env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY …` — codebase `.env` has empty AWS vars that override the working `~/.aws` default profile). Refresh `src/registry/cdn-manifest.json` via `pnpm cdn:manifest` (file is skip-worktree; `git update-index --no-skip-worktree` before committing).
- **Domain (fixed 2026-07-02):** `mkan.databayt.org` was never bound to the mkan Vercel project — it fell through to the `*.databayt.org` wildcard (hogwarts) and served a school-404. Bound via `vercel domains add mkan.databayt.org` (DNS already pointed at Vercel). Auth is unaffected (`trustHost: true`).
- **CSP:** any *new* origin the browser touches directly must be allow-listed in `src/proxy.ts` `buildCsp()` — the enforced prod policy blocked CDN `<video>` until `media-src 'self' https://cdn.databayt.org` was added. Images are exempt only because they proxy through same-origin `/_next/image`.

**Key files:** `src/config/phase-flags.ts` · `src/components/listings/feature-icons.ts` · `src/components/hosting/availability-check.tsx` · `src/components/internationalization/{en,ar}.json` · `scripts/crm/` · `tests/i18n/`

---

# Transport — Phase 1 (same playbook, 2026-07-02)

**Status:** ✅ Delivered & verified locally (en+ar × mobile 390 / desktop 1440) · `tsc` 0 · build green · i18n parity 71/71.

The transport vertical now follows the same honest / Arabic-first / mobile-first principles, keeping its own identity (glass hero search, timetable trip cards, seat picker, printable QR ticket).

## Hide / Visible register additions (`src/config/phase-flags.ts`)

| Flag | Phase 1 | Hides | Phase 2 to turn on |
|---|---|---|---|
| `showTransportTestimonials` | `false` | Fabricated reviewers ("Thousands of travelers trust Mkan") | Real traveler reviews from completed bookings |
| `showTransportOperatorLogos` | `false` | Logo carousel of brands NOT on the platform (dead `?ref=arc` links) | Real verified office logos or signed partnerships |

## Delivered

1. **Honesty pass** — testimonials + operator carousel gated off; "PDF ticket" and "card payment" claims corrected in both dictionaries (card is geo-gated to diaspora).
2. **Arabic-first sweep** — new `src/components/transport/city-names.ts` (28 cities, EN canonical values / AR display); seat picker, city dropdowns, filters, trip cards, all detail pages consume the dictionary; Arabic-Indic digits via `formatNumber`; SDG everywhere via `formatCurrency` (card-checkout + filter bounds fixed).
3. **Homes-maturity boost** — shared `src/components/transport/amenity-icons.ts` (BusAmenity→lucide, mirrors `feature-icons.ts`); trip card polish (BadgeCheck verified chip, rating gated on real >0, RTL-safe timeline); designed BusFront empty state; RTL route arrows; Popular Routes deduped by city pair with concise city labels.
4. **Mirror-pattern refactor** — trips/[id], offices/[id], booking/[id], ticket, checkout all converted from `'use client'`+useEffect waterfalls to server page + client content; offices/[id] fully server; trip page reuses the shared `SeatPicker` (duplicate codepath killed); ticket QR renders server-side.
5. **Contact-first** — `tel:` call-office CTAs on office header, trip detail, checkout summary, booking confirmation (office phone from DB). Share button wired to `navigator.share`/clipboard.
6. **Landing map fixed** — read `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (never set) instead of the project's `NEXT_PUBLIC_MAPBOX_TOKEN`; was silently falling back to a pill list that also bled over the heading. Now a real Mapbox map, fallback contained.
7. **Trips data** — all 1,722 seeded trips had expired (search always empty!). New **`scripts/topup-transport-trips.ts`**: non-destructive, idempotent 14-day trip+seat top-up on existing routes. Ran live: 1,722 trips + 81,270 seats.
8. **Schema drift healed** — `Seat.reservedUntil` existed in `schema.prisma` but not the DB (crashed `getTripDetails`); added via Neon MCP `run_sql`.
9. Landing `force-dynamic` → ISR 600s.

## Ops notes (transport)
- **Trips expire**: re-run `npx tsx scripts/topup-transport-trips.ts` (env: `set -a && source .env && set +a`) before trips run out — consider a weekly cron. Idempotent.
- **`getPopularRoutes` caches 1h** (`unstable_cache`) — after a fresh trip top-up the landing may show stale/empty routes for up to an hour.
- The old `seed-transport.ts` **wipes bookings/payments** — never run it against live data again; use the top-up.

## Deferred (transport phase 2)
Wire the two new flags to real data; convert `offices` list page (still client-fetch, dictionary-wired); localize departure clock digits (currently western in ar, like homes); hero video asset is a generic clip (VR headset) — consider a bus/travel clip; ticket PDF + email delivery (helper exists, uncalled).
