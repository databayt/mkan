/**
 * Publish every Airbnb-sourced home; hide everything else.
 *
 * The public grid and the listing page both gate on `Listing.isPublished`
 * (`src/app/[lang]/listings/[id]/page.tsx:151` 404s an unpublished row, so
 * hiding a home is exactly this one flag — its slug stops resolving). This
 * script makes `source = 'AIRBNB'` the whole of the live catalogue:
 *
 *   AIRBNB      → isPublished = true,  draft = false
 *   everything  → isPublished = false            (draft is left alone)
 *
 * ── Why `draft` is left alone on the hide half ──────────────────────────────
 * The Twenty webhook pairs `isPublished=false` with `draft=true`, but `draft`
 * means "the host never finished the create flow" — `/hosting` lists draft rows
 * as unfinished setups (`hosting/page.tsx:63`). Flipping it on 25 finished,
 * claimed homes would file them as half-built. Hiding is one flag; this keeps
 * the change reversible to exactly the state the snapshot records.
 *
 * ── The code invariant ──────────────────────────────────────────────────────
 * `listing-code-server.ts` states it: every row that flips `isPublished` true
 * mints its `NNNN-NN` code. So this calls `ensureListingCode` for each newly
 * published row. 19 of them are held by the 6 `legacy-*@mkan.org` hosts, who
 * have no account number to build a code from — those stay uncoded on purpose
 * and remain reachable by Airbnb room id via `listingSegment`'s fallback.
 *
 *   npx tsx scripts/publish-airbnb-only.ts                     # dry plan
 *   npx tsx scripts/publish-airbnb-only.ts --apply             # do it
 *   npx tsx scripts/publish-airbnb-only.ts --restore=<file>    # put it all back
 *
 * Idempotent: re-running skips rows already in the target state.
 */
import { config } from 'dotenv';
config({ override: true });

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.find((a) => a.startsWith('--restore='))?.split('=')[1];

/** Non-Airbnb, written so a future NULL-source row is hidden too rather than skipped. */
const NOT_AIRBNB = { OR: [{ source: { not: 'AIRBNB' as const } }, { source: null }] };

type Snapshot = { id: number; isPublished: boolean; draft: boolean; code: string | null }[];

async function main(): Promise<void> {
  const { db } = await import('@/lib/db');
  const { ensureListingCode } = await import('@/lib/listing-code-server');

  // ── Restore mode — replay a snapshot and stop ──────────────────────────────
  if (RESTORE) {
    const snap = JSON.parse(readFileSync(RESTORE, 'utf8')) as Snapshot;
    console.log(`\n♻️  restoring ${snap.length} row(s) from ${RESTORE}\n`);
    let changed = 0;
    for (const row of snap) {
      const now = await db.listing.findUnique({
        where: { id: row.id },
        select: { isPublished: true, draft: true },
      });
      if (!now) continue;
      if (now.isPublished === row.isPublished && now.draft === row.draft) continue;
      if (APPLY) {
        await db.listing.update({
          where: { id: row.id },
          data: { isPublished: row.isPublished, draft: row.draft },
        });
      }
      changed++;
    }
    console.log(`   ${APPLY ? `✅ ${changed} restored` : `(dry run) ${changed} would be restored`}\n`);
    return;
  }

  const before = await db.listing.findMany({
    select: { id: true, isPublished: true, draft: true, code: true, source: true },
    orderBy: { id: 'asc' },
  });
  const airbnb = before.filter((l) => l.source === 'AIRBNB');
  const others = before.filter((l) => l.source !== 'AIRBNB');
  const toPublish = airbnb.filter((l) => !l.isPublished || l.draft);
  const toHide = others.filter((l) => l.isPublished);

  console.log(`\n📇 ${before.length} listing(s) — ${airbnb.length} AIRBNB, ${others.length} other\n`);
  console.log(`── publish · AIRBNB · ${toPublish.length} row(s) change (${airbnb.length - toPublish.length} already live)`);
  console.log(`── hide    · other  · ${toHide.length} row(s) change (${others.length - toHide.length} already hidden)`);
  const needCode = airbnb.filter((l) => !l.code).length;
  console.log(`── codes   · ${needCode} published row(s) will need one minted\n`);

  if (!APPLY) {
    console.log('   (dry run — pass --apply to write)\n');
    return;
  }

  // ── Snapshot first: this is a production write with no confirm step ────────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapPath = join(process.cwd(), '.data', `publish-airbnb-only-${stamp}.json`);
  mkdirSync(dirname(snapPath), { recursive: true });
  writeFileSync(
    snapPath,
    JSON.stringify(
      before.map(({ id, isPublished, draft, code }) => ({ id, isPublished, draft, code })),
      null,
      2,
    ),
  );
  console.log(`   💾 snapshot → ${snapPath}`);
  console.log(`      restore with: npx tsx scripts/publish-airbnb-only.ts --restore=${snapPath} --apply\n`);

  // Both halves in one transaction — the catalogue is never briefly empty and
  // never briefly doubled.
  const [published, hidden] = await db.$transaction([
    db.listing.updateMany({ where: { source: 'AIRBNB' }, data: { isPublished: true, draft: false } }),
    db.listing.updateMany({ where: NOT_AIRBNB, data: { isPublished: false } }),
  ]);
  console.log(`   ✅ ${published.count} AIRBNB published · ${hidden.count} other hidden`);

  // Codes are minted per row (each allocates the host's next free unit), so
  // they cannot join the transaction above.
  let minted = 0;
  let uncoded = 0;
  for (const l of airbnb) {
    if (l.code) continue;
    const code = await ensureListingCode(l.id);
    if (code) minted++;
    else uncoded++;
  }
  console.log(`   🔖 ${minted} code(s) minted · ${uncoded} left uncoded (no host account number)`);

  const after = await db.listing.groupBy({
    by: ['source', 'isPublished'],
    _count: { _all: true },
    orderBy: [{ source: 'asc' }, { isPublished: 'asc' }],
  });
  console.log('\n── after ──');
  for (const r of after) {
    console.log(`   ${String(r.source ?? '(null)').padEnd(8)} isPublished=${String(r.isPublished).padEnd(5)} ${r._count._all}`);
  }
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
