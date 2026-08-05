# CRM growth pipeline (Epic G1)

The full Airbnb→CRM→mkan flywheel from the [Growth Engine](../../docs/growth.md) design:
scrape → upsert → score → outreach → re-host → import → publish. Every step is a
`pnpm crm:*` command, dry-run by default with `--apply` to execute.

> **▶ Running it?** Follow **[HANDOFF.md](./HANDOFF.md)** — the operator runbook (env, run
> order, safety). Run it **on the Twenty machine**, where the backend + OpenClaw are
> reachable at `localhost` (the Twenty API is not at the Vercel frontend domain).

## How much inventory Sudan actually has (measured 2026-07-26)

Worth knowing before planning around this pipeline: **Sudan has roughly 120 Airbnb listings
in total**, held by 67 hosts. That is the whole national market, not a sample.

The quadtree crawl (`pnpm crm:bbox`) now proves it. Every one of the 64 seed cells either
paginated to exhaustion or is empty — no cell hit Airbnb's 15-page ceiling, so nothing is
hidden behind a truncated result set:

| | |
| --- | --- |
| cells | 64 — 10 with listings, 48 empty, 6 entirely outside Sudan |
| saturated / failed | 0 / 0 |
| results seen | 338 inside viewports |
| rejected as foreign | 219 — Airbnb pads a Sudan search with listings from its neighbours |
| homes kept | 121 |

Two independent checks agree: the crawl's Khartoum cell (86) plus its Omdurman cell (22)
comes to 108 against a separate Khartoum-metro probe's 106, and a direct re-probe of the
Nyala cell confirms Darfur really does hold zero listings.

So the earlier 117-listing dataset was already near-complete — not because the region sweep
worked (it was breaking on page one; see `airbnb-paginate.ts`), but because the market is
tiny. **Coverage is not the constraint on this business; inventory is.** Growth has to come
from onboarding hosts who are not on Airbnb at all, and the pipeline should be judged on
conversion rather than on scrape counts.

## What the enrichment passes established (2026-07-27)

The bilingual PDP passes, the host-profile pass and the contact hunt have all now run over
the full set. Four results worth carrying forward:

**Airbnb serves both the title and the description in Arabic.** Both are captured verbatim
and seeded into `translation_cache` with `provider:'airbnb'`, so `/ar` and `/en` render
Airbnb's own wording with no change to the render path.

> Corrected 2026-07-27. An earlier pass here concluded that Airbnb never translates titles,
> because all 110 captured titles were byte-identical across locales. That was an artefact of
> `parsePdp` reading `TITLE_DEFAULT.title`, which is null on every PDP — so the stage fell
> back to the search-page title and stored the same English string in both passes. The
> translated title is carried on the availability-calendar sections:
> "Luxury 3bed apartment Khartoum" → "شقة فاخرة بثلاث غرف نوم في الخرطوم". If a field looks
> like it is never populated, check that the field is the right one before concluding
> anything about the source.

**Host attribution is solid.** 119 of 121 homes resolve through the `MEET_YOUR_HOST` section;
none fall back to the heuristic key walk that a co-host or a "similar listings" card could
win. `mkan-import.ts` refuses `HEURISTIC` anyway.

**Most of these hosts do not live in Sudan.** Of the 55 with a stated location, 37 are
abroad — 8 UK, 6 UAE, 4 Saudi, 4 Qatar, 3 Egypt, the rest scattered. This is a diaspora
market, and it means their contact number will not be +249 and searching them against a
Sudanese city alone will miss them.

**There are no contacts in anything Airbnb publishes.** The extractor has now been run over
every field — titles, descriptions, house rules, host bios — in both languages, for all 72
hosts: 136,842 characters containing exactly four runs of six or more consecutive digits,
all of them the same electricity meter ID. The answer is zero, and it is not a tooling gap.
Reaching these hosts needs `contact-hunt --worksheet` and a human with a normal browser.

