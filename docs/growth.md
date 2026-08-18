# Mkan Growth Engine — Airbnb→mkan seeding & CRM lead-gen

> **Status:** design + runbook (docs-first). Implementation (scraper, CRM object seed,
> import/provision scripts) is **Epic G1 (Growth)** — sketched in §5, not built yet.
> **Owner of CRM hygiene:** Aseel (sales). **Last updated:** 2026-07-03.

Mkan launches in Port Sudan and needs **real inventory + real hosts**. Airbnb already has
~117 live Sudan homes with real owners. This document is the blueprint for turning Airbnb
(and later Facebook pages, WhatsApp groups, other rental sites) into a lead pipeline that
ends in **seeded, vetted, live mkan listings whose owners hold their own mkan accounts**.

The loop, in one line: **scrape → judge trust in the CRM → provision the host's account →
hand it over + their pre-loaded listings → follow up → publish only what we trust.**

---

## 1. Overview & the flywheel

```
 SOURCES                 SCRAPE / INGEST         CRM = Twenty (judge + track)     SEED + ONBOARD (mkan)
 airbnb ───┐                                     ┌─ Home   (custom object)        ┌ provision 1000@+ (MANAGER)
 fb pages  ├─▶ scraper ──▶ normalize + dedup ──▶ ├─ Host   (custom object)   ──▶  ├ import listings as Busy
 wa groups ├─  (playwright)   (external id)      └─ Opportunity (onboarding       ├ OpenClaw → WhatsApp handover
 others ───┘                                        pipeline, 1 per host)         └ follow-up → trust gate → LIVE
                               ▲                            │                                 │
                          Slack alerts ◀───────────────────┴──── trust score ◀───────────────┘
```

**The surfaces and their jobs**

| Surface | Role in the engine |
| --- | --- |
| **Airbnb** (+ fb pages, wa groups, other rental sites) | Lead sources — where real homes/hosts are discovered and scraped. |
| **Twenty CRM** (`mkan.databayt.org`) | The **hub**. Every scraped home/host lands here, gets a **trust score**, and moves through the **onboarding pipeline**. Nothing reaches mkan un-vetted. |
| **mkan app** | The destination. Trusted homes become `Listing`s; real hosts get `MANAGER` accounts and manage their own listings. |
| **OpenClaw** | The outreach channel — bridges WhatsApp (and Telegram/Slack) to an AI agent that drafts/sends host messages. Self-hosted on the same local box as the Twenty backend. |
| **Slack** | Team notifications — new high-trust leads, replies received, follow-ups due. |

**City rollout (waves).** We scrape **all of Sudan** and tag every record by `city`, but we
**publish in waves**: **Port Sudan first** (matches the current launch + all existing
seeds), **Khartoum next** (the largest Airbnb market, ~108 homes), then the rest. Going
**Live is gated per-city and per-trust** — the CRM tracks everything; publishing is a
deliberate, staged decision, never a bulk flip.

**Glossary**

- **Home** — one scraped listing (Airbnb or other source). A CRM custom object.
- **Host** — the owner we vet and contact. A CRM custom object. Becomes a mkan `User`
  (`role = MANAGER`) once onboarded.
- **Opportunity** — one onboarding "deal" per host, moving through the pipeline stages.
- **Trust score / band** — 0–100 computed judgment of how far a home/host can be trusted;
  the gate that decides what goes Live.
- **Busy vs Available** — mkan publish states. `isPublished:false` = **Busy** (hidden);
  `isPublished:true` = **Available** (in search). Imported homes start **Busy**.
- **Provision** — allocate the next `1000@mkan.org`+ account and attach the host's listings.

---

## 2. CRM workspace design (real Twenty) — "the right columns"

