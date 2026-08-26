/**
 * Put the original photo back (recovery — doc §17).
 *
 *   pnpm master:revert h3k9x2 --note="ceiling geometry made the room read larger" [--yes]
 *
 * Swaps the mastered URL back to the original in Listing.photoUrls (by URL
 * match) and marks the run REJECTED with the reason. The mastered file stays
 * on the CDN — nothing in this pipeline ever deletes an image.
 *
 * The note is REQUIRED, exactly as it is for `master:reject`. A revert is the
 * strongest quality signal the pipeline can produce — a photo good enough to
 * apply and then bad enough to pull back down — and for the first two reverts
 * (kbbvvatd, dgtts5zz, both 2026-08-25) it recorded nothing but the date. The
 * prompt-v2 rewrite that followed therefore had no evidence to work from. A
 * reason that is not written down is a reason the next prompt cannot use.
 */
import { argv, flag, positional, findRun, getDb, shortId, confirm, slackReplySafe, twentyRollup, describeError } from './lib';

async function main(): Promise<void> {
  const why = argv('note').trim();
  if (!why) {
    throw new Error(
      'a --note="why" is required — what was wrong with the photo is what improves the next prompt version',
    );
  }
  const run = await findRun(positional());
  if (run.status !== 'UPDATED' || !run.masteredUrl) {
    throw new Error(`run ${shortId(run.id)} is ${run.status} — only a live (UPDATED) run can be reverted`);
  }
  console.log(`\n↩️  Revert ${shortId(run.id)} — listing #${run.listingId}`);
  console.log(`   live now: ${run.masteredUrl}`);
  console.log(`   restore:  ${run.originalUrl}`);
  if (!flag('yes') && !(await confirm('Put the original back on the live listing?'))) {
    console.log('  aborted — state unchanged\n');
    return;
  }

  const db = await getDb();
  const note = `reverted ${new Date().toISOString().slice(0, 10)}: ${why}${run.humanNote ? ` · ${run.humanNote}` : ''}`;
  const applied = await db.$transaction(async (tx) => {
    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: run.listingId },
      select: { photoUrls: true },
    });
    const idx = listing.photoUrls.indexOf(run.masteredUrl as string);
    if (idx === -1) return null;
    const next = [...listing.photoUrls];
    next[idx] = run.originalUrl;
    await tx.listing.update({ where: { id: run.listingId }, data: { photoUrls: next } });
    await tx.masteringRun.update({
      where: { id: run.id },
      data: { status: 'REJECTED', humanNote: note },
    });
    return next;
  });
  if (!applied) {
    throw new Error('mastered URL is no longer in photoUrls — nothing to revert (state unchanged)');
  }

  const masteredCount = new Set(
    (
      await db.masteringRun.findMany({
        where: { listingId: run.listingId, status: 'UPDATED' },
        select: { originalUrl: true },
      })
    ).map((r) => r.originalUrl),
  ).size;
  try {
    console.log(`   ${await twentyRollup(run.listingId, applied, masteredCount)}`);
  } catch (e) {
    console.log(`   Twenty rollup failed (non-fatal): ${describeError(e)}`);
  }

  await slackReplySafe(
    run.slackTs,
    `:leftwards_arrow_with_hook: ${shortId(run.id)} reverted — the original is live again.\n> ${why}`,
  );
  console.log(`   retry it with: pnpm master:queue --listing=${run.listingId} --photos=${run.photoIndex + 1} --apply`);
  console.log(
    run.listing.isPublished
      ? `\n✅ original restored — https://mkan.sd/ar/listings/${run.listingId}\n`
      : '\n✅ original restored (listing unpublished — verify via pnpm master:status)\n',
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${describeError(e)}\n`);
  process.exit(1);
});