| File | What |
| --- | --- |
| `probe-caps.ts` | Measures the facts the crawler depends on — Airbnb's pagination ceiling, whether `?locale=ar` works and is sticky, and whether `translate_ugc=false` returns the host's original text. Re-run it if Airbnb changes shape. |
| `sudan-places.ts` | The gazetteer — Sudan's border polygon, 18 states, ~50 towns with Arabic names, the river geometry that separates Khartoum/Omdurman/Bahri, and `checkPlace()`, which decides whether a listing is really in Sudan. |
| `airbnb-paginate.ts` | One correct pass over a search result set, shared by the slug scraper and the map crawler. Encodes what `pageCursors` means and why `declaredPages >= 15` marks a truncated viewport. |
| `airbnb-bbox.ts` | **G1.2** — exhaustive discovery by map-viewport quadtree. Resumable via a frontier file; reports provable coverage and names its holes. |
| `airbnb-pdp.ts` | **G1.2** — PDP enrichment, one locale per pass (`--locale=en` / `--locale=ar`), recording which language the host actually authored in. |
| `amenity-map.ts` | Airbnb amenity strings → the mkan `Amenity` enum, in English and Arabic. |
| `contact-extract.ts` | **G1.6** — pulls phones/WhatsApp/email/socials out of listing text. See its header for the measured yield, which is zero. |
| `contact-hunt.ts` | **G1.6** — runs the extractor over every published field in both locales (pass 1, offline), then emits a per-host operator worksheet of ranked searches (`--worksheet`). Reverse-image first, because hosts cross-post the same photos to Facebook. |
| `sync-contacts-to-twenty.ts` | **G1.6** — writes found channels to Twenty. Fill-empty-never-replace-populated; a conflict becomes a dated note rather than an overwrite. |
| `airbnb-host-profile.ts` | **G1.3** — one visit per host profile: true portfolio size, where they live, languages, verifications, agency suspicion. |
| `sync-twenty-options.ts` | Grows SELECT option lists on live Twenty fields. Refuses removal — options are Postgres enum values, and dropping one strands every record holding it. |
| `backfill-source-ids.ts` | **G1.5** — one-shot: moves the Airbnb↔mkan join key out of the ledger file and into `Listing.sourceListingId` / `User.sourceHostId`. |
| `seed-listing-translations.ts` | **G1.7** — seeds `translation_cache` from Airbnb's own AR/EN so every `localize()` call site renders it with no render-path change. |
| `claim-tokens.ts` | **G1.8** — mints one-time claim links. The 49 provisioned accounts have no recoverable password; this is the only way to hand them over. |
| `twenty-schema.ts` | Source of truth — `Home` (55 fields) + `Host` (32 fields) objects and the `Opportunity` custom fields (14), with Twenty `FieldMetadataType`s, SELECT options, and relations. Mirrors `docs/growth.md` §2.3–§2.5. |
| `twenty-views.ts` | The 10 saved Views (object, type, kanban group-by, columns, sorts, filters). Mirrors §2.8. |
| `seed-twenty-objects.ts` | Idempotent seeder — creates the objects + all fields (incl. the Opportunity fields on the standard object) via Twenty's metadata GraphQL API. |
| `seed-twenty-views.ts` | Idempotent seeder — creates the Views. Run **after** the objects seeder. |
| `airbnb-parse.ts` | **G1.2** — pure parsers over Airbnb's deferred-state JSON → normalized `HomeRecord`/`HostRecord` (field names match the schema). Unit-testable. |
| `airbnb-scrape.ts` | **G1.2** — the scraper: search sweep → PDP enrich (all photos + full data) → writes normalized records to a JSON file. |
| `twenty-upsert.ts` | **G1.2** — reads the scraped file → upserts Home/Host + one Opportunity per new host into Twenty via the REST data API (dedup by external id). |
| `trust-score.ts` | **G1.3** — pure rubric: host + home scores, derived checks, overall blend, hard gates (docs/growth.md §3). Unit-testable. |
| `score-trust.ts` | **G1.3** — worker: scores the local scraped file (default) or re-scores Twenty records (`--apply`). |
| `photo-rehost.ts` | **G1.4** — downloads scraped Airbnb photos → re-uploads to mkan S3/CloudFront (`cdn.databayt.org`) + converts price SR→SDG. |
| `mkan-import.ts` | **G1.5** — provisions `1000@`+ MANAGER accounts + imports trusted homes into the mkan DB as **Busy** (Listing+Location). Writes to mkan (Prisma). |
| `outreach-templates.ts` | **G1.6** — pure AR/EN message templates (first-touch, handover, follow-up), verbatim from docs §5.4. |
| `outreach.ts` | **G1.6** — drafts personalized host messages → outbox (human-send default) or sends via OpenClaw (`--apply`). |
| `wave-publish.ts` | **G1.7** — flips imported listings Busy→Available through the trust gate, per city (the final step). Writes to mkan (Prisma). |

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
- **Growing a SELECT is a different job.** The seeder skips fields that already exist, so it
  can add a field but never change one. `pnpm crm:sync-options` diffs declared options
  against live ones and appends the new ones, passing every existing option back
  byte-identical. It refuses to remove one: Twenty backs each option with a Postgres enum
  value on the record table (`_home.city` is of type `_home_city_enum`), so appending is
  `ALTER TYPE … ADD VALUE` but dropping strands every record holding it.

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