The live CRM is **real [Twenty](https://github.com/twentyhq/twenty)** — React frontend on
Vercel, NestJS/GraphQL/PostgreSQL backend on the local machine. This section is the
authoritative column design.

> **Verify-when-live:** exact `Address` subfields and any version-specific field options
> should be reconfirmed in **Settings → Data Model** once the local backend is running
> (design below follows Twenty's documented data model).

### 2.1 Twenty specifics that shape the design

- **Objects/fields** are created in **Settings → Data Model** (`+ Add Field`), or
  reproducibly via the **metadata GraphQL API** / Twenty SDK (`defineObject` +
  `npx twenty app:publish`). We add two **custom objects** (`Home`, `Host`) and **custom
  fields on standard `Opportunity` / `Note` / `Task`**.
- **Field types** available: `Text, Number, Currency, Date, Date-time, Boolean, Select,
  Multi-select, Relation, Rating (1–5 stars), Links (multiple URLs), Emails, Phones,
  Address (composite + lat/lng), JSON, Array, Full name`.
  - `Rating` is **1–5 stars only** → Airbnb's `4.87` average goes in a **`Number`** field;
    `Rating` is used only for the human `photo_quality` (1–5).
  - `Multi-select` maps the mkan `Amenity`/`Highlight` enums. `Links` holds the photo-URL
    list + external URLs. `Address` holds each Home's location (incl. lat/lng subfields).
    `JSON` holds the lossless raw amenity blob. `Phones`/`Emails` hold host contacts.
- **Kanban groups by a `Select` on the same object** → the funnel is the `Opportunity`
  board grouped by a custom **`onboarding_stage` Select**; per-home state is a **`home_status`
  Select** → a second Kanban on `Home`.
- **Views filter within a single object** → trust scores are **denormalized onto `Home`**
  (and `host_trust_band` copied onto `Opportunity`) so those Kanbans/tables can filter them.
- **Ingest / import / scoring / automation** run through Twenty's **GraphQL/REST API**
  (records) and **Workflows** (auto follow-ups) — backend + OpenClaw share the local box.

### 2.2 Object model

| Entity | Verdict | Why |
| --- | --- | --- |
| **Home** | **Custom object** | One row per scraped listing; ~44 typed attributes + its own status machine. |
| **Host** | **Custom object** | A scraped host is an anonymous handle with trust telemetry — not yet a verified person. Kept separate from standard **People**, with an optional `person` relation to bridge in once identity is confirmed. |
| **Onboarding funnel** | **Standard `Opportunity`, one per host** | Outreach, the single `1000@` account, and the trust conversation are all host-scoped (one WhatsApp thread per host). The custom `onboarding_stage` Select is the real funnel; standard `stage` is kept as a coarse mirror. |
| **Outreach touches** | **Standard `Note`/`Task`** (Activity) | Every message/call/visit + every follow-up, linked to `Host` (and optionally `Home`). |
| Companies | Unused for now | Reserve for agencies/hotel operators if that vertical opens. |

**Relations** (Twenty relations are many-to-one from the declaring side):

| Field | On | → Target | Reads as |
| --- | --- | --- | --- |
| `host` | Home | Host | many homes → one host |
| `duplicate_of` | Home | Home (self) | dup → canonical home |
| `host` | Opportunity | Host | one opportunity per host *(convention-enforced; see view #10)* |
| `host` / `home` | Note/Task | Host / Home | many touches → one host (home optional) |
| `person` | Host | People (standard) | optional bridge once identity verified |

### 2.3 `Home` fields (custom object · icon `house`)

Convention: `name` (snake_case) · **Type** = Twenty field type · **Auto** = written by the
scraper/scoring worker, not by hand. All business fields nullable.

**Identity & source**

| Field | Type | Options / notes | Purpose |
| --- | --- | --- | --- |
| `name` | Text | required (record label) | Working name; defaults to the Airbnb title. |
| `source` | Select | `AIRBNB, FACEBOOK, WHATSAPP, REFERRAL, FIELD_SCOUT, OTHER` | Where this home came from. |
| `airbnb_listing_id` | Text | dedupe key with `source` (ingest-enforced) | External id from the search payload. |
| `airbnb_url` | Links | | Back-link to the live listing for vetting. |
| `scraped_at` | Date-time | Auto | First ingest time. |
| `last_synced_at` | Date-time | Auto | Last successful re-scrape. |
| `still_listed` | Boolean | Auto | Flipped false when a re-scrape 404s (a delisting is itself a signal). |

**Content**

| Field | Type | Options / notes | Purpose |
| --- | --- | --- | --- |
| `title` | Text | | Verbatim Airbnb title. |
| `description` | Text | long | Verbatim description. |
| `room_type` | Select | `ENTIRE_HOME, PRIVATE_ROOM, SHARED_ROOM, HOTEL_ROOM` | Drives PropertyType mapping + hotel screen. |
| `airbnb_category` | Text | e.g. "Entire rental unit", "Entire villa" | Raw category; input to PropertyType. |
| `city` | Select | `KHARTOUM, OMDURMAN, BAHRI, EAST_NILE, PORT_SUDAN, OTHER` | Normalized city (Kanban/filter-able); wave rollout key. |
| `address` | Address | district/city/state/postcode/country + **lat/lng** subfields | Full geocoded location → mkan `Location`. |
| `bedrooms` | Number | | Scraped. |
| `beds` | Number | | Scraped (CRM-only; no mkan field — optionally appended to description at import). |
| `bathrooms` | Number | supports 1.5 | Scraped. |
| `guest_capacity` | Number | | Scraped → mkan `guestCount`. |

**Amenities & photos**

| Field | Type | Options / notes | Purpose |
| --- | --- | --- | --- |
| `amenities_raw` | JSON | full scraped list | Lossless amenity data. |
| `mkan_amenities` | Multi-select | the **13** `Amenity` enum values (§4.4) | Mapped subset; ops can correct chips. |
| `mkan_highlights` | Multi-select | the **15** `Highlight` enum values (§4.4) | Mapped/manual highlights. |
| `pets_allowed` | Boolean | | From amenities → mkan `isPetsAllowed`. |
| `parking_included` | Boolean | | Free-parking present → mkan `isParkingIncluded`. |
| `photo_urls` | Links | **ALL** scraped photo URLs | Every image for the home. |
| `photo_count` | Number | Auto | Trust input. |
| `cover_photo_url` | Links | | Hero photo for quick eyeballing. |
| `photos_rehosted` | Boolean | Auto | muscache hotlinks rot/block — import requires re-hosting first. |

**Pricing**

| Field | Type | Options / notes | Purpose |
| --- | --- | --- | --- |
| `price_night_sar` | Currency (SAR) | | Scraped nightly price, verbatim (Airbnb displays SR). |
| `fx_rate_sar_sdg` | Number | Auto | Rate used at conversion — the parallel-market rate we actually price at. Never hardcoded (SDG is volatile). |
| `fx_rate_date` | Date | Auto | When the rate was captured. |
| `price_night_sdg` | Currency (SDG) | Auto | `round_clean(price_night_sar × fx_rate_sar_sdg)` → mkan `pricePerNight`. |
| `price_confirmed_by_host` | Boolean | | Airbnb prices carry platform-fee inflation — host confirms the direct price (Daqna precedent: prices are estimates until the owner confirms). |
| `price_sanity_ratio` | Number | Auto | `price_night_sdg ÷ median(city, room_type)`. Rubric input. |

**Reputation & derived checks** (raw trust signals)

| Field | Type | Options / notes | Purpose |
| --- | --- | --- | --- |
| `avg_rating` | Number | 0–5 decimal (NOT Rating) | Scraped average. |
| `review_count` | Number | | Scraped count. |
| `photo_quality` | Rating | 1–5 | Human eyeball score after opening the gallery. |
| `data_completeness_pct` | Number | 0–100 | Auto (§3.2 formula). |
| `location_check` | Select | `PASS, SUDAN_ONLY, FAIL, UNCHECKED` | Auto — coords in Sudan + ≤25 km of claimed city. |
| `duplicate_check` | Select | `NONE, SUSPECTED, CONFIRMED, UNCHECKED` | Auto-suggest (coords <100 m + similar title/photos), human confirms. |
| `hotel_agency_check` | Select | `PASS, LARGE_PORTFOLIO, HOTEL, UNCHECKED` | Auto — hotel type/category, or host portfolio size. |

**Trust (computed, §3)**

| Field | Type | Options / notes |
| --- | --- | --- |
| `home_trust_score` | Number | Auto — home-signal total, 0–100. |
| `overall_trust_score` | Number | Auto — blended; **denormalized here so Home views can filter it**. |
| `trust_band` | Select | `AUTO_ONBOARD, MANUAL_REVIEW, HOLD, REJECT, UNSCORED` |
| `trust_band_override` | Select | same minus UNSCORED — human final say, wins over computed. |
| `override_reason` | Text | required in practice when overriding. |
| `scored_at` | Date-time | Auto. |
| `rubric_version` | Text | e.g. `v1` — lets weights evolve without corrupting old scores. |

**mkan integration & status**

| Field | Type | Options / notes |
| --- | --- | --- |
| `host` | Relation → Host | owner. |
| `duplicate_of` | Relation → Home | canonical record when `duplicate_check = CONFIRMED`. |
| `home_status` | Select | `SCRAPED, SCORED, READY_FOR_IMPORT, IMPORTED_BUSY, LIVE, REJECTED, DUPLICATE, DELISTED` — per-home Kanban group. |
| `mkan_property_type` | Select | `Apartment, Villa, Townhouse, Cottage, Tinyhouse, Rooms` (exact enum spellings). |
| `mkan_listing_id` | Number | `Listing.id` after import. |
| `mkan_listing_url` | Links | deep link to the mkan listing. |
| `imported_at` | Date-time | when seeded as Busy. |
| `mkan_publish_state` | Select | `NOT_IMPORTED, IMPORTED_BUSY, LIVE, UNPUBLISHED` — mirrors `isPublished` reality. |
| `published_at` | Date-time | first flip to Available. |
| `publish_ready` | Boolean | Auto — band passes + host stage ≥ ONBOARDING + `price_confirmed_by_host` + `photos_rehosted`. Single-object filter for the "ready to go Live" view. |

### 2.4 `Host` fields (custom object · icon `user-round-check`)

**Profile (scraped)**

| Field | Type | Options / notes |
| --- | --- | --- |
| `name` | Text | required — host display name. |
| `source` | Select | `AIRBNB, FACEBOOK, WHATSAPP, REFERRAL, FIELD_SCOUT, OTHER`. |
| `airbnb_host_id` | Text | ingest-enforced dedupe key. |
| `airbnb_profile_url` | Links | for vetting. |
| `avatar_url` | Links | scraped profile photo (optionally re-host → `User.image`). |
| `superhost` | Boolean | scraped badge — trust input. |
| `host_since` | Date | parsed from "Hosting since 2019" — tenure. |
| `response_rate` | Number | 0–100 where visible. |
| `response_time` | Select | `WITHIN_HOUR, FEW_HOURS, WITHIN_DAY, FEW_DAYS, UNKNOWN`. |
| `airbnb_listings_count` | Number | portfolio size — agency signal. |
| `portfolio_reviews_total` | Number | Auto — Σ review_count over their homes. |
| `portfolio_avg_rating` | Number | Auto — weighted average. |

**Contact & verification**

| Field | Type | Options / notes |
| --- | --- | --- |
| `phone` | Phones | best voice number (Airbnb never exposes it — this is the contact-hunt output). |
| `whatsapp` | Phones | the OpenClaw outreach channel. |
| `whatsapp_status` | Select | `UNKNOWN, INVALID, VALID_DELIVERED` — delivery observed ⇒ number is real (trust input). |
| `email` | Emails | rarely available. |
| `facebook_url` | Links | cross-source corroboration anchor. |
| `contact_found_via` | Select | `AIRBNB_PROFILE, FACEBOOK, MUTUAL_CONTACT, FIELD_SCOUT, PUBLIC_DIRECTORY, OTHER`. |
| `preferred_language` | Select | `AR, EN` — outreach templating. |
| `identity_verified` | Select | `UNVERIFIED, NAME_MATCHED, OWNERSHIP_CLAIMED, ID_SEEN` — identity ladder. |
| `cross_source_corroborated` | Select | `NONE, PARTIAL, CONFIRMED`. |
| `agency_suspected` | Boolean | generic branding / bulk listings → trust penalty. |
| `person` | Relation → People | bridge to standard CRM person once identity is real. |
| `notes` | Text | pinned summary (details go in Notes/Tasks). |

**Trust & mkan account**

| Field | Type | Options / notes |
| --- | --- | --- |
| `host_trust_score` | Number | Auto (§3.1). |
| `host_trust_band` | Select | `TRUSTED, PROMISING, HOLD, LOW, UNSCORED`. |
| `host_scored_at` | Date-time | Auto. |
| `mkan_account_email` | Emails | assigned account, e.g. `1000@mkan.org` (real-host range starts at **1000**, clear of the seeded `0001–0100` demo pool). |
| `mkan_username` | Text | `1000` — username == the number (login scheme). |
| `mkan_user_id` | Text | cuid of the mkan `User` — hard link for sync. |
| `account_provisioned_at` | Date-time | MANAGER account created. |
| `credentials_sent_at` | Date-time | WhatsApp delivery of number + password. |
| `first_login_at` | Date-time | Auto (from `User.lastLogin`) — host actually showed up (strong engagement signal). |

### 2.5 `Opportunity` custom fields (one per host)

Repurpose standard fields: `name` = `"Onboard {host} — {n} homes"` · `amount`+`currency` =
Σ `price_night_sdg` across the host's homes (currency SDG) · `stage` = coarse mirror
(`NEW`←SCRAPED · `QUALIFIED`←CONTACTED · `PROPOSAL`←IN_CONVERSATION/ONBOARDING/TRUST_REVIEW
· `WON`←LIVE · `LOST`←any sink) · `close_date` = target go-live.

| Field | Type | Options / notes |
| --- | --- | --- |
| `host` | Relation → Host | the funnel subject (one per host). |
| `onboarding_stage` | Select | the **11** stages (§2.7) — **the Kanban group field**. |
| `stage_changed_at` | Date-time | staleness detection. |
| `host_trust_band` | Select | denormalized copy so cards/filters show trust (views can't join). |
| `homes_count` | Number | Auto — portfolio size. |
| `publish_ready_homes` | Number | Auto — homes with `publish_ready = true`. |
| `live_homes` | Number | Auto — homes published on mkan. |
| `outreach_channel` | Select | `WHATSAPP, CALL, FACEBOOK, IN_PERSON, OTHER`. |
| `outreach_attempts` | Number | sends without reply (drives UNREACHABLE rule). |
| `first_contacted_at` / `last_outreach_at` | Date-time | first send / follow-up ordering. |
| `replied_at` | Date-time | first host reply — the big trust unlock. |
| `next_follow_up_at` | Date-time | when to ping again. |
| `decline_reason` | Select | `NOT_INTERESTED, ALREADY_BOOKED_FULL, PRICE_DISAGREEMENT, DISTRUSTS_PLATFORM, PROPERTY_UNAVAILABLE, WAR_DISPLACEMENT, OTHER` — `WAR_DISPLACEMENT` matters (many Khartoum hosts are displaced and may re-engage). |

### 2.6 `Note` / `Task` (Activity) — additions & conventions

Custom fields: `host` (Relation → Host) · `home` (Relation → Home, optional) · `channel`
(Select `WHATSAPP, CALL, SMS, EMAIL, IN_PERSON, OPENCLAW_AUTO`).

Logging conventions: outbound/inbound WhatsApp → a **Note** + `channel=WHATSAPP`
(`OPENCLAW_AUTO` when the bot sent it) · phone call → Note `channel=CALL` · field visit /
key handover → Note `channel=IN_PERSON` · every follow-up → a **Task** with due date +
status, linked to `host` + the opportunity.

### 2.7 Onboarding pipeline stages (`onboarding_stage`, Kanban order)

| # | Stage | Entry | Exit |
| --- | --- | --- | --- |
| 1 | `SCRAPED` | Ingest created host+homes+opportunity; rubric ran. | Someone starts the contact hunt → 2. Already in mkan → `DUPLICATE`. |
| 2 | `CONTACT_HUNT` | Actively hunting a reachable channel (Airbnb hides phones → FB, mutual contacts, field scouts). | `whatsapp` on file + first message sent → 3. All avenues exhausted → `UNREACHABLE`. |
| 3 | `CONTACTED` | ≥1 WhatsApp send logged (`first_contacted_at`), no reply. | Host replies (`replied_at`) → 4. **3 attempts / 21 days, no reply → `UNREACHABLE`.** Number invalid → back to 2. |
| 4 | `IN_CONVERSATION` | Host replied; pitching mkan, verifying ownership, confirming specs + direct SDG prices. | Verbal yes → 5. Explicit no → `DECLINED`. Agency/hotel/fake → `REJECTED_LOW_TRUST` (or `DUPLICATE`). |
| 5 | `ONBOARDING` | Host agreed. Back-office: allocate next `≥1000` number, create MANAGER account, re-host photos, import homes **Busy**, send credentials. | Account provisioned + vetted homes `IMPORTED_BUSY` + `credentials_sent_at` → 6. Silent >30 days → `DECLINED`. |
| 6 | `TRUST_REVIEW` | Homes sit in mkan as Busy. The human decision: how far do we trust home+host; which homes flip. | ≥1 home flipped Available → `LIVE`. All fail → `REJECTED_LOW_TRUST`. |
| 7 | `LIVE` | **Success.** ≥1 home published; ongoing care (availability nudges) as Tasks. | (fully delisted later → reopen or mark homes `DELISTED`). |
| 8 | `DECLINED` | **Sink** — host said no (`decline_reason`). | Revisit quarterly; `WAR_DISPLACEMENT`/timing declines can reopen → 4. |
| 9 | `UNREACHABLE` | **Sink** — no channel, or 3 sends/21 days, or invalid number. | New contact info → 2. |
| 10 | `DUPLICATE` | **Sink** — already in CRM/mkan (`duplicate_of` set). | Never reopens; merge into canonical. |
| 11 | `REJECTED_LOW_TRUST` | **Sink** — hard-fail or human verdict (fake/hotel/agency/unsafe). | Reopens only on materially new evidence. |

Per-home mirror (`home_status`): `SCRAPED → SCORED → READY_FOR_IMPORT → IMPORTED_BUSY →
LIVE`, sinks `REJECTED / DUPLICATE / DELISTED`.

### 2.8 Views (Aseel's pinned set)

View config = `{ filters, sorts, visibleFields, groupBy }`; ops `eq neq contains
starts_with gt gte lt lte is_empty is_not_empty`, one AND/OR group, own-object columns only.

| # | View | Object · type | groupBy / filter / sort |
| --- | --- | --- | --- |
| 1 | **Onboarding pipeline** | Opportunity · kanban | group `onboarding_stage`; hide the 4 sinks |
| 2 | **Homes — to vet** | Home · table | `trust_band = MANUAL_REVIEW` AND `home_status = SCORED`; sort `overall_trust_score` desc |
| 3 | **Contacted — awaiting reply** | Opportunity · table | `onboarding_stage = CONTACTED`; sort `last_outreach_at` asc (stalest first) |
| 4 | **Trusted — ready to go Live** | Home · table | `publish_ready = true` AND `mkan_publish_state = IMPORTED_BUSY`; sort `overall_trust_score` desc |
| 5 | **Duplicates & rejects** | Home · table | `home_status = REJECTED` OR `= DUPLICATE` |
| 6 | **Hosts — best next outreach** | Host · table | `host_trust_score ≥ 40` AND `mkan_account_email is_empty` AND `whatsapp is_not_empty`; sort score desc |
| 7 | **Home inventory board** | Home · kanban | group `home_status` (no filter) |
| 8 | **Follow-ups due** | Task · table | `status ≠ DONE`; sort `due_date` asc |
| 9 | **Live on mkan** | Home · table | `mkan_publish_state = LIVE`; sort `published_at` desc |
| 10 | **Duplicate funnels (hygiene)** | Opportunity · table | sort `host` asc — adjacent same-host rows reveal an accidental second opportunity |

Views 1 & 4 are the daily drivers; 2 & 6 the weekly vetting/prospecting queues; 5 & 10 hygiene.

---

## 3. Trust-scoring rubric

Two 0–100 scores + a blended overall, computed by the scoring worker on every sync and
whenever ops edits a raw signal. Humans override only via `trust_band_override` + reason.

### 3.1 Host trust → `host.host_trust_score`

| Signal | Weight | From | Scoring |
| --- | --- | --- | --- |
| Superhost | 12 | `superhost` | true → 12 |
| Tenure | 12 | `host_since` | ≥5y →12 · ≥3y →9 · ≥1y →5 · <1y →2 · unknown →0 |
| Portfolio reviews | 15 | `portfolio_reviews_total` | ≥100 →15 · ≥30 →10 · ≥10 →6 · ≥1 →3 |
| Response rate | 8 | `response_rate` | ≥90 →8 · ≥70 →5 · ≥50 →2 |
| Response time | 4 | `response_time` | WITHIN_HOUR →4 · FEW_HOURS →3 · WITHIN_DAY →1 |
| **Contact reachability** | 15 | `whatsapp_status`, `phone`, `facebook_url` | VALID_DELIVERED →15 · phone untested →8 · social-only →4 |
| **Outreach engagement** | 25 | opp `replied_at`, `onboarding_stage`, `identity_verified` | replied & stage ≥ IN_CONVERSATION →25 · replied once →15 · delivered no reply →3 |
| Cross-source corroboration | 9 | `cross_source_corroborated` | CONFIRMED →9 · PARTIAL →4 |
| **Agency penalty** | −15 | `agency_suspected` or `airbnb_listings_count > 8` | subtract 15, floor 0 |

Positives sum to 100. **Deliberate ceiling:** a scrape-only host maxes ~51 (+9 with desk
corroboration) — nobody is "trusted" until reachable **and** replied. Bands: **TRUSTED ≥70
· PROMISING 45–69 · HOLD 25–44 · LOW <25**.

### 3.2 Home trust → `home.home_trust_score`

| Signal | Weight | From | Scoring |
| --- | --- | --- | --- |
| Guest rating | 18 | `avg_rating` | ≥4.8 →18 · ≥4.5 →14 · ≥4.0 →9 · ≥3.5 →4 · unrated →6 (neutral prior — new ≠ bad) |
| Review depth | 12 | `review_count` | ≥50 →12 · ≥20 →9 · ≥5 →6 · ≥1 →3 |
| Photo coverage | 10 | `photo_count` | ≥10 →10 · ≥6 →7 · ≥3 →4 |
| Photo quality | 6 | `photo_quality` | 5 →6 · 4 →5 · 3 →3 |
| Price sanity | 10 | `price_sanity_ratio` | 0.5–2.0 →10 · 0.33–3.0 →5 |
| Data completeness | 10 | `data_completeness_pct` | pct × 10 (10 core fields: title, description ≥100 chars, bedrooms, beds, bathrooms, guest_capacity, coords, ≥5 raw amenities, ≥3 photos, price) |
| Location plausibility | 12 | `location_check` | PASS →12 · SUDAN_ONLY →5 · FAIL →0 |
| Uniqueness | 12 | `duplicate_check` | NONE →12 · else →0 (routes to DUPLICATE) |
| Not hotel/agency | 10 | `hotel_agency_check` | PASS →10 · LARGE_PORTFOLIO →5 · HOTEL/SHARED →0 |

### 3.3 Overall, bands, hard gates → on `home`

`overall_trust_score = round(0.45 × host_trust_score + 0.55 × home_trust_score)` —
home-weighted (publish is per-home) but a bad host caps everything.

| Band | Score | Action |
| --- | --- | --- |
| `AUTO_ONBOARD` | ≥75 | Pre-approved to flip Live once the host confirms (a human still clicks — the one-click-yes list). |
| `MANUAL_REVIEW` | 55–74 | Default: open photos/URL, sanity-check, decide. |
| `HOLD` | 35–54 | Stay Busy; needs more signal (photos, price confirmation, corroboration, engagement). |
| `REJECT` | <35 | Rejection candidate → `REJECTED_LOW_TRUST` on confirm. |

**Hard gates override any score:** `duplicate_check = CONFIRMED` → never publish ·
`location_check = FAIL` → REJECT · `hotel_agency_check = HOTEL` → excluded from this
pipeline · **no host reply ⇒ never Live** (publishing without consent creates bookings
nobody honors) · `photos_rehosted = false` ⇒ `publish_ready` stays false.

---

## 4. Scraping pipeline

### 4.1 Airbnb Sudan — mechanics

Scrape path reuses the repo's existing capture tooling pattern (`.clone/` Playwright +
the vault Chrome on `:9222`, a logged-in session reused read-only — see the
[auth session vault](../CLAUDE.md) note).

1. **Discovery** — load each city search (`/s/Khartoum--Sudan/homes`, `/s/Port-Sudan--Sudan/homes`,
   …). Each page carries one `data-deferred-state` JSON (~300 KB) with, per card: external
   id, name, coordinate, avg rating, room type, beds/baths/bedrooms, and a photo set. The
   result header states the total (e.g. "117 homes"). Paginate to collect every card.
2. **Detail (PDP)** — for each listing id, open the **per-listing detail page** to get the
   **complete data + ALL photos**: full description, the entire amenity list, the full
   photo tour (every image URL), house rules, host block (name, superhost, host-since,
   response rate/time, listings count), and precise coordinates.
3. **Normalize** → a `Home` + `Host` record shape (§2), mapping fields per §4.4.
4. **Upsert into Twenty** via its **GraphQL/REST API** (API key), deduping by
   `(source, airbnb_listing_id)` and `(source, airbnb_host_id)`. New host → also create one
   `Opportunity` at `onboarding_stage = SCRAPED`.
5. **Score** — run the rubric (§3), write `*_trust_score`/`trust_band`/derived checks, and
   maintain denormalized copies (`overall_trust_score` on Home, `host_trust_band` on
   Opportunity, the count fields).
6. **Re-sync** on a cadence (below) to refresh price/rating/availability and flip
   `still_listed` when a listing 404s.

### 4.2 Photo re-hosting (required before import)

mkan's `next.config.ts` `remotePatterns` allow only `*.amazonaws.com`, `*.cloudfront.net`,
`cdn.databayt.org` — **Airbnb `muscache` URLs cannot be hot-linked** (and they rot/block).
So the import step **downloads every photo and re-uploads** to mkan blob storage
(`src/lib/s3.ts` presign → `mkan/uploads/<hostId>/…` on `cdn.databayt.org`), then stores
the resulting CDN URLs in `Listing.photoUrls`. `photos_rehosted` gates `publish_ready`.

### 4.3 Currency (SR → SDG)

Airbnb displays **SR (Saudi Riyal)** for our session. mkan prices in **SDG**. Conversion is
`price_night_sdg = round_clean(price_night_sar × fx_rate_sar_sdg)` where the rate is the
**parallel-market SAR→SDG rate captured per home** (`fx_rate_sar_sdg` + `fx_rate_date`) —
**never a hardcoded constant** (SDG is volatile). The converted price is an **estimate**
until `price_confirmed_by_host` (Airbnb's shown price includes platform fees; the host's
direct price differs).

### 4.4 Field mapping — Airbnb → CRM → mkan

**Listing-level**

| Airbnb | CRM (`home.`) | Transform | mkan |
| --- | --- | --- | --- |
| listing id / URL | `airbnb_listing_id` / `airbnb_url` | verbatim; dedupe key | — (provenance) |
| title | `title` (+ `name`) | verbatim (AR/EN kept; mkan translation cache localizes) | `Listing.title` |
| description | `description` | verbatim; may append " · {beds} beds" | `Listing.description` |
| room type + category | `room_type`, `airbnb_category` → `mkan_property_type` | **PropertyType map:** rental unit/condo/apartment/serviced/loft → `Apartment` · villa/entire house/home → `Villa` · townhouse → `Townhouse` · guesthouse/cottage/bungalow/farm → `Cottage` · tiny home → `Tinyhouse` · PRIVATE_ROOM/SHARED_ROOM → `Rooms` · **HOTEL_ROOM/hotel → excluded (hard gate)** | `Listing.propertyType` |
| city + coords | `city`, `address` | normalize city; reverse-geocode district | `Location{ address = district+", "+city, city, state (Khartoum-area→"Khartoum", Port Sudan→"Red Sea"), country="Sudan", postalCode (city default, required), latitude, longitude }` |
| bedrooms / bathrooms / guests | `bedrooms` / `bathrooms` / `guest_capacity` | int / float / int | `Listing.bedrooms` / `bathrooms` / `guestCount` |
| beds | `beds` | int | (no mkan field) |
| amenities list | `amenities_raw` → `mkan_amenities` | **Amenity map** → subset of the 13 enum values: Wifi→`WiFi` · fast wifi/≥25 Mbps→+`HighSpeedInternet` · A/C→`AirConditioning` · washer or dryer→`WasherDryer` · Dishwasher→`Dishwasher` · Microwave→`Microwave` · Fridge→`Refrigerator` · Pool→`Pool` · Gym→`Gym` · parking→`Parking` (free ⇒ `parking_included`) · Pets→`PetsAllowed` (⇒ `pets_allowed`) · Walk-in closet→`WalkInClosets` · Hardwood→`HardwoodFloors` | `Listing.amenities`, `isPetsAllowed`, `isParkingIncluded` |
| amenities + description | `mkan_highlights` | **Highlight map** → subset of the 15: fast wifi→`HighSpeedInternetAccess` · washer+dryer→`WasherDryer` · A/C→`AirConditioning` · Heating→`Heating` · no-smoking→`SmokeFree` · cable→`CableReady` · satellite→`SatelliteTV` · view keywords→`GreatView` · quiet/هادئ→`QuietNeighborhood` · central/transit→`CloseToTransit` · renovated/جديد→`RecentlyRenovated` | `Listing.highlights` |
| ALL photos | `photo_urls`, `photo_count`, `cover_photo_url` | **re-host** every URL to CDN (§4.2) | `Listing.photoUrls` (CDN URLs only) |
| price (SR) | `price_night_sar` → `price_night_sdg` | §4.3; host confirms | `Listing.pricePerNight` (SDG) |
| avg rating / reviews | `avg_rating` / `review_count` | float / int | `Listing.averageRating` / `numberOfReviews` — *product call: carry Airbnb reputation in; disclose provenance in UI* |
| — (import) | `home_status`, `imported_at` | set `draft:false, isPublished:false` (**Busy**), `postedDate = imported_at` | `Listing.draft`, `isPublished`, `postedDate` |
| — (human flip) | `mkan_publish_state`, `published_at` | TRUST_REVIEW → `isPublished:true` (**Available**) | `Listing.isPublished` |

**Host-level**

| Airbnb | CRM (`host.`) | Transform | mkan |
| --- | --- | --- | --- |
| host name | `name` | verbatim | *not pre-set — `User` has no name; owner personalizes on first login* |
| host id / profile URL | `airbnb_host_id` / `airbnb_profile_url` | verbatim, dedupe | — |
| superhost / host-since / response | `superhost` / `host_since` / `response_*` | parse | — (trust inputs) |
| avatar | `avatar_url` | verbatim | optionally re-host → `User.image` |
| (hunted) phone/WA | `phone` / `whatsapp` | E.164 | `User.phoneNumber` (powers click-to-call) |
| — (provision) | `mkan_account_email/username/user_id`, `account_provisioned_at`, `credentials_sent_at` | allocate next free ≥1000: `User{ email:"1000@mkan.org", username:"1000", role:MANAGER, emailVerified }`; set every `Listing.hostId` | `User` + `Listing.hostId` |
| — | `first_login_at` | sync from `User.lastLogin` | — (engagement) |

### 4.5 Cadence & other sources

- **Cadence:** an initial full sweep, then a weekly re-sync of already-tracked homes
  (price/rating/availability + `still_listed`). Keep request rate low and reuse the one
  logged-in session — this is light, respectful collection, not a firehose.
- **Extension hooks:** the same `Home`/`Host` shape accepts other sources via `source` —
  **Facebook pages** and **WhatsApp groups** (manual or semi-automated capture into the
  same CRM objects), and **other rental sites** later. The trust rubric already rewards
  `cross_source_corroborated`, so a home found on two sources scores higher.

### 4.6 Legal, ToS & consent (read before running)

This is deliberately called out — it's the user's decision to proceed; these are the facts
and the guardrails the design builds in:

- **Airbnb ToS prohibits automated scraping.** The data is publicly visible, but automated
  collection is against their terms; there is account/IP risk. Mitigations: low request
  rate, reuse of a normal logged-in session, no aggressive crawling, and treating the data
  as *leads to verify*, not a database to republish wholesale.
- **Hosts have not consented to outreach.** First contact is **human-reviewed** by default
  (§5.3); messages identify who we are and why; **honor any opt-out immediately** (mark
  `DECLINED`, never re-contact).
- **Never publish a host's listing without their explicit yes.** This is enforced as a
  **hard gate** (no reply ⇒ never Live) — a home sits **Busy** until the owner confirms.
- **Re-hosted photos / copied text** carry the original owner's rights — acceptable when we
  are onboarding *that owner* to manage *their own* listing; not for anonymous republishing.

---

## 5. Host onboarding & outreach

### 5.1 Account numbering & provisioning

- **Real scraped hosts get `1000@mkan.org`+** — `1000, 1001, 1002, …`, allocated in order,
  **mint-forward, never recycled**. This keeps them clear of the seeded demo pool
  (`0001–0100`, see [ACCOUNTS.md](../ACCOUNTS.md)).
- **Account shape** (matches the seed convention): `User{ email:"<n>@mkan.org",
  username:"<n>", role: MANAGER, emailVerified: now, password: bcrypt(bootstrap) }`.
  `emailVerified` is **required** — credentials login rejects unverified users. Login is by
  **the number alone** (`1000`) or the email; session lasts ~1 year.
- **Bootstrap password** is per-host and delivered over WhatsApp; the host rotates it (or
  we set a memorable one and ask them to change it). Never commit passwords to the repo.

### 5.2 Listing hand-over "through the app"

Provisioning attaches the host's vetted homes to their new account (`Listing.hostId =
mkan_user_id`), imported **Busy**. When the host logs in they land on `/hosting/listings`
and see **their own listings already there** — photos, price, specs pre-filled — ready to
review, edit, and (once we flip them) manage. The message they receive contains their
number + password + a link; the "wow" is that their homes are already inside.

### 5.3 Outreach modes (both supported)

OpenClaw (WhatsApp bridge) **drafts** the message in the host's `preferred_language`. Two modes:

- **Human-send (default for first contact).** The draft is queued for a person (Aseel /
  Moed) to review and send — safest for consent + ToS. Logged as a Note `channel=WHATSAPP`.
- **Automated (follow-ups for already-contacted hosts).** OpenClaw auto-sends templated
  follow-ups on the `next_follow_up_at` schedule via a Twenty **Workflow** or a worker.
  Logged as a Note `channel=OPENCLAW_AUTO`.

Mode is a **per-stage** choice, not all-or-nothing. Every send, reply, and draft is a CRM
Activity; Slack notifies the team on new high-trust leads and on replies.

### 5.4 Message templates (AR primary / EN)

**First touch — Arabic**
```
السلام عليكم {الاسم} 👋
لقينا إعلان بيتك الجميل في {المدينة} على Airbnb.
احنا منصة مكان (mkan) — سوق تأجير سوداني. جهّزنا ليك حساب فيه إعلاناتك
جاهزة، تقدر تديرها بنفسك وتوصل ضيوف من داخل السودان بدون عمولات المنصات
العالمية. تحب نوريك كيف؟
```
**First touch — English**
```
Hello {name} 👋
We found your lovely {city} place on Airbnb. We're mkan — a Sudanese
rentals marketplace. We've set up an account with your listings already
loaded, so you can manage them yourself and reach guests inside Sudan
without the global platform fees. Can we show you how?
```

**Account hand-over (after they say yes)**
```
تمام {الاسم}! حسابك جاهز على mkan:
• الدخول: {الرقم}  (أو {الرقم}@mkan.org)
• كلمة السر: {كلمة_السر}  — غيّرها بعد أول دخول
لقيت إعلاناتك جاهزة جوا "استضافة". راجع الأسعار والصور وأكّد لينا
السعر المباشر لكل بيت، وبعدها ننشرها. رابط: {الرابط}
```

**Follow-up (no reply — max 3, then `UNREACHABLE`)**
```
{الاسم}، بس نتأكد وصلتك رسالتنا 🙂 حساب mkan جاهز بإعلاناتك — بدون التزام،
تحب نوريك؟
```

Templates live in the outreach worker/OpenClaw config; keep them short, honest, and never
imply Airbnb affiliation.

### 5.5 The trust gate (Busy → Available)

A home goes **Available only when**: the host **replied and confirmed ownership + direct
price** (`price_confirmed_by_host`), photos are **re-hosted**, the **trust band passes**
(AUTO_ONBOARD, or MANUAL_REVIEW after a human look), and **no hard gate fails**. This is
the `TRUST_REVIEW` stage decision; until then the listing stays Busy and invisible.

**As actually operated (2026-08-05).** The gate above is the default path and still runs
when `crm:publish` is invoked without flags. It is not what the live catalogue went through.
All 97 listings were published under `--force`, which bypasses both the trust band and the
claim requirement, because the first 74 had already gone live unclaimed — so enforcing it on
the remainder would have held back inventory without protecting anyone whose home was
already up. Two consequences worth keeping in view:

- **Consent is obtained by outreach (§5.4) and recorded by the claim flow, not enforced by
  the publish step.** `Listing.claimedAt` is still the only record that an owner has seen
  their listing; it is now a fact to chase rather than a precondition.
- **`hotel-excluded` covers two unrelated things.** `trust-score.ts:108-110` files a
  `HOTEL_ROOM`/`SHARED_ROOM` and a plain apartment whose host holds >15 listings under the
  same note. The second is a statement about the host being an agency, not about the home.
  18 of the 24 gated homes were that second kind and are ordinary apartments.

If the policy tightens again, the lever is removing `--force` from the publish run — the
default gate is intact underneath it.

---

## 6. Seeding runbook (Epic G1 implementation — to build)

Two tsx scripts, following the repo's proven env pattern.

- **`scripts/import-scraped-homes.ts`** — reads trusted `Home`/`Host` records from Twenty's
  API (filter: `publish_ready` or `home_status = READY_FOR_IMPORT`), re-hosts photos (§4.2),
  and writes mkan `User` (if not yet provisioned) + `Location` + `Listing` (Busy) via
  Prisma, then writes the `mkan_*` fields back to Twenty. Idempotent by `airbnb_listing_id`
  (store it on import or map via the CRM `mkan_listing_id`).
- **`scripts/provision-hosts.ts`** — allocates the next `≥1000` account per host, creates
  the `MANAGER` `User{ emailVerified }`, and records `mkan_user_id`/`account_provisioned_at`
  back in Twenty. Allocation is **mint-forward** (max existing numeric username + 1, floored
  at 1000).

**Env pattern (critical — the dotenv/ESM gotcha).** `src/lib/db.ts` builds the Prisma
driver adapter from `process.env.DATABASE_URL` at module-eval time, and ESM hoists imports,
so a top-level `import { db }` evaluates **before** `config()` → `DatabaseDoesNotExist`. Use
the proven pattern (as in `seed-heirs-homes.ts` / `seed-daqna-homes.ts` /
`purge-synthetic.ts`):

```ts
import { config } from 'dotenv'
config({ override: true })            // .env wins over any stale shell var
// ...
async function main() {
  const { db } = await import('@/lib/db')   // deferred — after env loads
  // ...work...
}
```

Or invoke with env pre-loaded: `set -a && source .env && set +a && npx tsx scripts/import-scraped-homes.ts`.

**Guardrails**

- **Prod guard:** `if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) throw`.
- **Non-destructive:** these scripts **only insert/update** their own imported rows —
  never the real `0001`/`0002`/`0003` homes. (The demo pool they used to have to avoid no
  longer exists; it was purged 2026-08-05.)
- **Busy-until-verified:** always import `isPublished:false`. The flip to Available is a
  **separate, human-gated** action (§5.5), never done in bulk by the import script.
- **`photoUrls`:** only CDN URLs (post re-host). Empty `photoUrls` falls back to the
  branded placeholder — acceptable for an early import, but re-host before going Live.

---

## 7. Epic G1 (Growth) — backlog

Per [EPICS.md](../EPICS.md) (post-launch epics take a `G.` prefix), this is **Epic G1**.
Suggested stories (dependency order):

1. **G1.1 — CRM data model.** Create `Home` + `Host` objects and the custom fields on
   `Opportunity`/`Note`/`Task` in Twenty (Settings → Data Model, or metadata API/SDK).
   Create the 10 saved Views (§2.8).
2. **G1.2 — Airbnb scraper + ingest.** Playwright discovery + PDP scrape (all photos + all
   data); normalize; upsert into Twenty via API; dedup by external id.
3. **G1.3 — Trust scoring worker.** Compute the rubric (§3), derived checks, and denormalized
   copies on every sync.
4. **G1.4 — Photo re-host + SR→SDG.** Download/re-upload photos to CDN; per-home FX capture.
5. **G1.5 — Provision + import scripts.** `provision-hosts.ts` + `import-scraped-homes.ts`
   (§6), Busy-until-verified.
6. **G1.6 — OpenClaw outreach.** Draft AR/EN templates; human-send first touch; automated
   follow-ups via Workflow; log to CRM; Slack alerts.
7. **G1.7 — Wave publish tooling.** A human-gated "flip to Available" flow (per-city,
   per-trust) + the availability-nudge lifecycle already in the app.
8. **G1.8 — Other sources.** Facebook pages / WhatsApp groups capture into the same objects.

---

## 8. Accounts — the `1000+` real-host range

Extends [ACCOUNTS.md](../ACCOUNTS.md):

| Range | Meaning |
| --- | --- |
| `0001–0003` | **Real** Port Sudan homes (heirs, Daqna, Hussein) — keep real. |
| `0004–0999` | Free. Was the demo pool; purged 2026-08-05 (`pnpm purge:synthetic`). |
| **`1000+`** | **Real scraped hosts** onboarded via this engine — MANAGER, `emailVerified`, username == number, mint-forward, never recycled. Their homes import **Busy** and go Available only through the trust gate (§5.5). |

---

## 9. Related

- [ACCOUNTS.md](../ACCOUNTS.md) — seeded accounts + the login scheme.
- [EPICS.md](../EPICS.md) — canonical backlog (this is Epic G1).
- [docs/image-pipeline.md](./image-pipeline.md) — S3 + CloudFront photo hosting (re-host target).
- [docs/architecture.md](./architecture.md) · [docs/prd.md](./prd.md) — app architecture + product.
- [twentyhq/twenty](https://github.com/twentyhq/twenty) — the CRM platform.
- [OpenClaw](https://github.com/openclaw/openclaw) — the WhatsApp/messaging outreach bridge.
