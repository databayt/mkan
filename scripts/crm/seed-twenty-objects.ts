/**
 * Seed the Twenty CRM `Home` + `Host` objects + fields, and the custom fields on
 * the standard `Opportunity` object (Epic G1.1).
 *
 * Targets the LIVE Twenty metadata GraphQL API. **Dry-run by default** (prints the
 * plan, makes no network calls — safe to run while the backend is down). Pass
 * `--apply` with `TWENTY_API_URL` + `TWENTY_API_KEY` to create them for real.
 *
 *   npx tsx scripts/crm/seed-twenty-objects.ts               # dry run (plan only)
 *   TWENTY_API_URL=http://localhost:3100 TWENTY_API_KEY=… \
 *     npx tsx scripts/crm/seed-twenty-objects.ts --apply     # create in Twenty
 *
 * Idempotent: existing objects/fields are detected and skipped, so re-runs only
 * add what's missing. Order: objects → scalar/select fields → relation fields
 * (targets must exist first). Custom fields on standard objects (Opportunity)
 * are added the same way — the standard object already exists.
 *
 * Requires the Twenty BACKEND to be reachable (NestJS server on the local box).
 * `TWENTY_API_URL` is the server base URL; the API key comes from Twenty →
 * Settings → APIs & Webhooks. This script never touches mkan's DB, so the
 * dotenv/`@/lib/db` ordering gotcha does not apply here.
 *
 * Verified against twentyhq/twenty metadata API:
 *   createOneObject(input: { object: CreateObjectInput })
 *   createOneField(input: { field: CreateFieldInput })  // options: JSON, relationCreationPayload: JSON
 */
import { config } from 'dotenv';
import { OBJECTS, STANDARD_FIELD_SETS, toOption, type ObjectDef, type FieldDef } from './twenty-schema';

config({ override: true }); // load central .env (TWENTY_API_URL / TWENTY_API_KEY)

const APPLY = process.argv.includes('--apply');
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const METADATA_ENDPOINT = `${API_URL}/metadata`;

type ObjNode = { id: string; nameSingular: string; fieldsList: { id: string; name: string }[] };

/** All targets that receive fields: our custom objects + field-only standard objects. */
const FIELD_TARGETS: { nameSingular: string; fields: FieldDef[] }[] = [
  ...OBJECTS.map((o) => ({ nameSingular: o.nameSingular, fields: o.fields })),
  ...STANDARD_FIELD_SETS.map((s) => ({ nameSingular: s.object, fields: s.fields })),
];
const scalars = (fields: FieldDef[]) => fields.filter((f) => f.type !== 'RELATION');
const relations = (fields: FieldDef[]) => fields.filter((f) => f.type === 'RELATION');
const totalFields = FIELD_TARGETS.reduce((n, t) => n + t.fields.length, 0);

async function metaGraphQL<T = any>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(METADATA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json as any).errors) {
    throw new Error(`metadata API ${res.status}: ${JSON.stringify((json as any).errors ?? json)}`);
  }
  return (json as any).data as T;
}

async function fetchObjects(): Promise<Map<string, ObjNode>> {
  const data = await metaGraphQL<{ objects: { edges: { node: ObjNode }[] } }>(
    `query Objects { objects(paging: { first: 500 }) { edges { node { id nameSingular fieldsList { id name } } } } }`,
    {},
  );
  const map = new Map<string, ObjNode>();
  for (const e of data.objects.edges) map.set(e.node.nameSingular, e.node);
  return map;
}

async function createObject(o: ObjectDef): Promise<string> {
  const data = await metaGraphQL<{ createOneObject: { id: string } }>(
    `mutation CreateObject($input: CreateOneObjectInput!) { createOneObject(input: $input) { id nameSingular } }`,
    {
      input: {
        object: {
          nameSingular: o.nameSingular,
          namePlural: o.namePlural,
          labelSingular: o.labelSingular,
          labelPlural: o.labelPlural,
          description: o.description,
          icon: o.icon,
        },
      },
    },
  );
  return data.createOneObject.id;
}

function fieldInput(f: FieldDef, objectMetadataId: string, targetId?: string) {
  const input: Record<string, unknown> = { type: f.type, name: f.name, label: f.label, objectMetadataId };
  if (f.description) input.description = f.description;
  if (f.icon) input.icon = f.icon;
  if (f.defaultValue !== undefined) {
    input.defaultValue = typeof f.defaultValue === 'string' && !f.defaultValue.startsWith("'")
      ? `'${f.defaultValue}'`
      : f.defaultValue;
  }
  if (f.options) input.options = f.options.map((v, i) => toOption(v, i));
  if (f.relation && targetId) {
    input.relationCreationPayload = {
      type: f.relation.type,
      targetObjectMetadataId: targetId,
      targetFieldLabel: f.relation.targetFieldLabel,
      targetFieldIcon: f.relation.targetFieldIcon ?? 'IconRelationManyToOne',
    };
  }
  return input;
}

