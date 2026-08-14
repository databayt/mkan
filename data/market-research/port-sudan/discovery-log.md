# Discovery log — Port Sudan rental market

**Collected 2026-08-14.** What was searched, what each pass returned, what was
deliberately excluded, and what is still missing. Read this before trusting — or
re-running — [`rental-leads.json`](./rental-leads.json).

---

## 1. Why this dataset exists

The Airbnb pipeline in `scripts/crm/` already answered the coverage question, and its
[README](../../../scripts/crm/README.md) is blunt about the result: Sudan holds roughly
**120 Airbnb listings in total**, the quadtree crawl is provably exhaustive, and therefore

> *"Coverage is not the constraint on this business; inventory is. Growth has to come from
> onboarding hosts who are not on Airbnb at all."*

This dataset is that second population — the furnished-apartment operators, hotel-apartment
blocks, guest houses and brokers who hold Port Sudan inventory and have never touched a
booking platform. It is **market research**, not production data. Nothing here was written
to the mkan database and no CRM record was created.

---

## 2. Sources, and why these

| Layer | Source | What it is good for | What it cannot give |
| --- | --- | --- | --- |
| A | **OpenStreetMap** via Overpass API | Existence + exact coordinates + Arabic/English name pairs. Free, licensed (ODbL), re-runnable on demand. | Almost never a phone: 1 of 30 POIs carried one. |
| B | **`sd.arabplaces.com`** — a public directory mirroring Google Business listings | Phone, Google rating, review count, coordinates, Arabic alt-name. This is the Google Business data. | Only indexes businesses that already have reviews — a floor, not a census. |
| C | **Web search + page fetches** (Arabic and English) | Brands with no map presence at all: Facebook pages, TikTok operators, TripAdvisor-only hotels, brokers. | Rarely a phone; Facebook exposes nothing without a login. |

### Why Google Maps was not scraped directly

The brief asks for Google Maps / Google Business information. That information is in this
dataset — it arrives through layer B, which republishes it with the rating and review count
intact. Driving `maps.google.com` in a browser was considered and rejected: the raw search
page ships no results without JavaScript (verified — `APP_INITIALIZATION_STATE` contains map
tiles only), and the rendered path would add fragility and terms-of-service exposure for
data already obtainable.

The consequence is recorded honestly in the schema: **`google_maps.rating` and
`google_maps.review_count` are populated; `google_maps.url` is always `null`** because a
Maps URL was never observed, and constructing one from a name would be fabrication. One
`place_id` exists — `سيف للشقق المفروشة` — recovered from a Waze directions URL that
publishes it verbatim.

**Ratings never cross platforms.** TripAdvisor scores live in a separate `tripadvisor`
object, never in `google_maps`. An earlier build of this dataset merged them, and produced
two distinct errors worth naming: four businesses (Baasher Palace, Flora, Samarmaz, Mercure)
carried TripAdvisor scores published as Google ratings, and Sudan Red Sea Resort ended up
showing **4.4★ with 36 reviews** — Google's rating welded to TripAdvisor's review count, a
pairing that exists on neither site. Real numbers under a false label are still fabrication.
Each platform's rating and volume now travel together or not at all; the lead score uses the
best public review volume across platforms, which is what the phrase "public reviews" in a
score reason means.

---

## 3. Passes, in order, with what each returned

### Pass 1 — OpenStreetMap (Overpass), Port Sudan bbox `19.40,37.00,19.85,37.40`

Tag classes swept: `tourism` (hotel · guest_house · apartment · hostel · motel · chalet ·
resort · camp_site), `office` (estate_agent · property_management), `shop` (estate_agent ·
rental), `building=hotel`, plus two name regexes — Arabic (`شقق|فندق|استراحة|منتجع|عقار|سكن|نزل|أجنحة`)
and English (`hotel|apartment|suites|resort|guest ?house|lodge|real ?estate|rental`, case-insensitive).

**31 elements → 30 named.** Breakdown: hotel 8 · apartment 6 · guest_house 5 · chalet 2 ·
hostel 1 · motel 1 · estate_agent 1 · untagged-but-named 6. Only **1 carried a phone**, 1 a website.

Re-runnable: `pnpm crm:ps-discover --refresh-osm`.

### Pass 2 — directory category index (`/al-bahr-al-ahmar/…`)

17 Google-Business category slugs were swept with pagination. **Only `hotel` (23 listed,
across 2 pages) and `hostel` returned Sudanese businesses.** Every other slug — `lodging`,
`guest-house`, `apartment-building`, `apartment-rental-agency`, `serviced-accommodation`,
`furnished-apartment-building`, `extended-stay-hotel`, `condominium-complex`,
`real-estate-agency`, `real-estate-developer`, `travel-agency`, `resort`, `motel`, `inn` —
returned **Egypt**.

