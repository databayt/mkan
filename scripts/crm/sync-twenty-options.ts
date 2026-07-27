/**
 * Grow the SELECT / MULTI_SELECT option lists on live Twenty fields (Epic G1.1).
 *
 * `seed-twenty-objects.ts` creates fields but skips any that already exist, so
 * it can add a field and never change one. When `Home.city` went from 6 hard-
 * coded cities to the 50 in `sudan-places.ts`, the seeder was structurally
 * incapable of applying it. This script is the missing half: it diffs declared
 * options against live ones and appends what's new.
 *
 *   pnpm crm:sync-options            # dry run — prints the diff, no writes
 *   pnpm crm:sync-options --apply
 *
 * ── Why this is written defensively ────────────────────────────────────────
 *
 * A SELECT option is not just a label. Twenty backs each one with a Postgres
 * ENUM value on the record table — `_home.city` is of type `_home_city_enum`,
 * verified against the live workspace. Appending a value is an `ALTER TYPE …
 * ADD VALUE`, which is cheap and safe. Removing one is not: Postgres cannot
 * drop an enum value that rows still reference, and Twenty's own migration
 * would have to rewrite or null every record holding it.
 *
 * So removal is a hard refusal, not a warning. `--allow-remove` exists for the
 * day it's genuinely wanted, and prints exactly how many live records it would
 * strand before doing anything.
 *
 * Every surviving option is passed back through **byte-identical, id included**.
 * Twenty keys the enum on the option `value`, so a changed value silently
 * orphans records; re-minting the `id` loses nothing today but is gratuitous.
 * Position and colour are display-only metadata (they live in the field's JSONB,
 * not in the enum), so new options are appended after the highest live position
 * and existing ones keep the position the workspace already gave them — the
 * declared order in `twenty-schema.ts` is a seed, not an instruction.
 */
import { config } from 'dotenv';
import { OBJECTS, STANDARD_FIELD_SETS, toOption, toUpperSnake, type FieldDef } from './twenty-schema';

config({ override: true });

const APPLY = process.argv.includes('--apply');
const ALLOW_REMOVE = process.argv.includes('--allow-remove');
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const METADATA_ENDPOINT = `${API_URL}/metadata`;

/** A Twenty SELECT option exactly as the metadata API returns it. */
interface LiveOption {
  id: string;
  label: string;
  value: string;
  color: string;
  position: number;
}
interface LiveField {
  id: string;
  name: string;
  type: string;
  options: LiveOption[] | null;
}
interface LiveObject {
  id: string;
  nameSingular: string;
  fieldsList: LiveField[];
}

const SELECTABLE = new Set(['SELECT', 'MULTI_SELECT']);

/** Declared fields that carry options, across custom + standard objects. */
const TARGETS: { object: string; fields: FieldDef[] }[] = [
  ...OBJECTS.map((o) => ({ object: o.nameSingular, fields: o.fields })),
  ...STANDARD_FIELD_SETS.map((s) => ({ object: s.object, fields: s.fields })),
].map((t) => ({ object: t.object, fields: t.fields.filter((f) => SELECTABLE.has(f.type) && f.options?.length) }));

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

async function fetchObjects(): Promise<Map<string, LiveObject>> {
  const data = await metaGraphQL<{ objects: { edges: { node: LiveObject }[] } }>(
    `query Objects {
       objects(paging: { first: 500 }) {
         edges { node { id nameSingular fieldsList { id name type options } } }
       }
     }`,
    {},
  );
  return new Map(data.objects.edges.map((e) => [e.node.nameSingular, e.node]));
}

async function updateFieldOptions(fieldId: string, options: LiveOption[]): Promise<void> {
  await metaGraphQL(
    `mutation UpdateField($id: UUID!, $input: UpdateFieldInput!) {
       updateOneField(input: { id: $id, update: $input }) { id name }
     }`,
    { id: fieldId, input: { options } },
  );
}

interface Plan {
  object: string;
  field: string;
  fieldId: string;
  kept: LiveOption[];
  added: LiveOption[];
  removed: LiveOption[];
  /** Declared options whose value collides with a live one under a different label. */
  relabelled: Array<{ value: string; live: string; declared: string }>;
}