async function createField(input: Record<string, unknown>): Promise<void> {
  await metaGraphQL(
    `mutation CreateField($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name } }`,
    { input: { field: input } },
  );
}

function printPlan() {
  for (const t of FIELD_TARGETS) {
    const std = STANDARD_FIELD_SETS.some((s) => s.object === t.nameSingular);
    console.log(`\n▸ ${std ? 'standard object' : 'object'} ${t.nameSingular}${std ? ' (+custom fields)' : ''}  —  ${t.fields.length} fields`);
    for (const f of t.fields) {
      const extra =
        f.type === 'RELATION'
          ? ` → ${f.relation!.target} (${f.relation!.type})`
          : f.options
            ? ` [${f.options.length} options]`
            : '';
      console.log(`    • ${f.name.padEnd(24)} ${f.type}${extra}`);
    }
  }
}

async function main() {
  console.log('\n🏗  Twenty CRM — seed Home/Host objects + Opportunity fields (Epic G1.1)');

  if (!APPLY) {
    console.log('mode: DRY RUN (no network, no changes)');
    printPlan();
    console.log(`\nDRY RUN complete — ${OBJECTS.length} custom objects, ${totalFields} fields planned.`);
    console.log('To apply:  TWENTY_API_URL=<backend-url> TWENTY_API_KEY=<key> \\');
    console.log('           npx tsx scripts/crm/seed-twenty-objects.ts --apply\n');
    return;
  }

  if (!API_URL || !API_KEY) {
    throw new Error('APPLY mode needs TWENTY_API_URL and TWENTY_API_KEY (the Twenty backend must be reachable).');
  }
  console.log(`mode: APPLY → ${METADATA_ENDPOINT}`);

  // 1) Custom objects (idempotent).
  let existing = await fetchObjects();
  const objectId = new Map<string, string>();
  for (const o of OBJECTS) {
    const found = existing.get(o.nameSingular);
    if (found) {
      objectId.set(o.nameSingular, found.id);
      console.log(`= object ${o.nameSingular} exists — skip`);
    } else {
      objectId.set(o.nameSingular, await createObject(o));
      console.log(`+ object ${o.nameSingular} created`);
    }
  }

  // Refresh: pick up fieldsList for created/existing objects + standard targets (opportunity, person).
  existing = await fetchObjects();
  for (const [name, node] of existing) if (!objectId.has(name)) objectId.set(name, node.id);
  const fieldExists = (obj: string, field: string) =>
    (existing.get(obj)?.fieldsList ?? []).some((f) => f.name === field);

  const runFields = async (predicate: (f: FieldDef) => boolean, resolveTarget: boolean) => {
    for (const t of FIELD_TARGETS) {
      const id = objectId.get(t.nameSingular);
      if (!id) {
        console.warn(`  ! object ${t.nameSingular} not found — skipping its fields`);
        continue;
      }
      for (const f of t.fields.filter(predicate)) {
        if (fieldExists(t.nameSingular, f.name)) {
          console.log(`  = ${t.nameSingular}.${f.name} exists — skip`);
          continue;
        }
        let targetId: string | undefined;
        if (resolveTarget) {
          targetId = objectId.get(f.relation!.target);
          if (!targetId) {
            console.warn(`  ! ${t.nameSingular}.${f.name} skipped — target "${f.relation!.target}" not found`);
            continue;
          }
        }
        try {
          await createField(fieldInput(f, id, targetId));
          console.log(`  + ${t.nameSingular}.${f.name}${resolveTarget ? ` → ${f.relation!.target}` : ` (${f.type})`}`);
        } catch (e) {
          console.warn(`  ! ${t.nameSingular}.${f.name} failed: ${(e as Error).message}`);
        }
      }
    }
  };

  // 2) Scalar / select fields, then 3) relation fields (targets now exist).
  await runFields((f) => f.type !== 'RELATION', false);
  await runFields((f) => f.type === 'RELATION', true);

  console.log('\n✅ Done. Verify in Twenty → Settings → Data Model.');
  console.log('   Next: npx tsx scripts/crm/seed-twenty-views.ts --apply  (creates the saved Views)\n');
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