> ### ⚠ The foreign-backfill trap
>
> The directory silently pads a thin Sudanese "Red Sea" query with businesses from
> **Egypt's Red Sea Governorate** (Hurghada, El Gouna, Sahl Hasheesh), served from
> `eg.arabplaces.com/red-sea/`. Counts looked healthy — `resort` claimed 203 companies,
> `travel-agency` 165 — and every one of them was Egyptian.
>
> This is precisely the trap `scripts/crm/sudan-places.ts` documents in its header: a
> sibling project once imported 64 schools around Addis Ababa from a "Sudan" bounding box
> and only noticed later, via their +251 phone numbers. Filtering on the **detail-page host
> and the address country** rejected **179 rows**. The generator re-asserts it: any lead
> landing >150 km from the Port Sudan centroid aborts the build.

**20 unique Sudanese places kept.** Each detail page was then fetched once for phone,
website, rating, review count, coordinates and Arabic alt-name: **18 of 20 carried a phone,
20 of 20 coordinates, 20 of 20 a Google rating.**

*Access note:* `robots.txt` contains only the Cloudflare content-signal boilerplate — no
`User-agent`, no `Disallow`, and no signal actually set. Fetching was paced with delays.

### Pass 3 — web search, Arabic and English

Ten queries run (Arabic first, since that is the language this market advertises in):

| # | Query |
| --- | --- |
| 1 | `شقق مفروشة بورتسودان للايجار` |
| 2 | `furnished apartments Port Sudan hotel apartments` |
| 3 | `"Prestige Apartments" OR "Mirak" Port Sudan furnished` |
| 4 | `"سيف للشقق المفروشة" بورتسودان` |
| 5 | `مكتب عقارات بورتسودان سمسار تأجير شقق` |
| 6 | `شقق فندقية بورتسودان أجنحة فندقية حي المطار الخليج` |
| 7 | `"شقق مفروشة" OR "شقق فندقية" بورتسودان فيسبوك صفحة تأجير` |
| 8 | `Port Sudan hotels booking.com apartments guest house list` |
| 9 | `شركة عقارية بورتسودان تسويق عقاري البحر الأحمر` |
| 10 | `"بورتسودان" استراحة OR نزل OR "سكن مفروش" ايجار يومي` |

Pages then fetched individually: TripAdvisor's Port Sudan roster (`g677545`), Trip.com's
Port Sudan airport page, the Prestige Facebook page, `aqaraksd.com`, `mirakhotels.com`,
`aag-sd.com`, `sudan.worldplaces.me`, `top-rated.online`.

**13 businesses curated** into [`sources/web-research.json`](./sources/web-research.json),
each carrying the URL it came from. New names found only here: **Flora Hotel**, **Mercure
Port Sudan**, **Samarmaz Hotel**, **Prestige hotel apartments**, **سيف للشقق المفروشة**,
**السلطان للشقق الفندقية**, **شقق النرجس الفندقية**, **أملاك العقارية**.

### Pass 4 — all three seed businesses from the brief, resolved

| Seed | Outcome |
| --- | --- |
| **Mirak Furnished Suites** | Found in all three layers. Phone `+249 90 113 2695`, Google 4.9/8. Its own domain is dead. |
| **السواحلي للشقق الفندقية** | Found independently in the directory sweep. Phone `+249 90 448 5000`. Merged with its English record "Al Swahili Hotel" (11 m apart). |
| **سيف للشقق المفروشة** | Confirmed real via a Waze directions page carrying Google place_id `ChIJcaLL4z9T1xURYnkFlXqxkfQ`. No phone or coordinates are public. |
| **Prestige Apartments** | Confirmed as "Prestige hotel apartments \| Port Sudan" on Facebook. The page exposes no address, phone or category. |

### Pass 5 — neighbourhood-specific searches

The areas surfaced in pass 3 were then searched individually, because this market advertises
by district rather than by city:

| # | Query |
| --- | --- |
| 11 | `شقق مفروشة حي الخليج بورتسودان ايجار` |
| 12 | `شقق للايجار سلالاب OR ترانزيت OR "ديم المدينة" بورتسودان` |
| 13 | `فنادق حي المطار بورتسودان شقق فندقية` |

Two results:

- **One new business** — **فندق حي المطار** (Airport District Hotel), which appeared in two
  of the three searches as a page title on `aag-sd.com`. The site could not be read; the
  domain no longer resolves. Name, district and a service description are all that is
  verified, so it enters with no phone and a low score.
- **One existing lead materially strengthened.** The Facebook page behind several Port Sudan
  apartment videos (`facebook.com/sdamhe.sanhesan`) was fetched and turns out to be
  **أملاك العقارية** — already in the dataset. It posts inventory by named district
  (حي المطار مربع ٤ on شارع السلك, حي الخليج main street) and is listing a four-storey
  building for sale in سلالاب. That upgrades it from "reposts Port Sudan stock" to
  "genuinely trades it", though it stays classified as a channel into the city rather than
  an office in it until a local branch is confirmed.

