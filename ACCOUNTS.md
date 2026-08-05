# Mkan — Accounts & Seeded Data

How the live accounts are provisioned. See [LAUNCH.md](./LAUNCH.md) for the phase-1 plan.

> **There is no demo catalogue any more.** Every listing on mkan.sd is a real
> home: 74 scraped from Airbnb through the [Growth Engine](./docs/growth.md) and
> 23 belonging to the three Port Sudan owners on `0001`/`0002`/`0003`. The 486
> generated listings, and the 97 empty numbered host slots behind them, were
> deleted on 2026-08-05 (`pnpm purge:synthetic`); the backup is in
> `scripts/crm/.data/purge-backup-*.json`.

## Login scheme
- **Numbered host slots:** `0001@mkan.org …`, `username` == the 4-digit number.
- Sign in with **the number alone** (e.g. `0001`) or the email — password **`1234`**.
- Role `MANAGER`; after login lands on `/hosting/listings`.
- Owners keep their number; identity/profile is personalized on first login. Sessions last ~1 year (see LAUNCH.md).

## Current state
| Accounts | Homes | Source | Notes |
|---|---|---|---|
| **`0001`** | **7 — REAL** | `pnpm seed:heirs` (`scripts/seed-heirs-homes.ts`) | Real heirs-estate homes in Port Sudan: real Arabic titles/descriptions, real SDG prices, real specs. **Photos are NOT real** → `photoUrls` empty, branded placeholder fallback (source images were private WhatsApp/legal docs, not house photos). |
| **`0002`** | **10 — REAL** | `pnpm seed:daqna` (`scripts/seed-daqna-homes.ts`) | Real **Daqna (دقنة)** building, Port Sudan — 8 apartment units (first floor · ground floor ×2 · second floor ×3 · rooftop ×2) plus 2 later additions. Real Arabic titles + real specs. Owner phone set on the account → click-to-call reaches **`+249 91 284 6648`**. **Photos not supplied** → placeholder. **Prices are ESTIMATES** (size-proportional) — owner to confirm. Amenities/highlights empty (none supplied) → those detail sections self-hide. |
| **`0003`** | **6 — REAL** | `pnpm seed:hussein` (`scripts/seed-hussein-homes.ts`) | Real Port Sudan building, 6 units, real Arabic titles. Owner phone `+249 03 467 930`. Photos not supplied → placeholder. |
| **`1000+`** (49 hosts) | **74 — REAL** | Growth Engine (`pnpm crm:import`) | Airbnb homes: real titles, descriptions, amenities, structured house rules, photos re-hosted on our own CDN, SDG prices. |

**Totals:** 97 listings across 52 hosts. All start with `lastAvailabilityConfirmedAt = null`, so every owner sees the **Availability Check** nudge on first login (see LAUNCH.md).

> ⚠️ **`0001`, `0002` and `0003` are REAL — keep them real.** Their homes are
> genuine Port Sudan properties. Each seed script is scoped by `hostId`, so it
> only ever rebuilds its own owner's listings.

## Real scraped hosts (`1000@mkan.org`+)
Real owners onboarded from Airbnb (and later fb pages / wa groups / other rental sites) via the **[Growth Engine](./docs/growth.md)** get accounts **starting at `1000`** — `1000, 1001, …`, role `MANAGER`, `emailVerified`, username == the number, **mint-forward (never recycled)**. Their homes import **Busy** (`isPublished:false`) and go **Available only through the CRM trust gate** (host confirmed + trust band passes). Full flow: [docs/growth.md](./docs/growth.md) §5 + §8.

| Range | Meaning |
|---|---|
| `0001–0003` | Real Port Sudan homes (heirs, Daqna, Hussein) — keep real. |
| `0004–0999` | Free. Was the demo pool; purged 2026-08-05. |
| **`1000+`** | **Real scraped hosts** (Growth Engine) — Busy until the trust gate. |

## Re-seeding
The real-owner scripts import the DB client before dotenv loads, so **pre-load the env** (bare `pnpm seed:*` fails `DatabaseDoesNotExist`):

```bash
# 0001's 7 real homes (scoped to host 0001 ONLY — safe for the others)
set -a && source .env && set +a && npx tsx scripts/seed-heirs-homes.ts

# 0002's real Daqna homes (scoped to host 0002 ONLY)
set -a && source .env && set +a && npx tsx scripts/seed-daqna-homes.ts

# 0003's real homes (scoped to host 0003 ONLY)
set -a && source .env && set +a && npx tsx scripts/seed-hussein-homes.ts
```

Each deletes only its own host's listings (by `hostId`) and rebuilds them —
nothing owned by any other host is touched, and the `User` account itself is
left as-is. Idempotent.

The Airbnb homes are never re-seeded. They are imported once and then kept
current by the CRM sync — see [docs/growth.md](./docs/growth.md).

## Admin
Separate from the numbered host slots: an admin/super-admin account exists (`super@mkan.org`) via `scripts/seed-admin.ts`. Not part of the host pool.

## Key files
`scripts/purge-synthetic.ts` · `scripts/seed-heirs-homes.ts` · `scripts/seed-daqna-homes.ts` · `scripts/seed-hussein-homes.ts` · `scripts/seed-heirs-translations.ts` · `scripts/crm/`