## Photo re-host + SR→SDG (G1.4)

Airbnb's muscache photo URLs can't be hot-linked (mkan's `next.config` only allows
`cdn.databayt.org` / S3 / CloudFront), so before a home can carry real images this worker
downloads every scraped photo and re-uploads it to `cdn.databayt.org/mkan/uploads/<listingId>/`,
and converts the nightly SR price to SDG at a **per-home stored rate** (never hardcoded).

```bash
npx tsx scripts/crm/photo-rehost.ts --fx-rate=160                 # dry plan
npx tsx scripts/crm/photo-rehost.ts --fx-rate=160 --apply         # re-host to S3 + convert
```

Flags: `--in=<scored>` · `--out=<enriched>` · `--fx-rate=<SAR→SDG>` · `--limit=<N>` ·
`--apply`. Enriches the scored file → `.data/airbnb-rehosted.json` with `photosRehosted:true`,
CDN `photoUrls`, `priceNightSdg` + `fxRateSarSdg` + `fxRateDate`; idempotent (re-hosted homes
skipped). Uses the server-side `putObject` in `src/lib/s3.ts`; AWS creds already live in `.env`.
**Verified live**: re-hosted a listing's 21 photos → they serve `200 image/jpeg` from CloudFront.
Feed the enriched file to the import (`mkan-import.ts --in=…/airbnb-rehosted.json`).

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

## Host outreach (G1.6)

Drafts the personalized WhatsApp message per host (AR primary / EN — verbatim §5.4 copy) and
writes an **outbox**. The design's safe default is **human-send** (a person reviews + sends);
`--apply` sends via **OpenClaw** for hosts whose number is known.

```bash
npx tsx scripts/crm/outreach.ts                            # draft first-touch (human-send)
npx tsx scripts/crm/outreach.ts --type=handover --ledger=.data/mkan-import-ledger.json
OPENCLAW_URL=… OPENCLAW_TOKEN=… pnpm crm:outreach --apply  # automate via OpenClaw
```

Flags: `--in=<scored/rehosted>` · `--type=<first-touch|handover|follow-up>` · `--lang=<AR|EN>` ·
`--ledger=<import ledger>` · `--limit=<N>` · `--out=<outbox>` · `--apply`. Scraped hosts have
no phone (Airbnb hides it) → drafts land as `needs-contact-hunt` until a WhatsApp number is on
the host; then `--apply` sends. Full CRM Activity logging awaits the Note/Task fields (below);
OpenClaw's outbound API varies by deployment — adjust the payload in `sendViaOpenClaw`.

## Wave publish (G1.7)

The last step — flip imported listings **Busy → Available** through the trust gate, rolled
out **per city** (Port Sudan first). A listing goes live only when it's `publishReady` (band
passes + host replied + price confirmed + photos re-hosted + no hard gate) and matches the
wave's city.

