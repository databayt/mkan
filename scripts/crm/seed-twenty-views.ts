/**
 * Seed the Twenty CRM saved Views for the mkan Growth Engine (Epic G1.1).
 *
 * Run AFTER `seed-twenty-objects.ts` (views reference field metadata ids).
 * Dry-run by default; `--apply` with TWENTY_API_URL + TWENTY_API_KEY executes.
 *
 *   npx tsx scripts/crm/seed-twenty-views.ts               # dry run (plan only)
 *   TWENTY_API_URL=http://localhost:3100 TWENTY_API_KEY=… \
 *     npx tsx scripts/crm/seed-twenty-views.ts --apply     # create in Twenty
 *
 * Idempotent by (object, view name): a view that already exists is skipped.
 * Columns / kanban grouping / sorts are created reliably; filters are applied
 * best-effort (Twenty's filter-value encoding is version-sensitive) and logged
 * on failure — tweak those in the UI if any don't stick.
 *
 * Verified against twentyhq/twenty metadata API: createView / createViewField /
 * createViewSort / createViewFilter, getViews(objectMetadataId).
 */
import { config } from 'dotenv';
import { VIEWS, type ViewDef } from './twenty-views';

config({ override: true }); // load central .env (TWENTY_API_URL / TWENTY_API_KEY)

const APPLY = process.argv.includes('--apply');
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const METADATA_ENDPOINT = `${API_URL}/metadata`;

type ObjNode = { id: string; nameSingular: string; fieldsList: { id: string; name: string }[] };

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

async function fetchObjects() {
  const data = await metaGraphQL<{ objects: { edges: { node: ObjNode }[] } }>(
    `query Objects { objects(paging: { first: 500 }) { edges { node { id nameSingular fieldsList { id name } } } } }`,
    {},
  );
  // nameSingular → { id, field name → fieldMetadataId }
  const map = new Map<string, { id: string; fields: Map<string, string> }>();
  for (const e of data.objects.edges) {
    const fields = new Map(e.node.fieldsList.map((f) => [f.name, f.id]));
    map.set(e.node.nameSingular, { id: e.node.id, fields });
  }
  return map;
}

async function fetchExistingViewKeys(): Promise<Set<string>> {
  const data = await metaGraphQL<{ getViews: { name: string; objectMetadataId: string }[] }>(
    `query GetViews { getViews { id name objectMetadataId } }`,
    {},
  );
  return new Set(data.getViews.map((v) => `${v.objectMetadataId}::${v.name}`));
}

async function main() {
  console.log('\n🏗  Twenty CRM — seed saved Views (Epic G1.1)');

  if (!APPLY) {
    console.log('mode: DRY RUN (no network, no changes)');
    for (const v of VIEWS) {
      const g = v.type === 'KANBAN' ? ` — group by ${v.groupBy}` : '';
      console.log(`\n▸ ${v.type.padEnd(6)} ${v.name}  (${v.object})${g}`);
      console.log(`    columns: ${v.fields.join(', ')}`);
      if (v.sorts?.length) console.log(`    sort:    ${v.sorts.map((s) => `${s.field} ${s.direction}`).join(', ')}`);
      if (v.filters?.length) console.log(`    filter:  ${v.filters.map((f) => `${f.field} ${f.operand}${f.value !== undefined ? ` ${JSON.stringify(f.value)}` : ''}`).join(', ')}`);
    }
    console.log(`\nDRY RUN complete — ${VIEWS.length} views planned.`);
    console.log('To apply:  TWENTY_API_URL=<backend-url> TWENTY_API_KEY=<key> \\');
    console.log('           npx tsx scripts/crm/seed-twenty-views.ts --apply\n');
    return;
  }

  if (!API_URL || !API_KEY) {
    throw new Error('APPLY mode needs TWENTY_API_URL and TWENTY_API_KEY (the Twenty backend must be reachable).');
  }
  console.log(`mode: APPLY → ${METADATA_ENDPOINT}`);

  const objects = await fetchObjects();
  const existingViews = await fetchExistingViewKeys();

  for (const v of VIEWS) {
    const obj = objects.get(v.object);
    if (!obj) {
      console.warn(`! view "${v.name}" skipped — object "${v.object}" not found (seed objects first)`);
      continue;
    }
    if (existingViews.has(`${obj.id}::${v.name}`)) {
      console.log(`= view "${v.name}" exists — skip`);
      continue;
    }

    let groupById: string | undefined;
    if (v.type === 'KANBAN') {
      groupById = obj.fields.get(v.groupBy!);
      if (!groupById) {
        console.warn(`! view "${v.name}" skipped — kanban group field "${v.groupBy}" not found`);
        continue;
      }
    }

    // Create the view shell.
    let viewId: string;
    try {
      const data = await metaGraphQL<{ createView: { id: string } }>(
        `mutation CreateView($input: CreateViewInput!) { createView(input: $input) { id } }`,
        { input: { name: v.name, objectMetadataId: obj.id, type: v.type, icon: v.icon, ...(groupById ? { mainGroupByFieldMetadataId: groupById } : {}) } },
      );
      viewId = data.createView.id;
      console.log(`+ view "${v.name}" (${v.type}, ${v.object})`);
    } catch (e) {
      console.warn(`! view "${v.name}" failed: ${(e as Error).message}`);
      continue;
    }

    // Visible columns (ordered).
    let position = 0;
    for (const fieldName of v.fields) {
      const fieldId = obj.fields.get(fieldName);
      if (!fieldId) {
        console.warn(`    ! column "${fieldName}" not found — skipped`);
        continue;
      }
      try {
        await metaGraphQL(
          `mutation CreateViewField($input: CreateViewFieldInput!) { createViewField(input: $input) { id } }`,
          { input: { viewId, fieldMetadataId: fieldId, isVisible: true, position: position++ } },
        );
      } catch (e) {
        console.warn(`    ! column "${fieldName}" failed: ${(e as Error).message}`);
      }
    }

    // Sorts.
    for (const s of v.sorts ?? []) {
      const fieldId = obj.fields.get(s.field);
      if (!fieldId) {
        console.warn(`    ! sort "${s.field}" not found — skipped`);
        continue;
      }
      try {
        await metaGraphQL(
          `mutation CreateViewSort($input: CreateViewSortInput!) { createViewSort(input: $input) { id } }`,
          { input: { viewId, fieldMetadataId: fieldId, direction: s.direction } },
        );
      } catch (e) {
        console.warn(`    ! sort "${s.field}" failed: ${(e as Error).message}`);
      }
    }

    // Filters (best-effort — value encoding is version-sensitive).
    for (const f of v.filters ?? []) {
      const fieldId = obj.fields.get(f.field);
      if (!fieldId) {
        console.warn(`    ! filter "${f.field}" not found — skipped`);
        continue;
      }
      try {
        await metaGraphQL(
          `mutation CreateViewFilter($input: CreateViewFilterInput!) { createViewFilter(input: $input) { id } }`,
          { input: { viewId, fieldMetadataId: fieldId, operand: f.operand, value: f.value ?? '' } },
        );
      } catch (e) {
        console.warn(`    ~ filter "${f.field} ${f.operand}" not applied (set it in the UI): ${(e as Error).message}`);
      }
    }
  }

  console.log('\n✅ Done. Verify the views in the Twenty workspace sidebar.\n');
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
