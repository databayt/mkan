# Mapping this dataset into Twenty CRM

How each field of [`rental-leads.json`](./rental-leads.json) lands in the live Twenty
workspace (`mkan.crm.databayt.org`).

> **Nothing in here has been executed.** No Twenty object, field, or record was created or
> modified. This is the design a future `crm:ps-sync` step would implement.

---

## 1. The object decision: `Company`, not `Host`

The Growth Engine design already anticipated this dataset. [`docs/growth.md`](../../../docs/growth.md) §2.2
lists the standard **Companies** object as:

> *"Unused for now — reserve for agencies/hotel operators if that vertical opens."*

**That vertical is what this dataset is.** These leads are *businesses* — "Mirak Furnished
Suites", "السواحلي للشقق الفندقية", "أملاك العقارية" — not the individual people the
existing pipeline calls hosts.

Mapping them onto the existing `Host` custom object would be wrong on both sides:

| | Why `Host` does not fit | Why `Company` does |
| --- | --- | --- |
| **Shape** | `Host` has 32 fields, and about half are Airbnb-shaped — `airbnbHostId`, `airbnbProfileUrl`, `superhost`, `responseRate`, `responseTime`, `airbnbListingsCount`, `portfolioAvgRating`, `hostAbout`. Every one would be permanently null. | Standard Twenty `Company` ships with `name`, `domainName`, `address`, `employees`, `linkedinLink`, `xLink` — most of what a business lead needs, before any custom field. |
| **Cardinality** | `Host` models one person. `Opportunity` is one-per-host by convention. | A hotel-apartment operator is one company with a switchboard number and, later, several named contacts. |
| **Identity** | `Host` carries verification telemetry about a *person* (`identityVerified`, `person` relation to standard People). | A business is publicly identified by definition — it advertises its own phone. |

### Resulting object graph

```
Company  (standard, + 12 custom fields)   ← one per lead in this dataset
   ▲                    ▲
   │ company            │ company
  Host                Opportunity  (standard, existing custom fields reused)
 (the person we                     one onboarding deal per company
  eventually reach —
  created only after
  first contact)
   │
   │ host
  Home   (existing custom object — created only after inventory is verified)
```

