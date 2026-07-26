# mkan CRM Setup Kit — SUPERSEDED (kept for history)

> ⚠ **This Owner / Building / Home model is no longer the mkan CRM schema.** It was the
> manual, CSV-and-UI plan that came first. The live workspace is now driven by
> `../scripts/crm/twenty-schema.ts` (**Host** + **Home** + Opportunity custom fields, ~101
> fields), applied by `pnpm crm:seed-objects` / `pnpm crm:sync-options`. There is no `Building`
> object and no CSV import path.
>
> Do not follow the steps below against the live workspace — the field names differ and you
> will end up with a second, conflicting object set. See `../scripts/crm/README.md` and
> `../docs/growth.md` for the current model.
>
> Still current in this directory: **`team-access/`** (the SQL that seeds team logins across
> the four shared Twenty workspaces). That is unrelated to this object model and still applies.

Setup kit for the **mkan back-office CRM** at `mkan.crm.databayt.org` (a Twenty workspace).
Use it to gather & refine **apartment owners and their Airbnb-style homes** in Port Sudan with
your sales team.

Field set mirrors the mkan Prisma schema (`../prisma/schema.prisma`,
`../src/server/prisma/schema.prisma`) so the CRM and the live app share the same shape and can
sync later.

- **Owner** = mkan `host` / `Manager` — a **record**, not a login (owners log in via the mkan app).
- **Building** = mkan `Location` — groups many homes.
- **Home** = mkan `Listing` / `Property` — the full listing.
- **Sales team** = Twenty **workspace members** (they log in, get records assigned, collaborate).

---

## Step 1 — Create the three objects

`mkan.crm.databayt.org` → **Settings → Data Model → + Add object**. Create **Owner**,
**Building**, **Home** (set singular/plural + an icon each).

## Step 2 — Add fields

On each object: **+ Add field**. Column headers in the CSV templates match these field names.
Mark uniqueness where noted.

### Owner
| Field | Type | Notes |
|-------|------|-------|
| Name | Text | |
| Account Code | Text | **Unique** — `0001`, matches mkan account + CSV relation key |
| Account Email | Emails | `0001@mkan.org` |
| Phone | Phones | |
| National ID | Text | |
| Address | Address | |
| Assigned To | Relation → Workspace Member (many-to-one) | sales rep responsible |
| Notes | Text | |

### Building
| Field | Type | Notes |
|-------|------|-------|
| Name | Text | |
| Building Code | Text | **Unique** — `B001`, CSV relation key |
| Address | Address | |
| Latitude | Number | |
| Longitude | Number | |
| Floors | Number | |
| Units Count | Number | |
| Notes | Text | |

### Home
| Field | Type | Notes |
|-------|------|-------|
| Title | Text | (record display field) |
| Description | Rich Text | |
| Photos | Array | list of photo URLs |
| Property Type | Select | options below |
| Amenities | Multi-Select | options below |
| Highlights | Multi-Select | options below |
| Price Per Night | Currency | |
| Price Per Month | Currency | mkan is hybrid nightly + monthly |
| Security Deposit | Currency | |
| Application Fee | Currency | |
| Guest Count | Number | default 2 |
| Bedrooms | Number | |
| Bathrooms | Number | decimals allowed (1.5) |
| Square Feet | Number | |
| Pets Allowed | Boolean | |
| Parking Included | Boolean | |
| Instant Book | Boolean | |
| Listing Status | Select | pipeline — options below |
| Assigned To | Relation → Workspace Member (many-to-one) | sales rep refining |
| Owner | Relation → Owner (many-to-one) | **required** |
| Building | Relation → Building (many-to-one) | |

> Create the **Owner** and **Building** relations from the **Home** side — the reverse `Homes`
> lists appear on Owner/Building automatically.

## Step 3 — Select / Multi-Select options (enter labels; note API names for CSV)

Enter the **label** exactly as below. Twenty auto-generates an **API name** (uppercase) — the CSV
must use the **API name**. After creating, toggle **Advanced mode** (bottom-right of the field
form) to confirm each API name, since generation of mixed-case labels can vary (e.g. `WiFi`).

**Property Type** (Select): `Rooms, Tinyhouse, Apartment, Villa, Townhouse, Cottage`
→ API: `ROOMS, TINYHOUSE, APARTMENT, VILLA, TOWNHOUSE, COTTAGE`

