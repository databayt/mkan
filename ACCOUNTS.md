# Mkan — Accounts & Seeded Data

How the demo/launch accounts are provisioned. See [LAUNCH.md](./LAUNCH.md) for the phase-1 plan.

## Login scheme
- **Numbered host slots:** `0001@mkan.org … 0100@mkan.org`, `username` == the 4-digit number.
- Sign in with **the number alone** (e.g. `0001`) or the email — password **`1234`**.
- Role `MANAGER`; after login lands on `/hosting/listings`.
- Owners keep their number; identity/profile is personalized on first login. Sessions last ~1 year (see LAUNCH.md).

## Current state (as seeded)
| Accounts | Homes | Source | Notes |
|---|---|---|---|
| **`0001`** | **7 — REAL** | `pnpm seed:heirs` (`scripts/seed-heirs-homes.ts`) | Real heirs-estate homes in Port Sudan: real Arabic titles/descriptions, real SDG prices, real specs. **Photos are NOT real** → `photoUrls` empty, branded placeholder fallback (source images were private WhatsApp/legal docs, not house photos). |
| **`0002`** | **8 — REAL** | `pnpm seed:daqna` (`scripts/seed-daqna-homes.ts`) | Real **Daqna (دقنة)** building, Port Sudan — 8 apartment units (first floor · ground floor ×2 · second floor ×3 · rooftop ×2) with real Arabic titles + real specs. Owner phone set on the account → click-to-call reaches **`+249 91 284 6648`**. **Photos not supplied** → placeholder. **Prices are ESTIMATES** (size-proportional) — owner to confirm. Amenities/highlights empty (none supplied) → those detail sections self-hide. |
| `0003 … 0100` (98 hosts) | ~490 — demo | `pnpm seed:listings` (`scripts/seed-listings.ts`) | Generic Port Sudan demo homes (~5 per host) with **real amenities + highlights** (enum data), Unsplash photos, SDG prices, cyclic districts/types. |
| `traveler1 … 5@mkan.org` | — | `scripts/seed-listings.ts` | Guest (`USER`) accounts, password `1234`. |

**Totals:** 505 published listings across 100 hosts (0001 = 7 real, 0002 = 8 real, 0003–0100 = ~490 demo). All start with `lastAvailabilityConfirmedAt = null`, so every owner sees the **Availability Check** nudge on first login (see LAUNCH.md).

> ⚠️ **0001 and 0002 are REAL — keep them real.** Their homes are genuine Port Sudan properties. If you ever re-run the full `seed:listings` (which wipes ALL listings and rebuilds generic ones), **re-run `seed:heirs` AND `seed:daqna` afterward** to restore them. Order: full seed first, then the two scoped real seeds.

## Real scraped hosts (`1000@mkan.org`+)
Real owners onboarded from Airbnb (and later fb pages / wa groups / other rental sites) via the **[Growth Engine](./docs/growth.md)** get accounts **starting at `1000`** — `1000, 1001, …`, role `MANAGER`, `emailVerified`, username == the number, **mint-forward (never recycled)**, kept clear of the demo pool. Their homes import **Busy** (`isPublished:false`) and go **Available only through the CRM trust gate** (host confirmed + trust band passes). `0101–0999` stays reserved for demo growth. Full flow: [docs/growth.md](./docs/growth.md) §5 + §8.

| Range | Meaning |
|---|---|
| `0001–0002` | Real Port Sudan homes (heirs, Daqna) — keep real. |
| `0003–0100` | Demo/synthetic hosts (`seed:listings`). |
| `0101–0999` | Reserved for demo growth. |
| **`1000+`** | **Real scraped hosts** (Growth Engine) — Busy until the trust gate. |

## Re-seeding
Both scripts import the DB client before dotenv loads, so **pre-load the env** (bare `pnpm seed:*` fails `DatabaseDoesNotExist`):

```bash
# All demo homes (DESTRUCTIVE — wipes + rebuilds 500 across 100 hosts)
set -a && source .env && set +a && npx tsx scripts/seed-listings.ts

# Restore 0001's 7 real homes (scoped to host 0001 ONLY — safe for the others)
set -a && source .env && set +a && npx tsx scripts/seed-heirs-homes.ts

# Restore 0002's 8 real Daqna homes (scoped to host 0002 ONLY)
set -a && source .env && set +a && npx tsx scripts/seed-daqna-homes.ts
```

- `seed-heirs-homes.ts` deletes only host `0001`'s listings (by `hostId`) and rebuilds the 7 — nothing owned by any other host is touched, and the `0001` User account itself is left as-is. Idempotent.
- `seed-listings.ts` scale is set by `HOST_COUNT` (100) and the loop bound (500) near the top of the file.
- Bookings/reviews for the 500-home seed can hit `EADDRNOTAVAIL` (connection exhaustion) at scale — listings still commit; homes then show as "new"/unreviewed (honest). Reseeding reviews at scale needs connection throttling.

## Admin
Separate from the numbered host slots: an admin/super-admin account exists (`super@mkan.org`) via `scripts/seed-admin*`. Not part of the demo host pool.

## Key files
`scripts/seed-listings.ts` · `scripts/seed-heirs-homes.ts` · `scripts/seed-daqna-homes.ts` · `scripts/seed-heirs-translations.ts`