Two relations to add, both many-to-one from the declaring side (Twenty's direction):

| Field | On | → Target | Reads as |
| --- | --- | --- | --- |
| `company` | Host | Company | many contacts → one business |
| `company` | Opportunity | Company | the onboarding deal for this business |

`Opportunity.host` stays as-is. A deal opened from this dataset carries `company` and gains
`host` once a named person answers the phone.

---

## 2. Field mapping

### 2.1 Onto standard `Company` fields

| `rental-leads.json` | Twenty field | Type | Note |
| --- | --- | --- | --- |
| `name.primary` | `name` | TEXT (label identifier) | Auto-created by Twenty; not declared in schema. |
| `contact.website` | `domainName` | LINKS | **Only when live.** 3 of 4 websites in this dataset are dead domains — see `contact.website_status`. Write the dead ones to `psWebsiteStatus` instead so nobody trusts a 404. |
| `location.address` + `latitude` + `longitude` | `address` | ADDRESS | Twenty's ADDRESS is composite and carries lat/lng subfields. Note: on the custom `Home` object the equivalent had to be named `homeAddress` because **`address` is reserved** — on standard `Company` the reserved name is the field itself, so it is used directly. |

### 2.2 New custom fields on `Company` (prefix `ps` — Port Sudan discovery)

| `rental-leads.json` | New field | Twenty type | Options / note |
| --- | --- | --- | --- |
| `id` | `psExternalId` | TEXT | **The dedupe key.** Stable slug (`ps-mirak-furnished-suites`). Upsert matches on this — never on name. |
| `name.arabic` | `psNameAr` | TEXT | Renders the Arabic form in `/ar` surfaces. |
| `name.aliases[]` | `psAliases` | TEXT | Joined. Keeps the merge history searchable so a rediscovered name resolves to the existing record. |
| `category` | `psCategory` | SELECT | `FURNISHED_APARTMENT` · `HOTEL_APARTMENT` · `HOTEL` · `GUEST_HOUSE` · `RESORT` · `CHALET` · `REAL_ESTATE_OFFICE` · `UNKNOWN` |
| `contact.phone[]` | `psPhone` | PHONES | Twenty PHONES holds several — the array maps directly, no flattening. |
| `contact.phone[0]` | `psWhatsapp` | PHONES | Sudanese business numbers are usually WhatsApp-reachable, but this is an **assumption, not a fact** — leave empty and let `whatsappStatus` on first send decide, exactly as the Airbnb pipeline does. |
| `contact.email` | `psEmail` | EMAILS | One value present in the whole dataset. |
| `contact.website_status` | `psWebsiteStatus` | TEXT | e.g. "DEAD — does not resolve in DNS (2026-08-14)". |
| `contact.social.facebook` / `.instagram` / `.tiktok` / `.other[]` | `psSocial` | LINKS | LINKS is multi-value; collapse all channels into it. |
| `google_maps.rating` | `psGoogleRating` | NUMBER | **NUMBER, not RATING.** Twenty's RATING is 1–5 stars only and would round 4.9 → 5. Same decision `docs/growth.md` §2.1 made for Airbnb's average. |
| `google_maps.review_count` | `psGoogleReviews` | NUMBER | Volume signal — the strongest "is this business alive" proxy available. |
| `google_maps.place_id` | `psGooglePlaceId` | TEXT | Populated for exactly one record. |
| `market.score` | `psLeadScore` | NUMBER | 0–100, rubric in `discovery-log.md` §5. |
| `market.lead_priority` | `psLeadPriority` | SELECT | `HIGH` · `MEDIUM` · `LOW` · `REVIEW_REQUIRED` · `OUT_OF_SCOPE` — the Kanban group field for the acquisition board. |
| `market.mkan_relevance` | `psRelevance` | SELECT | `HIGH` · `MEDIUM` · `LOW` · `NONE` |
| `market.likely_multiple_units` | `psMultiUnit` | BOOLEAN | |
| `market.estimated_inventory` | `psEstimatedUnits` | NUMBER | **Null on every record today.** Fill only from a human conversation — see §4. |
| `location.area` | `psArea` | TEXT | Neighbourhood (حي المطار, الخليج…). Free text: these are not administrative units and no gazetteer covers them. |
| `location.distance_from_city_centre_km` | `psDistanceKm` | NUMBER | Flags the two records outside the 25 km city radius. |
| `discovery.sources[]` | `psSources` | LINKS | **Every source URL. Do not summarise.** This is the audit trail that makes the record trustworthy. |
| `discovery.source_layers[]` | `psSourceLayers` | TEXT | `openstreetmap` / `directory(google-business)` / `web-research`. |
| `discovery.first_seen`, `.last_verified` | `psFirstSeen`, `psLastVerified` | DATE | |
| `possible_duplicate_of[]` + `review_reasons[]` | `psReviewNotes` | TEXT | Why a human is being asked to look. |
| `entity_type` | — | — | Do **not** sync `institutional` records at all. See §3. |
| `crm.notes` | `noteTargets` → standard `Note` | Activity | Prose belongs in an activity, not a text column — matching how the existing pipeline records outreach touches. |

### 2.3 Onto `Opportunity` (existing custom fields, no new ones needed)

One Opportunity per company, opened at import:

| Source | Twenty field | Value |
| --- | --- | --- |
| `crm.lead_status: "new"` | `onboardingStage` | `SCRAPED` — the existing funnel's entry stage. |
| `market.lead_priority` | standard `stage` | `HIGH`/`MEDIUM` → `NEW`; `REVIEW_REQUIRED` → hold out of the board until adjudicated. |
| `market.estimated_inventory` | `homesCount` | Leave `0`. It becomes real when inventory is verified. |
| — | `outreachChannel` | `CALL` for the 19 with a phone; `FACEBOOK` for the page-only leads. |
| `crm.assigned_to: null` | standard owner | Assign on import — CRM hygiene is Aseel's per `docs/growth.md`. |

---

## 3. What must **not** be synced

- **The 9 `institutional` records.** UNICEF/MSF staff residences, the Oil Ministry rest
  house, police housing, the corniche, and generically-named OSM nodes. They are in the
  dataset so a later pass does not rediscover them as new leads — they are not leads.
- **`google_maps.url`.** Null on every record by design. Never construct a Maps URL from a
  name; a wrong link sends a salesperson to the wrong business.
- **`estimated_inventory` as anything but null.** Nothing published states a unit count.
- **The `channels` and `areas_observed` blocks.** These are market context, not records.
  They belong in the growth doc, not as CRM rows.

---

## 4. Two SELECT options that must be grown first

`Home.source` and `Host.source` share the `SOURCE` list, currently
`AIRBNB · FACEBOOK · WHATSAPP · REFERRAL · FIELD_SCOUT · OTHER`. This dataset introduces
three new origins that need appending **before** any record is written:

```
OPENSTREETMAP · PUBLIC_DIRECTORY · WEB_RESEARCH
```

`Host.contactFoundVia` already has `PUBLIC_DIRECTORY` — reuse it as-is; it is exactly what
layer B is.

> **Grow, never replace.** Use `pnpm crm:sync-options`, which diffs declared options against
> live ones and appends. It refuses removal on purpose: Twenty backs each SELECT option with
> a Postgres enum value on the record table, so appending is `ALTER TYPE … ADD VALUE` while
> dropping strands every record holding it.

---

## 5. Upsert rules for the sync step

Follow the posture `sync-contacts-to-twenty.ts` already established:

1. **Match on `psExternalId`, never on name.** Names in this market exist in two scripts and
   several transliterations; that is what `psAliases` is for.
2. **Fill empty, never replace populated.** If a human has typed a better phone number into
   Twenty, a re-run must not overwrite it. A conflict becomes a dated `Note`, not an
   overwrite.
3. **Respect a human write-lock.** `Host.contactVerifiedByHuman` is the existing precedent —
   add the same guard on Company before any automated write.
4. **Dry-run by default, `--apply` to execute**, like every other `crm:*` command.
5. **Re-runs are safe.** The generator is deterministic, so a second sync is a no-op unless
   `sources/` changed.

---

## 6. Field-name quick reference

The brief sketched a generic mapping; this is the same idea resolved against the real
workspace:

```
rental-leads.json                     Twenty (live workspace)
────────────────────────────────────────────────────────────────────
id                                    Company.psExternalId      (dedupe key)
name.primary                          Company.name
name.arabic                           Company.psNameAr
name.aliases[]                        Company.psAliases
contact.phone[]                       Company.psPhone           (PHONES, multi)
contact.website (live only)           Company.domainName
contact.website (dead)                Company.psWebsiteStatus
contact.social.*                      Company.psSocial          (LINKS, multi)
location.address + lat + lng          Company.address           (ADDRESS composite)
location.area                         Company.psArea
google_maps.rating                    Company.psGoogleRating    (NUMBER — not RATING)
google_maps.review_count              Company.psGoogleReviews
google_maps.place_id                  Company.psGooglePlaceId
google_maps.url                       — never written, always null
category                              Company.psCategory        (SELECT)
market.score                          Company.psLeadScore
market.lead_priority                  Company.psLeadPriority    (SELECT, Kanban group)
market.estimated_inventory            Company.psEstimatedUnits  (null until verified)
discovery.sources[]                   Company.psSources         (LINKS — full audit trail)
discovery.first_seen / last_verified  Company.psFirstSeen / psLastVerified
review_reasons[] + possible_dupes[]   Company.psReviewNotes
crm.lead_status                       Opportunity.onboardingStage = SCRAPED
crm.notes                             standard Note, linked to the Company
entity_type = institutional           — not synced at all
```

---

## 7. Where this sits in the flywheel

```
public sources → THIS dataset → Twenty CRM → contact → verify inventory
   → onboard host → Host + Home records → trust gate → live mkan listings
```

A discovered business becomes an mkan listing **only** after a human contacts it and
verifies what it actually holds. The existing gates are unchanged: `mkan-import.ts` still
provisions the account and imports as **Busy**, and `wave-publish.ts` still decides what goes
live. This dataset only widens the top of the funnel.
