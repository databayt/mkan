/**
 * Put the original photo back (recovery — doc §17).
 *
 *   pnpm master:revert h3k9x2 [--yes]
 *
 * Swaps the mastered URL back to the original in Listing.photoUrls (by URL
 * match) and marks the run REJECTED with a dated note. The mastered file stays
 * on the CDN — nothing in this pipeline ever deletes an image.
 */
import { flag, positional, findRun, getDb, shortId, confirm, slackReplySafe, twentyRollup } from './lib';

async function main(): Promise<void> {
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
  const note = `reverted ${new Date().toISOString().slice(0, 10)}${run.humanNote ? ` · ${run.humanNote}` : ''}`;
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
    console.log(`   Twenty rollup failed (non-fatal): ${(e as Error).message}`);
  }

  await slackReplySafe(run.slackTs, `:leftwards_arrow_with_hook: ${shortId(run.id)} reverted — the original is live again.`);
  console.log(
    run.listing.isPublished
      ? `\n✅ original restored — https://mkan.sd/ar/listings/${run.listingId}\n`
      : '\n✅ original restored (listing unpublished — verify via pnpm master:status)\n',
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
