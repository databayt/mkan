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

## Still to add (later G1 steps)

- The `Note` / `Task` (Activity) custom fields — `channel`, `host`, `home` (§2.6). Small;
  the "Follow-ups due" view already works on standard Task fields without them.
- Then the pipeline itself: `docs/growth.md` §7 — G1.2 scraper + ingest · G1.3 trust
  scoring · G1.4 photo re-host + SR→SDG · G1.5 provision/import · G1.6 OpenClaw outreach ·
  G1.7 wave publish.
