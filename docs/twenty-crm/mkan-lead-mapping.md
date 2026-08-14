# Mkan lead → Twenty CRM field mapping

The canonical mapping lives next to the dataset it describes, so the two cannot drift:

**→ [`data/market-research/port-sudan/twenty-crm-mapping.md`](../../data/market-research/port-sudan/twenty-crm-mapping.md)**

It covers:

- why market-research leads map onto the standard **`Company`** object rather than the
  Airbnb-shaped `Host` custom object — the vertical [`growth.md`](../growth.md) §2.2 reserved
  Companies for
- the field-by-field mapping, including the two type traps (`RATING` is 1–5 stars only, so
  Google averages go in `NUMBER`; `address` is reserved on custom objects)
- the three `SOURCE` SELECT options that must be appended before any write, and why
  `crm:sync-options` refuses to remove one
- upsert rules — match on external id, fill-empty-never-replace-populated, human write-lock
- what must **not** be synced

Related: [`growth.md`](../growth.md) (the flywheel) · [`scripts/crm/README.md`](../../scripts/crm/README.md)
(the pipeline) · [`scripts/crm/twenty-schema.ts`](../../scripts/crm/twenty-schema.ts) (the
live object/field source of truth).
