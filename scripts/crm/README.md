# CRM seeding — Twenty objects & views (Epic G1.1)

Tooling that materializes the [Growth Engine](../../docs/growth.md) CRM design in the live
**Twenty** workspace (`mkan.crm.databayt.org`): the `Home` / `Host` custom objects, the
`Opportunity` onboarding fields, and the 10 saved Views.

| File | What |
| --- | --- |
| `twenty-schema.ts` | Source of truth — `Home` (55 fields) + `Host` (32 fields) objects and the `Opportunity` custom fields (14), with Twenty `FieldMetadataType`s, SELECT options, and relations. Mirrors `docs/growth.md` §2.3–§2.5. |
| `twenty-views.ts` | The 10 saved Views (object, type, kanban group-by, columns, sorts, filters). Mirrors §2.8. |
| `seed-twenty-objects.ts` | Idempotent seeder — creates the objects + all fields (incl. the Opportunity fields on the standard object) via Twenty's metadata GraphQL API. |
| `seed-twenty-views.ts` | Idempotent seeder — creates the Views. Run **after** the objects seeder. |
| `airbnb-parse.ts` | **G1.2** — pure parsers over Airbnb's deferred-state JSON → normalized `HomeRecord`/`HostRecord` (field names match the schema). Unit-testable. |
| `airbnb-scrape.ts` | **G1.2** — the scraper: search sweep → PDP enrich (all photos + full data) → writes normalized records to a JSON file. |
| `twenty-upsert.ts` | **G1.2** — reads the scraped file → upserts Home/Host + one Opportunity per new host into Twenty via the REST data API (dedup by external id). |
| `trust-score.ts` | **G1.3** — pure rubric: host + home scores, derived checks, overall blend, hard gates (docs/growth.md §3). Unit-testable. |
| `score-trust.ts` | **G1.3** — worker: scores the local scraped file (default) or re-scores Twenty records (`--apply`). |
| `mkan-import.ts` | **G1.5** — provisions `1000@`+ MANAGER accounts + imports trusted homes into the mkan DB as **Busy** (Listing+Location). Writes to mkan (Prisma). |

## Run

Both seeders are **dry-run by default** (no backend needed — they print the full plan):

```bash
pnpm crm:seed-objects        # or: npx tsx scripts/crm/seed-twenty-objects.ts
pnpm crm:seed-views
```

**Apply** (creates everything in Twenty — the **backend must be up**):

```bash
export TWENTY_API_URL=http://localhost:3000                 # Twenty SERVER base URL
export TWENTY_API_KEY=<token from Settings → APIs & Webhooks>

pnpm crm:seed-objects --apply     # objects + fields first
pnpm crm:seed-views   --apply     # then the views (need the field ids)
```

- `TWENTY_API_URL` is the Twenty **server** base URL (metadata API is at `<url>/metadata`).
  The backend runs on the local machine, so this is that box's URL (or a tunnel) — **not**
  the Vercel frontend URL.
- **Idempotent:** re-runs skip objects/fields/views that already exist, so it's safe to run
  again after editing the schema.

## Notes & caveats

- **Verified** against `twentyhq/twenty` (field-type enum, `createOneObject` /
  `createOneField`, `createView` / `createViewField` / `createViewSort` / `createViewFilter`,
  `getViews`). Twenty's metadata API can shift between versions — the seeders log any single
  object/field/view/filter that fails and continue.
- Twenty auto-creates each object's label field (`name`), so it isn't declared here.
- **View filters** are applied best-effort (Twenty's filter-value encoding is version-
  sensitive); columns, kanban grouping, and sorts are reliable. If a filter doesn't stick,
  set it in the UI (a couple of clicks) — the seeder logs which ones to check.
- SELECT/MULTI_SELECT option colors cycle via `TAG_COLORS` / `toOption` in `twenty-schema.ts`.

## Scraper (G1.2)

Sweeps the Airbnb search (all Sudan by default, tagged by city), opens each PDP for **all
photos + full data**, and writes normalized `Home`/`Host` records to a JSON file. Reuses
the logged-in **vault Chrome** over CDP (`:9222`) — read-only, low-rate (see
`docs/growth.md` §4.6 for the ToS/consent posture).

```bash
# small live test — 3 Port Sudan listings, PDP-enriched
npx tsx scripts/crm/airbnb-scrape.ts --query=Port-Sudan--Sudan --max=3

# full sweep — all Sudan (~117), tagged by city, all photos
pnpm crm:scrape                       # → scripts/crm/.data/airbnb-scrape.json
pnpm crm:scrape --no-pdp              # search-only (fast; card photos, no full gallery)
```

Flags: `--query=<slug>` · `--max=<N>` · `--no-pdp` · `--out=<path>` · `--pdp-delay=<ms>` ·
`--max-pages=<N>` · `--cdp=<url>`. Output (gitignored under `.data/`) is
`{ scrapedAt, query, counts, homes[], hosts[] }` with field names matching `twenty-schema.ts`.
Requires the vault Chrome to be running (`chrome-debug.sh`).