function planFor(objectName: string, declared: FieldDef, live: LiveField): Plan {
  const liveOptions = [...(live.options ?? [])].sort((a, b) => a.position - b.position);
  const liveByValue = new Map(liveOptions.map((o) => [o.value, o]));

  // Declared values normalized the same way the seeder writes them, so a
  // PascalCase mkan enum and its stored UPPER_SNAKE form compare equal.
  const declaredValues = (declared.options ?? []).map((raw) => ({ raw, value: toUpperSnake(raw) }));
  const declaredSet = new Set(declaredValues.map((d) => d.value));

  const kept = liveOptions.filter((o) => declaredSet.has(o.value));
  const removed = liveOptions.filter((o) => !declaredSet.has(o.value));

  let nextPosition = liveOptions.reduce((max, o) => Math.max(max, o.position), -1) + 1;
  const added: LiveOption[] = [];
  const relabelled: Plan['relabelled'] = [];

  for (const { raw, value } of declaredValues) {
    const existing = liveByValue.get(value);
    if (existing) {
      const wantLabel = toOption(raw, existing.position).label;
      if (wantLabel !== existing.label) relabelled.push({ value, live: existing.label, declared: wantLabel });
      continue;
    }
    // toOption assigns colour by position so the palette keeps cycling past the
    // options that are already there.
    added.push({ id: crypto.randomUUID(), ...toOption(raw, nextPosition) });
    nextPosition++;
  }

  return { object: objectName, field: declared.name, fieldId: live.id, kept, added, removed, relabelled };
}

async function main() {
  console.log('\n🔧 Twenty CRM — grow SELECT options (append-only)');
  if (!API_URL || !API_KEY) throw new Error('needs TWENTY_API_URL and TWENTY_API_KEY in .env');
  console.log(`   ${APPLY ? 'APPLY' : 'DRY RUN'} → ${METADATA_ENDPOINT}\n`);

  const liveObjects = await fetchObjects();
  const plans: Plan[] = [];
  for (const target of TARGETS) {
    const obj = liveObjects.get(target.object);
    if (!obj) {
      console.warn(`  ! object "${target.object}" not in workspace — run crm:seed-objects --apply first`);
      continue;
    }
    for (const declared of target.fields) {
      const live = obj.fieldsList.find((f) => f.name === declared.name);
      if (!live) {
        console.log(`  · ${target.object}.${declared.name} not created yet — crm:seed-objects will add it`);
        continue;
      }
      if (!SELECTABLE.has(live.type)) {
        console.warn(`  ! ${target.object}.${declared.name} is ${live.type} live but SELECT declared — skipping`);
        continue;
      }
      plans.push(planFor(target.object, declared, live));
    }
  }

  const changed = plans.filter((p) => p.added.length || p.removed.length);
  const removals = plans.filter((p) => p.removed.length);

  for (const p of changed) {
    console.log(`▸ ${p.object}.${p.field}  (${p.kept.length} kept, +${p.added.length}, −${p.removed.length})`);
    if (p.added.length) {
      const preview = p.added.slice(0, 12).map((o) => o.value);
      console.log(`    + ${preview.join(', ')}${p.added.length > 12 ? ` … and ${p.added.length - 12} more` : ''}`);
    }
    for (const o of p.removed) console.log(`    − ${o.value}   ← would strand every record holding it`);
  }
  for (const p of plans) {
    for (const r of p.relabelled) {
      console.log(`  · ${p.object}.${p.field} "${r.value}" label differs (live "${r.live}" vs declared "${r.declared}") — left alone`);
    }
  }

  if (!changed.length) {
    console.log('  Nothing to change — live options already match the schema.\n');
    return;
  }

  if (removals.length && !ALLOW_REMOVE) {
    console.error(
      `\n❌ Refusing to apply: ${removals.length} field(s) would lose options.\n` +
        '   Twenty backs each option with a Postgres enum value on the record table,\n' +
        '   so dropping one orphans every record that holds it. Add the value back to\n' +
        '   twenty-schema.ts, or pass --allow-remove if the loss is intended.\n',
    );
    process.exit(1);
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — ${changed.length} field(s) would change. Re-run with --apply.\n`);
    return;
  }

  for (const p of changed) {
    // Existing options are passed through byte-identical; only the tail is new.
    const next = [...p.kept, ...(ALLOW_REMOVE ? [] : p.removed), ...p.added].sort((a, b) => a.position - b.position);
    try {
      await updateFieldOptions(p.fieldId, next);
      console.log(`  ✓ ${p.object}.${p.field} → ${next.length} options`);
    } catch (e) {
      console.error(`  ✗ ${p.object}.${p.field}: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }

  // Prove nothing was lost rather than assume it: re-read and compare.
  const after = await fetchObjects();
  let drift = 0;
  for (const p of changed) {
    const live = after.get(p.object)?.fieldsList.find((f) => f.name === p.field);
    const values = new Set((live?.options ?? []).map((o) => o.value));
    for (const o of p.kept) {
      if (!values.has(o.value)) {
        console.error(`  ✗ ${p.object}.${p.field} lost pre-existing option ${o.value}`);
        drift++;
      }
    }
  }
  console.log(drift ? `\n❌ ${drift} pre-existing option(s) lost.\n` : '\n✅ Applied; every pre-existing option still present.\n');
  if (drift) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
