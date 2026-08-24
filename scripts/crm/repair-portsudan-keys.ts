/**
 * Repair the Port Sudan rows of the Twenty `Home` object.
 *
 *   npx tsx scripts/crm/repair-portsudan-keys.ts            # dry run — prints the plan
 *   npx tsx scripts/crm/repair-portsudan-keys.ts --apply    # PATCH + DELETE in Twenty
 *
 * Two faults, one pass:
 *
 * 1. **Stale `mkanListingId`.** `seed:heirs` / `seed:railway` / `seed:hussein`
 *    mint new listing ids every time they rebuild, and the CRM keeps the old
 *    ones. `mkanListingId` is the only key `sync-down` / `sync-up` and the
 *    mastering rollup match on, so a stale row is skipped in silence — the
 *    board quietly telling a story the site stopped telling. This is the
 *    general form of the 0001-only repair in `sync-heirs-photos-twenty.ts`;
 *    **re-run it after any re-seed.**
 *
 * 2. **Duplicate rows.** One home, two Home records. The twins carry `name`
 *    but an empty `title` (Twenty round-trips absent text as `""`, so they
 *    read blank in any title-keyed view) and no `mkanListingId`.
 *
 * The durable key is the unit code — `Home.listingId` = `Listing.code`
 * ("0002-01"). It survives a re-seed; the numeric id does not. (The code lived
 * in `Listing.sourceListingId` until 2026-08-24, which is why that column is
 * still consulted for the Airbnb id and no longer for the code.) Rows are
 * resolved to a site listing by, in order: airbnbListingId → mkanListingId →
 * unit code → normalized title. Rows that resolve to the same listing are one
 * home.
 *
 * Merging is **fill-empty, never replace-populated** — the same rule that governs
 * `sync-contacts-to-twenty.ts` and `backfill-listing-facts.ts`. The keeper is the
 * row carrying a real `title`; anything the loser holds that the keeper lacks is
 * copied up before the loser is deleted, and a loser is only deleted after its
 * keeper's PATCH succeeded.
 *
 * Scope is `city == 'PORT_SUDAN'` on the `Home` object only. The `portSudans`
 * object is already correct and is not touched.
 *
 * Needs the CRM backend up (Docker on the Mac, port 3100 — never 3000) and the
 * mkan workspace token in the Keychain (`databayt-twenty` / `mkan`).
 */
import { config } from 'dotenv';
config({ override: true });

import { execSync } from 'node:child_process';

const APPLY = process.argv.includes('--apply');
const CITY = 'PORT_SUDAN';

if (!process.env.TWENTY_API_URL) process.env.TWENTY_API_URL = 'http://localhost:3100';
if (!process.env.TWENTY_API_KEY) {
  process.env.TWENTY_API_KEY = execSync(
    'security find-generic-password -s databayt-twenty -a mkan -w',
    { encoding: 'utf8' }
  ).trim();
}

/** Twenty-managed columns: never merged, never compared. */
const SYSTEM_FIELDS = new Set([
  'id', 'createdAt', 'updatedAt', 'deletedAt', 'position',
  'createdBy', 'updatedBy', 'searchVector', 'host', 'opportunity',
]);

const norm = (s: unknown): string => String(s ?? '').replace(/[\s—–-]+/g, ' ').trim();

/** Twenty returns "" for absent text and objects with all-null members for absent composites. */
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .filter(([k]) => k !== 'secondaryLinks' && k !== 'additionalPhones' && k !== 'additionalEmails')
      .every(([, x]) => isEmpty(x));
  }
  return false;
}

