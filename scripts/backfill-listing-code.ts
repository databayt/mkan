/**
 * One-shot backfill for `Listing.code` — see the migration
 * `20260824100000_add_listing_code` for why the column exists.
 *
 * The mkan code (`0001-01`) used to live in `Listing.sourceListingId`, which
 * is the EXTERNAL id. 34 rows carry a code there today. This script moves them
 * onto the new column and gives `sourceListingId` its meaning back.
 *
 * ── Run it in two phases, and mind the order ─────────────────────────────────
 *
 * Phase A copies the code into `code` and leaves `sourceListingId` alone. After
 * it, both columns hold the code, so a `/listings/0001-01` request resolves
 * whether the deployed resolver looks at the old column or the new one. It is
 * safe to run before or after a deploy.
 *
 * Phase B is the destructive half: it restores the 8 scraped rows' Airbnb room
 * id (recovered from `sourceUrl`) and nulls the 26 MANUAL rows' code-shaped
 * `sourceListingId`. Run it ONLY once the resolver that reads `code` is live —
 * before that it would take every CRM and WhatsApp link offline.
 *
 *   npx tsx scripts/backfill-listing-code.ts                    # dry plan, both phases
 *   npx tsx scripts/backfill-listing-code.ts --phase=a --apply  # safe half
 *   npx tsx scripts/backfill-listing-code.ts --phase=b --apply  # after the deploy is live
 *
 * Idempotent: re-running skips rows already in the target state.
 */
import { config } from 'dotenv';
config({ override: true });

import { LISTING_CODE_RE } from '@/lib/listing-code';

const APPLY = process.argv.includes('--apply');
const PHASE = (process.argv.find((a) => a.startsWith('--phase=')) ?? '--phase=all').split('=')[1]!.toLowerCase();
const ROOM_ID_RE = /\/rooms\/(\d+)/;

async function main(): Promise<void> {
  const { db } = await import('@/lib/db');

  const coded = await db.listing.findMany({
    where: { OR: [{ sourceListingId: { contains: '-' } }, { code: { not: null } }] },
    select: { id: true, code: true, source: true, sourceListingId: true, sourceUrl: true, isPublished: true },
    orderBy: { id: 'asc' },
  });
  const rows = coded.filter((l) => LISTING_CODE_RE.test(l.code ?? '') || LISTING_CODE_RE.test(l.sourceListingId ?? ''));
  console.log(`\n📇 ${rows.length} listing(s) carry a code\n`);

  // ── Phase A — populate `code` ──────────────────────────────────────────────
  if (PHASE === 'a' || PHASE === 'all') {
    const todo = rows.filter((l) => !l.code && LISTING_CODE_RE.test(l.sourceListingId ?? ''));
    console.log(`── Phase A · copy the code into its own column · ${todo.length} row(s)`);
    for (const l of todo) console.log(`   #${l.id} → code=${l.sourceListingId}`);
    if (APPLY) {
      for (const l of todo) await db.listing.update({ where: { id: l.id }, data: { code: l.sourceListingId } });
      console.log(`   ✅ ${todo.length} updated`);
    } else if (todo.length) {
      console.log('   (dry run)');
    }
    // In memory either way, so a dry `--phase=all` prints the plan phase B
    // would actually follow rather than refusing on a state phase A just fixed.
    for (const l of todo) l.code = l.sourceListingId;
    console.log('');
  }

  // ── Phase B — give `sourceListingId` its meaning back ──────────────────────
  if (PHASE === 'b' || PHASE === 'all') {
    const stale = rows.filter((l) => LISTING_CODE_RE.test(l.sourceListingId ?? ''));
    const external = stale.filter((l) => l.source === 'AIRBNB');
    const own = stale.filter((l) => l.source !== 'AIRBNB');

    // Recover each scraped row's Airbnb room id from the URL that survived the
    // overwrite. A row we cannot recover, or a room id another row already
    // holds, aborts the whole phase — a partial restore would leave the
    // provenance half-true, which is worse than not started.
    const restores: Array<{ id: number; roomId: string }> = [];
    const problems: string[] = [];
    for (const l of external) {
      const roomId = ROOM_ID_RE.exec(l.sourceUrl ?? '')?.[1];
      if (!roomId) {
        problems.push(`#${l.id} (${l.code ?? l.sourceListingId}) — no room id in sourceUrl: ${l.sourceUrl ?? 'null'}`);
        continue;
      }
      restores.push({ id: l.id, roomId });
    }
    const roomIds = restores.map((r) => r.roomId);
    const clashes = roomIds.length
      ? await db.listing.findMany({
          where: { sourceListingId: { in: roomIds }, id: { notIn: restores.map((r) => r.id) } },
          select: { id: true, sourceListingId: true },
        })
      : [];
    for (const c of clashes) problems.push(`room id ${c.sourceListingId} is already held by listing #${c.id}`);

    console.log(`── Phase B · restore ${restores.length} Airbnb room id(s), clear ${own.length} mkan-native one(s)`);
    for (const r of restores) console.log(`   #${r.id} → sourceListingId=${r.roomId}`);
    for (const l of own) console.log(`   #${l.id} → sourceListingId=null  (${l.source ?? 'no source'}, code ${l.code ?? l.sourceListingId})`);

    if (problems.length) {
      console.log(`\n   ❌ ${problems.length} problem(s) — phase B not run:`);
      for (const p of problems) console.log(`      · ${p}`);
      console.log('');
      process.exitCode = 1;
      return;
    }

    // Nothing here may run before every row has its code, or the restore
    // erases the only copy of it.
    const uncoded = stale.filter((l) => !LISTING_CODE_RE.test(l.code ?? ''));
    if (uncoded.length) {
      console.log(`\n   ❌ ${uncoded.length} row(s) still have no \`code\` — run phase A first:`);
      for (const l of uncoded) console.log(`      · #${l.id} ${l.sourceListingId}`);
      console.log('');
      process.exitCode = 1;
      return;
    }

    if (APPLY) {
      for (const l of own) await db.listing.update({ where: { id: l.id }, data: { sourceListingId: null } });
      for (const r of restores) await db.listing.update({ where: { id: r.id }, data: { sourceListingId: r.roomId } });
      console.log(`   ✅ ${own.length + restores.length} updated`);
    } else if (stale.length) {
      console.log('   (dry run)');
    }
    console.log('');
  }

  // ── The invariant this whole change exists to hold ─────────────────────────
  const publishedUncoded = await db.listing.count({
    where: { isPublished: true, OR: [{ code: null }, { NOT: { code: { contains: '-' } } }] },
  });
  const published = await db.listing.count({ where: { isPublished: true } });
  console.log(
    publishedUncoded === 0
      ? `✅ all ${published} published listing(s) carry a code — mkan.sd and the CRM address every public row by the same string\n`
      : `⚠️  ${publishedUncoded} of ${published} published listing(s) have no code — they resolve by row id only\n`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
