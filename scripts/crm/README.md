# CRM seeding — Twenty objects (Epic G1.1)

Tooling that materializes the [Growth Engine](../../docs/growth.md) CRM design in the
live **Twenty** workspace (`mkan.crm.databayt.org`). This first step (**G1.1**) creates the
`Home` and `Host` custom objects and all their fields.

| File | What |
| --- | --- |
| `twenty-schema.ts` | Declarative source of truth — the `Home`/`Host` objects + every field (name, label, Twenty `FieldMetadataType`, SELECT options, relations). Mirrors `docs/growth.md` §2.3–§2.4. |
| `seed-twenty-objects.ts` | Idempotent seeder — pushes the schema to Twenty's **metadata GraphQL API**. Dry-run by default. |

## Run

**Dry run** (no backend needed — prints the full plan):

```bash
npx tsx scripts/crm/seed-twenty-objects.ts
```

**Apply** (creates the objects/fields in Twenty — the **backend must be up**):

```bash
TWENTY_API_URL=http://localhost:3000 \
TWENTY_API_KEY=<token from Twenty → Settings → APIs & Webhooks> \
  npx tsx scripts/crm/seed-twenty-objects.ts --apply
```

- `TWENTY_API_URL` is the Twenty **server** base URL (the metadata API lives at
  `<url>/metadata`). Since the backend runs on the local machine, this is that box's URL
  (or a tunnel to it) — **not** the Vercel frontend URL.
- Idempotent: re-runs skip objects/fields that already exist, so it's safe to run again
  after adding fields to `twenty-schema.ts`.

## Notes & caveats

- **Verified** against `twentyhq/twenty` (field-type enum + `createOneObject` /
  `createOneField` input shapes). Twenty's metadata API can shift between versions — if a
  specific field fails, the seeder logs it and continues; adjust and re-run.
- Twenty auto-creates each object's label field (`name`), so it isn't declared here.
- SELECT/MULTI_SELECT options are generated with cycling tag colors; edit `TAG_COLORS` /
  `toOption` in `twenty-schema.ts` to taste.
- **Not yet included** (next G1.1 sub-step): the custom fields on the standard
  `Opportunity` / `Note` / `Task` objects (the onboarding pipeline `onboarding_stage`
  Select, outreach fields, `channel`) and the 10 saved Views — see `docs/growth.md`
  §2.5–§2.8. Add them once `Home`/`Host` are confirmed in the live workspace.

## Next (Epic G1)

`docs/growth.md` §7: G1.2 scraper + ingest · G1.3 trust scoring · G1.4 photo re-host +
SR→SDG · G1.5 provision/import scripts · G1.6 OpenClaw outreach · G1.7 wave publish.