`alsoug.com` was also found to publish **neighbourhood-scoped rental indexes** for سلالاب,
ترانزيت and حي المطار. Those are real supply, but they are individual landlord ads rather
than businesses — catalogued as a channel, deliberately not crawled ad-by-ad (see §7).

---

## 4. Deduplication — what merged, and what deliberately did not

63 candidate records → **50 unique** (13 merged away).

Merging is permitted on a **hard signal only**: same phone number, same website domain, a
hand-verified alias bridge, or coordinates within 200 m *plus* a strict name match.

### The over-merge that had to be fixed

The first implementation also merged "coordinates within 200 m, names differ" for
multi-unit categories. In Port Sudan that is catastrophic — every downtown hotel is on the
same two streets. It collapsed **Palace Palace Hotel + Baasher Palace Hotel + Nour al-Yemen**
into one record, and **Mirak + Al Taher Mohamed Saleh** into another. The name matcher was
also too loose: a single shared token ("palace") counted as a match.

Both were tightened. A single shared word is now never enough — the smaller name must have
≥2 tokens and be fully contained in the larger. Proximity alone never merges.

### Cross-script pairs need a human, not an algorithm

"فندق اوكير" and "Okere Hotel" share no characters. These were resolved by a hand-verified
`alias_bridges` list in `sources/web-research.json`, each entry carrying its evidence:

| Canonical | Merged aliases | Evidence |
| --- | --- | --- |
| Mirak Furnished Suites | Mirak Hotel Suites · Mirak Hotels · ميراك للشقق الفندقية | Same operator across 4 sources |
| Okere Hotel | Okier Hotel · فندق اوكير · فندق أوكير | 3 records within 60 m |
| Bohein Hotel | Bohaen Hotel | 11 m apart, one transliteration apart |
| مجمع الربوة السياحي | فندق الربوة · منتجع الربوة السياحي | 3 records within 150 m |
| السواحلي للشقق الفندقية | Al Swahili Hotel | 11 m apart |
| السلطان للشقق الفندقية | Al-Sultan | Facebook page + OSM `tourism=apartment` node |
| Sudan Red Sea Resort | Red Sea Resort | Same coastal resort |
| Coral Port Sudan | فندق كورال | 10 m apart |

### Uncertain pairs are soft-linked, never merged

Per the brief — *"If uncertain, do NOT merge automatically"* — records that sit within ~60 m
of each other keep their own row and gain a `possible_duplicate_of` pointer. If the two
publish **different phone numbers** they are provably distinct and the adjacency is recorded
as informational; otherwise the pair is escalated to `review_required`.

Two ambiguities were flagged by hand because no automatic rule can settle them:

- **Marina Hotel Port Sudan ↔ مارينا للشقق الفندقية** — same brand word, two scripts, 0.8 km
  apart. One operator with two buildings, or two businesses. A phone call settles it.
- **Okere Hotel ↔ فندق علا** — 40 m apart, different names, and فندق علا publishes no phone,
  so nothing proves them distinct.

---

## 5. Scoring rubric

Transparent and additive, capped 0–100. No component is a guess.

| Signal | Points |
| --- | --- |
| Public phone number | +25 |
| Mapped (has coordinates) | +15 |
| Corroborated across independent source layers | +10 each, max +20 |
| Public reviews — ≥20 / ≥10 / ≥5 / ≥1 | +20 / +15 / +10 / +5 |
| Multi-unit by category (hotel, resort, furnished/hotel apartments) | +15 |
| Furnished or serviced apartments — Mkan's exact vertical | +10 |
| International chain — unlikely to self-serve on Mkan | −20 |

Bands: **high** ≥70 · **medium** 45–69 · **low** <45. `review_required` and `out_of_scope`
override the band.

**`estimated_inventory` is `null` on every record.** Nothing published states a unit count,
and inventing one would corrupt exactly the number the acquisition team would plan around.
`likely_multiple_units` is a boolean derived from category, which is defensible; a number
would not be.

### Out of scope, but kept

Nine mapped places are recorded with `entity_type: "institutional"` and never scored —
UNICEF and MSF staff residences, the Oil Ministry rest house, police housing, the
public-housing gate, the corniche, and OSM nodes whose entire name is a generic word
(`منزل`, `استراحة`, `resort`). They are kept so a later pass does not rediscover them as new
leads.

---

## 6. What this found about the market itself

- **41 businesses. 19 reachable by phone.** That is the real working surface.
- **Three businesses' websites are dead domains** — `mirakhotels.com`, `aag-sd.com`,
  `coral-portsudan.com` all fail DNS resolution. Only 4 of 41 have any website at all.
