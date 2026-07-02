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
8. **Seeded ~500 homes / ~100 hosts** with amenities+highlights (`scripts/seed-listings.ts`).
9. **Low-bandwidth perf**: AVIF images + trimmed sizes (`next.config.ts`); cached narrow-select `getHomeListings`; `/search` mobile-map deferral (flag); detail-page query parallelized; `/search` initial 50→24.
10. **Arabic-first guard tests** (`tests/i18n/`): dictionary-parity + RTL-physical-class (71 checks).
11. **Production build green** (`pnpm build` exit 0).

## 🔜 Deferred to phase 2 (documented, flagged off — nothing lost)
Wire each still-`false` flag above to real data. Plus: web/browser push for the availability nudge (service-worker + VAPID + cron), full homepage server-component refactor, content-shaped loading skeletons, hardcoded-string ratchet test, and gating the card `averageRating || 4.5` fallback on `numberOfReviews > 0` for unreviewed homes.

---

## Ops notes
- **Seed homes:** `set -a && source .env && set +a && npx tsx scripts/seed-listings.ts` (bare `pnpm seed:listings` fails `DatabaseDoesNotExist` — the script imports the DB client before dotenv loads).
- **Owner login:** number-only, e.g. `0001` / `1234` (username or email accepted). Lands on `/hosting/listings`.
- **Availability migration:** `Listing.lastAvailabilityConfirmedAt` was added via Neon MCP `run_sql` (project `solitary-water-49503410`) — `prisma db execute` is broken in this Prisma-7/pg-adapter setup. `prisma/schema.prisma` carries the field; re-run `prisma generate` after pulls.
- **After a production build on a running dev server, clear `.next` + restart dev** — a mixed build/dev `.next` cache glitches rendering.

**Key files:** `src/config/phase-flags.ts` · `src/components/listings/feature-icons.ts` · `src/components/hosting/availability-check.tsx` · `src/components/internationalization/{en,ar}.json` · `scripts/seed-listings.ts` · `tests/i18n/`