**Amenities** (Multi-Select) — 13:
`WasherDryer, AirConditioning, Dishwasher, HighSpeedInternet, HardwoodFloors, WalkInClosets, Microwave, Refrigerator, Pool, Gym, Parking, PetsAllowed, WiFi`
→ API (verify): `WASHER_DRYER, AIR_CONDITIONING, DISHWASHER, HIGH_SPEED_INTERNET, HARDWOOD_FLOORS, WALK_IN_CLOSETS, MICROWAVE, REFRIGERATOR, POOL, GYM, PARKING, PETS_ALLOWED, WIFI`

**Highlights** (Multi-Select) — 15:
`HighSpeedInternetAccess, WasherDryer, AirConditioning, Heating, SmokeFree, CableReady, SatelliteTV, DoubleVanities, TubShower, Intercom, SprinklerSystem, RecentlyRenovated, CloseToTransit, GreatView, QuietNeighborhood`
→ API (verify): `HIGH_SPEED_INTERNET_ACCESS, WASHER_DRYER, AIR_CONDITIONING, HEATING, SMOKE_FREE, CABLE_READY, SATELLITE_TV, DOUBLE_VANITIES, TUB_SHOWER, INTERCOM, SPRINKLER_SYSTEM, RECENTLY_RENOVATED, CLOSE_TO_TRANSIT, GREAT_VIEW, QUIET_NEIGHBORHOOD`

**Listing Status** (Select) — onboarding pipeline:
`Draft, Gathering, Review, Verified, Published`
→ API: `DRAFT, GATHERING, REVIEW, VERIFIED, PUBLISHED`

> The example rows in `templates/homes.csv` use these API names. Adjust them if your workspace
> generated different ones.

## Step 4 — Sales team & pipeline

1. **Settings → Members** → invite each sales rep (they log in).
2. On **Home**, create a **Kanban board view** grouped by **Listing Status** — reps drag homes
   `Draft → Gathering → Review → Verified → Published`.
3. Filter views by **Assigned To** to give each rep their queue.
4. Use per-record **Notes/comments + timeline** for collaboration (photos, context, history).

## Step 5 — Gather in the field

Fill the three CSVs (or one flat sheet split into three). Templates in `templates/`:
`owners.csv`, `buildings.csv`, `homes.csv` (each has example Port Sudan rows — replace them).

**CSV format rules (Twenty):**
- **Currency** = two columns, both filled: `... Amount` + `... Currency` (e.g. `45`, `USD`).
- **Multi-Select / Array** = JSON array of **API names**: `["POOL","WIFI"]`.
- **Boolean** = `TRUE` / `FALSE` (uppercase).
- **Numbers** = no thousands separators (`1234.56`, not `1,234.56`).
- **Phone / Address** = nested (separate columns per part).
- **Relations** = match on the parent's **unique** field, **exact & case-sensitive**.
- UTF-8, ≤ 10,000 rows per file.

## Step 6 — Import (order matters: parent before child)

For each: object view → **⋮ → Import records** → upload CSV → map columns → confirm.

1. **Owners** first (`owners.csv`).
2. **Buildings** second (`buildings.csv`).
3. **Homes** last (`homes.csv`) — in mapping, map `ownerAccountCode` → **Owner** relation and
   `buildingCode` → **Building** relation (map only ONE identifier per relation).

## Step 7 — Verify (dry run first)

1. Import 1 owner + 1 building + 1 home; open the home → Owner, Building, Amenities, Highlights
   render; open the owner → home appears under **Homes**.
2. **Mixed ownership:** a 2nd home in the same building with a *different* owner — both under the
   building, different owners.
3. **Team:** assign a home, move it across the Kanban, add a note.
4. Then import the full field data. Failed rows → see Twenty's *fix-import-errors* guide (usually
   a code typo or a missing parent).

---

## Mixed ownership — how it works

Ownership lives on the **Home** (`Home → Owner`). **Building** is just the physical container.
- Owner owns the whole building → all its homes point to that owner.
- Owners share a building → its homes point to different owners.

Same model, no special cases.

## Future (not needed today)

- **Sync CRM ↔ live mkan DB** via mkan API + Twenty REST/GraphQL + webhooks, keyed on
  **Account Code** (Owner ↔ host/Manager) and a stored listing id (Home ↔ Listing). Add a hidden
  unique `mkanListingId` field on Home when sync starts.
- **Transactional objects** (`Tenant`, `Application`, `Lease`, `Payment`) as a phase-2 if the CRM
  should track rentals, not just owners + homes.
- **Schema-as-code:** these objects/fields can also be created via Twenty's Metadata REST API
  (`POST /rest/metadata/objects` then `/fields`) with an API key — a `bootstrap-schema` script can
  be added here to make the setup reproducible across environments.