```bash
npx tsx scripts/crm/wave-publish.ts --city=PORT_SUDAN              # dry plan
FORCE_SEED=1 npx tsx scripts/crm/wave-publish.ts --city=PORT_SUDAN --apply
```

Flags: `--in=<scored>` · `--ledger=<import ledger>` · `--city=<CITY|all>` ·
`--min-band=<AUTO_ONBOARD|MANUAL_REVIEW>` · `--limit=<N>` · `--apply`. Reads eligibility
(`publishReady`/`trustBand`/`city`) from the scored file and the mkan listing id from the
import ledger; `--apply` sets `isPublished:true` + `lastAvailabilityConfirmedAt` on the mkan
Listing (prod-guarded). Only imported + eligible listings flip — verified the gate blocks
scrape-only homes and the per-city filter holds back other-city inventory.

## Keeping the CRM and the site in step

Everything above is a one-way push *into* Twenty. That left the board and the site
free to drift: an operator confirming a price or marking a home REJECT was writing
into a system mkan.sd never read, and a home that went live weeks ago still showed
as `IMPORTED_BUSY` on the board. Three commands close the loop.

```bash
pnpm crm:sync                 # the whole loop, dry run
pnpm crm:sync --apply         # backfill-facts → sync-down → sync-up
```

| Step | Direction | Owns |
|---|---|---|
| `crm:backfill-facts` | scrape → site | amenities, house rules, check-in/out, canonical locale |
| `crm:sync-down` | **Twenty → site** | publish state, price, title/description, host contact |
| `crm:sync-up` | site → Twenty | `mkanPublishState`, `photoCount`, `mkanListingUrl`, `publishedAt`, `mkanAmenities` |

Order is deliberate: down before up, so a decision taken in the CRM this morning
reaches the site before the site reports back what it is showing.

**Field ownership is exclusive, and that is what makes the loop converge.** Amenities
travel *up* only — they are a derivation from the scrape through `amenity-map.ts`, and
the CRM's `mkanAmenities` is a mirror of it. When sync-down also pushed them, backfill
derived 11 from the scrape, sync-down overwrote with the CRM's older 10, and the next
run started again — an endless write loop over the same rows. Anything an operator
decides travels *down*; anything derived travels *up*. Running the loop twice in a row
must report "nothing to do" on the second pass; if it does not, two steps are claiming
the same field.

A listing with `claimedAt` set belongs to its host. sync-down will still take it *off*
the site when Airbnb delists it or the trust band says REJECT, because those are about
whether it may be shown at all — but it will not touch the host's title, price or
description, and it counts what it declined to do.

**On a schedule** (only on the machine hosting Twenty — the REST API is bound to
localhost there):

```bash
bash scripts/crm/units/install.sh            # systemd user timer, every 6h
bash scripts/crm/units/install.sh --status
```

A fresh **scrape** is deliberately not in the loop: it needs a logged-in browser over
CDP, and it is the one step that invents records rather than reconciling them.

## Still to add

- The `Note` / `Task` (Activity) custom fields — `channel`, `host`, `home` (§2.6). Small;
  unlocks logging each outreach touch as a CRM Activity. **This is the only remaining piece —
  G1.1–G1.7 are all built.**

## Full pipeline

```bash
pnpm crm:seed-objects --apply   # G1.1 objects + Opportunity fields
pnpm crm:seed-views   --apply   # G1.1 views
pnpm crm:scrape                 # G1.2 Airbnb → .data/airbnb-scrape.json
pnpm crm:upsert       --apply   # G1.2 → Twenty
pnpm crm:score        --apply   # G1.3 trust scores + bands
pnpm crm:outreach               # G1.6 draft host WhatsApp (human-send) → contact + get agreement
pnpm crm:rehost --fx-rate=<r> --apply             # G1.4 photos → CDN + SR→SDG
pnpm crm:import --in=.data/airbnb-rehosted.json --apply   # G1.5 → mkan (Busy, agreed hosts only)
pnpm crm:publish --city=PORT_SUDAN --apply        # G1.7 trust-gated Busy→Available, per city
```