Verified live (2026-07-03): per home — id, name, category→roomType/PropertyType, city, coords,
bedrooms/beds/baths, guests, full amenity list, **all gallery photos** (single-folder,
avatar-filtered), nightly SR price, rating/reviews; per host — id, name, superhost, avatar,
portfolio counts.

## Upsert into Twenty (G1.2 step 4)

Reads the scraped file → dedups by external id → creates `Host` + `Home` records + one
`Opportunity` per **new** host, via Twenty's REST data API. Run **after**
`crm:seed-objects --apply` (objects must exist) with the backend up.

```bash
npx tsx scripts/crm/twenty-upsert.ts                 # dry run — prints the exact bodies
TWENTY_API_URL=http://localhost:3000 TWENTY_API_KEY=… \
  pnpm crm:upsert --apply                            # write to Twenty
```

Flags: `--in=<path>` · `--limit=<N>` · `--apply`. Composite fields use Twenty's verified
write shapes (LINKS `{primaryLinkUrl, secondaryLinks}`, ADDRESS `{addressCity/State/Country/
Lat/Lng}`, CURRENCY `{amountMicros, currencyCode}`); to-one relations are the FK `hostId`.
Raw amenities are mapped to the `mkanAmenities` enum on the way in. Idempotent (existing
records skipped). The full chain: `crm:scrape` → `crm:upsert --apply`.

## Trust scoring (G1.3)

Computes the host + home trust scores, the derived checks (location / hotel-agency /
data-completeness / price-sanity / duplicate), the blended overall, and the trust band
(with hard gates), per `docs/growth.md` §3.

```bash
npx tsx scripts/crm/score-trust.ts                   # score the local scraped file → .data/airbnb-scored.json
TWENTY_API_URL=http://localhost:3000 TWENTY_API_KEY=… \
  pnpm crm:score --apply                             # re-score Twenty records + patch back
```

Local mode reflects the **scrape-only ceiling** — hosts stay `LOW` and homes land
`HOLD`/`REJECT` until a host is contacted and replies (outreach engagement is worth 25 of
the host's 100). Hotels and shared rooms hit the hotel-exclusion gate → `REJECT`; a
great listing whose host replied + confirmed price + has re-hosted photos reaches
`AUTO_ONBOARD` + `publishReady`. `--apply` re-scores against live CRM state and writes back
`homeTrustScore`/`overallTrustScore`/`trustBand`/`publishReady` + checks on Home,
`hostTrustScore`/`hostTrustBand` on Host, and the denormalized `hostTrustBand` on Opportunity.

## Provision + import into mkan (G1.5)

The payoff: real hosts get accounts and their listings pre-loaded. Reads the scored file →
provisions `1000@mkan.org`+ MANAGER accounts (mint-forward, `emailVerified`, random
bootstrap password) → imports each trusted home into the **mkan DB** as **Busy**
(`Listing` + `Location`, `isPublished:false`). This is the one step that writes to mkan.

```bash
npx tsx scripts/crm/mkan-import.ts --min-band=HOLD              # dry plan (no writes)
FORCE_SEED=1 npx tsx scripts/crm/mkan-import.ts --apply         # write Busy listings to mkan
```

Flags: `--in=<scored file>` · `--min-band=<AUTO_ONBOARD|MANUAL_REVIEW|HOLD>` (default
MANUAL_REVIEW) · `--fx-rate=<SAR→SDG>` · `--limit=<N>` · `--apply` · `--out=<ledger>`.

- **Consent gate:** only homes that are NOT hard-gated (hotel/duplicate/location-fail) and
  meet `--min-band` import. In real operation the CRM marks a home ready at the ONBOARDING
  stage (host agreed); `--min-band` is the manual override for a vetted batch. **Do not
  `--apply` for hosts who haven't agreed to join.**
- **Idempotent** via a ledger (`.data/mkan-import-ledger.json`) — mkan `Listing`/`User` have
  no external-id column, so the ledger maps `airbnbListingId`→`mkanListingId` and
  `airbnbHostId`→account; re-runs skip what's imported. Prod-guarded (`FORCE_SEED`).
- **Photos** import empty (app placeholder) until **G1.4** re-hosts them; **price** imports
  only if SDG is known or `--fx-rate` is given (proper SR→SDG is **G1.4**). Everything stays
  **Busy** — going Available is the trust-gate flip, never done here.
- Numbering verified live: 0 existing `≥1000` accounts → next is `1000` (clear of the demo pool).

## Still to add (later G1 steps)

- The `Note` / `Task` (Activity) custom fields — `channel`, `host`, `home` (§2.6). Small;
  the "Follow-ups due" view already works on standard Task fields without them.
- **G1.4** — re-host scraped photos to `cdn.databayt.org` (so imports have real images) +
  proper SR→SDG conversion. This unblocks full-quality G1.5 imports.
- Then `docs/growth.md` §7 — G1.6 OpenClaw outreach · G1.7 wave publish (flip Busy→Available
  per city, per trust).