async function main(): Promise<void> {
  const { twentyClient } = await import('./twenty-rest');
  const { db } = await import('@/lib/db');
  const twenty = twentyClient();

  console.log(`\n🔧 Port Sudan key repair  (${APPLY ? 'APPLY' : 'dry run'})\n`);

  const homes = (await twenty.all('homes')) as Record<string, any>[];
  const rows = homes.filter((h) => String(h.city ?? '') === CITY);

  const listings = await db.listing.findMany({
    select: { id: true, title: true, code: true, sourceListingId: true, isPublished: true },
  });
  const byId = new Map(listings.map((l) => [l.id, l]));
  const bySource = new Map(listings.filter((l) => l.sourceListingId).map((l) => [l.sourceListingId!, l]));
  const byCode = new Map(listings.filter((l) => l.code).map((l) => [l.code!, l]));
  const byTitle = new Map(listings.map((l) => [norm(l.title), l]));

  const resolve = (h: Record<string, any>) => {
    const airbnb = String(h.airbnbListingId ?? '').trim();
    if (airbnb && bySource.has(airbnb)) return bySource.get(airbnb)!;
    if (h.mkanListingId != null && byId.has(h.mkanListingId)) return byId.get(h.mkanListingId)!;
    const unit = String(h.listingId ?? '').trim();
    if (unit && byCode.has(unit)) return byCode.get(unit)!;
    const label = norm(h.title) || norm(h.name);
    return label ? byTitle.get(label) : undefined;
  };

  const groups = new Map<number, Record<string, any>[]>();
  const unresolved: Record<string, any>[] = [];
  for (const h of rows) {
    const l = resolve(h);
    if (!l) { unresolved.push(h); continue; }
    groups.set(l.id, [...(groups.get(l.id) ?? []), h]);
  }

  const keyPatches: { row: Record<string, any>; from: unknown; to: number; label: string }[] = [];
  const merges: { keeper: Record<string, any>; loser: Record<string, any>; fields: string[]; body: Record<string, unknown>; listingId: number }[] = [];

  for (const [listingId, members] of groups) {
    // Keeper = the row carrying a real title; ties break on field count.
    const ranked = [...members].sort((a, b) => {
      const t = Number(!isEmpty(b.title)) - Number(!isEmpty(a.title));
      if (t) return t;
      const fill = (h: Record<string, any>) =>
        Object.entries(h).filter(([k, v]) => !SYSTEM_FIELDS.has(k) && !isEmpty(v)).length;
      return fill(b) - fill(a);
    });
    const [keeper, ...losers] = ranked;
    const label = (norm(keeper.title) || norm(keeper.name)).slice(0, 34);

    if (keeper.mkanListingId !== listingId) {
      keyPatches.push({ row: keeper, from: keeper.mkanListingId ?? null, to: listingId, label });
    }

    for (const loser of losers) {
      const body: Record<string, unknown> = {};
      const fields: string[] = [];
      for (const [k, v] of Object.entries(loser)) {
        if (SYSTEM_FIELDS.has(k)) continue;
        if (isEmpty(v)) continue;
        if (!isEmpty(keeper[k])) continue;   // fill empty, never replace populated
        body[k] = v;
        fields.push(k);
      }
      merges.push({ keeper, loser, fields, body, listingId });
    }
  }

  console.log(`   ${rows.length} Home rows in ${CITY} → ${groups.size} distinct homes`);
  console.log(`   ${keyPatches.length} stale/missing mkanListingId to repair`);
  console.log(`   ${merges.length} duplicate rows to merge + delete`);
  if (unresolved.length) console.log(`   ⚠ ${unresolved.length} rows resolve to no listing — left untouched`);

  if (keyPatches.length) {
    console.log('\n   ── key repairs ──');
    for (const p of keyPatches) {
      console.log(`     ${String(p.from ?? '—').padEnd(6)} → ${String(p.to).padEnd(6)} ${p.label}`);
    }
  }
  if (merges.length) {
    console.log('\n   ── merges (loser → keeper, then delete loser) ──');
    for (const m of merges) {
      const carried = m.fields.length ? `carries ${m.fields.join(', ')}` : 'nothing to carry';
      console.log(`     #${String(m.listingId).padEnd(5)} ${carried}`);
    }
  }

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply.\n');
    return;
  }

  let patched = 0, merged = 0, deleted = 0;

  for (const p of keyPatches) {
    await twenty.rest('PATCH', `homes/${p.row.id}`, { mkanListingId: p.to });
    patched++;
  }
  console.log(`\n   ✓ ${patched} mkanListingId repaired`);

  for (const m of merges) {
    // The keeper must be whole before the loser goes; a failed PATCH throws and
    // stops the run rather than deleting a row whose data never landed.
    if (m.fields.length) {
      await twenty.rest('PATCH', `homes/${m.keeper.id}`, m.body);
      merged++;
    }
    await twenty.rest('DELETE', `homes/${m.loser.id}`);
    deleted++;
  }
  console.log(`   ✓ ${merged} keepers enriched, ${deleted} duplicate rows deleted\n`);
}

main()
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  })
  .finally(async () => {
    const { db } = await import('@/lib/db');
    await db.$disconnect();
  });