- **Booking.com lists zero bookable Port Sudan properties**; Trip.com's airport page returns
  "no accommodations matching your search". The international booking layer has withdrawn
  from this market.
- **The brokerage layer has almost no mapped presence.** Exactly one `office=estate_agent`
  node exists in OSM for the whole city, and it is a public-housing gate. Port Sudan's
  furnished-rental supply trades through **Facebook groups, TikTok accounts and classifieds**
  — four active Facebook groups and five classifieds portals are listed in
  `rental-leads.json` under `channels`. That absence is itself the finding: there is no
  incumbent intermediary holding this inventory.
- **The one broker found actively marketing Port Sudan stock is Khartoum-based**
  (أملاك العقارية) — classified honestly as a channel into the city, not an office in it.
- Areas the market names for itself: حي المطار (Airport district, the furnished cluster),
  ديم المدينة / الديوم الشرقية, سلالاب, الخليج, ترانزيت, شارع الاذاعة والتلفزيون,
  شارع المهندسين, النهضة.

---

## 7. Gaps — what is *not* covered

Stated plainly, because a silent cap reads as completeness.

1. **Individual landlord ads were not crawled.** `alsoug.com` exposes per-neighbourhood
   rental indexes (سلالاب, ترانزيت, حي المطار, الخليج) and OpenSooq, aqaraksd, naffaj and
   beldo carry more. Each ad is one landlord with one flat — genuine Mkan supply, and a
   different unit of work from the business-level dataset this brief asked for. Crawling
   them is the obvious next pass, and would need its own de-duplication against the
   operators already here.
2. **The directory's `/search/` endpoint was not swept.** It works and would have widened
   coverage beyond the review-gated category index. The host began returning **HTTP 403**
   partway through the sweep and the block persisted for the rest of the session, so **no
   records were recovered from it**. One business is known to exist only from a URL seen
   before the block — *Stylish Port Sudan* — and is in the dataset flagged
   `review_required` with its category unknown. **Re-run this from a different network**;
   it is the single highest-yield remaining pass.
3. **Two more Google-Business mirrors are gated**: `sudan.worldplaces.me` returns HTTP 511
   human-verification, `top-rated.online` returns Cloudflare 403. Both likely carry the same
   underlying data as layer B, so the marginal yield is probably small, but it is untested.
4. **`aqaraksd.com` returns 403 to automated fetch.**
5. **Facebook is closed.** The Prestige page fetched cleanly but exposed no phone, address or
   category, and the four Facebook groups cannot be read without a session. A logged-in pass
   over those four groups would likely be the richest single source of individual hosts.
6. **No coverage below the business level.** Per §5 of the brief, no individual units were
   invented; where a business clearly holds many, only `likely_multiple_units` is set.
7. **Suakin, Sinkat and Tokar were not swept.** Scope was Port Sudan. Two records already
   sit outside the 25 km city radius (Sudan Red Sea Resort at ~31 km, Jebel Al-Sit at ~94 km)
   and are flagged as such rather than silently counted as city inventory.

---

## 8. Reproducing this

```bash
pnpm crm:ps-discover                 # normalize + dedupe + score + emit, from sources/
pnpm crm:ps-discover --refresh-osm   # re-fetch OpenStreetMap first
```

The generator is deterministic — same sources in, byte-identical files out. Layers B and C
are checked in under [`sources/`](./sources/) rather than re-fetched, because the directory
rate-limits and because web search is not scriptable; that curated file **is** the
reproducibility record for the search layer, the same way `scripts/crm/sudan-places.ts` is
hand-curated and authoritative.

Do not hand-edit `rental-leads.json` or `rental-leads.md` — edit `sources/` and regenerate.

### The invariant the build enforces

The generator **throws** rather than emit a dataset if either holds:

- any lead carries **zero source URLs**, or
- any lead sits **>150 km from the Port Sudan centroid** (foreign backfill leaked in).

The first is the guard against the failure mode that would make this artefact worse than
useless: a plausible-sounding business that no one actually verified. Every record here
traces to a URL that was fetched on 2026-08-14.

---

## 9. Licence and privacy posture

OpenStreetMap data is **ODbL 1.0 — © OpenStreetMap contributors**; attribution is required on
redistribution and is carried in `sources/osm-portsudan.json`.

This dataset is committed to the repository while `scripts/crm/.data/` is gitignored, and the
distinction is deliberate: `.data/` holds scraped **personal** host data, whereas everything
here is **business contact information published by businesses that are soliciting contact** —
a hotel's phone number on its own Google listing. It is still lead data about real people's
livelihoods, so: no phone number was inferred, no address was widened, and nothing was
enriched beyond what each business already publishes about itself.
