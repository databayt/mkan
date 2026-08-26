/**
 * Where is every image, and why (doc §17 + §19).
 *
 *   pnpm master:status                # all listings with runs
 *   pnpm master:status --listing=123
 *
 * Per listing: N/M mastered progress and one line per run — id tail, photo,
 * status, attempt, age, stale flag, note/failure. ORIGINAL photos (no run yet)
 * are shown as a count, since absence is that state.
 */
import { argv, getDb, isDrifted, shortId, ago, hoursAgo, STALE, describeError } from './lib';

const LISTING = parseInt(argv('listing', '0'), 10) || 0;

const STALE_CHECK: Record<string, { at: 'queuedAt' | 'assignedAt' | 'masteredAt'; h: number }> = {
  QUEUED: { at: 'queuedAt', h: STALE.QUEUED_H },
  ASSIGNED: { at: 'assignedAt', h: STALE.ASSIGNED_H },
  MASTERED: { at: 'masteredAt', h: STALE.MASTERED_H },
};

async function main(): Promise<void> {
  const db = await getDb();
  const runs = await db.masteringRun.findMany({
    where: LISTING ? { listingId: LISTING } : {},
    orderBy: [{ listingId: 'asc' }, { photoIndex: 'asc' }, { attempt: 'asc' }],
    include: { listing: { select: { id: true, title: true, photoUrls: true } } },
  });
  if (!runs.length) {
    console.log(`\n(no mastering runs${LISTING ? ` for listing ${LISTING}` : ''} — pnpm master:queue starts one)\n`);
    return;
  }

  const byListing = new Map<number, typeof runs>();
  for (const r of runs) {
    const group = byListing.get(r.listingId) ?? [];
    group.push(r);
    byListing.set(r.listingId, group);
  }

  console.log('\n📊 Mastering status');
  for (const [listingId, group] of byListing) {
    const listing = group[0].listing;
    const total = listing.photoUrls.length;
    const mastered = new Set(group.filter((r) => r.status === 'UPDATED').map((r) => r.originalUrl)).size;
    const touched = new Set(group.map((r) => r.originalUrl)).size;
    console.log(`\n▸ Listing #${listingId} «${(listing.title ?? '').slice(0, 40)}» — ${mastered}/${total} mastered, ${total - touched} still ORIGINAL`);
    for (const r of group) {
      const check = STALE_CHECK[r.status];
      const staleFor = check ? hoursAgo(r[check.at]) : 0;
      const stale = check && staleFor > check.h ? `  ⏰ STALLED ${Math.round(staleFor)}h` : '';
      const drift = r.status === 'UPDATED' && isDrifted(r.masteredUrl, listing.photoUrls) ? '  🫥 DRIFTED — no longer live' : '';
      const note = r.failureReason ?? r.humanNote ?? '';
      console.log(
        `   ${shortId(r.id)}  photo ${String(r.photoIndex + 1).padStart(2)}  ${r.status.padEnd(8)} a${r.attempt}  ${ago(r.queuedAt).padStart(4)}${stale}${drift}${note ? `  — ${note.slice(0, 60)}` : ''}`,
      );
    }
  }
  console.log('');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${describeError(e)}\n`);
  process.exit(1);
});
