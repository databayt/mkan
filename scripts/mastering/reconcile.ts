/**
 * The stall clock — nothing disappears silently (doc §18/§20).
 *
 *   pnpm master:reconcile                          # report only
 *   pnpm master:reconcile --apply                  # + Slack alert when stale
 *   pnpm master:reconcile --requeue-failed --apply # + retry safe FAILED runs
 *
 * Flags anything parked past its threshold (QUEUED > 7d, ASSIGNED > 48h,
 * MASTERED-unapplied > 24h — MASTERING_STALE_*_H env overrides) and FAILED
 * runs still under the attempt cap. Meant to run on a schedule (Hermes cron,
 * Phase 2); safe to run by hand any time.
 */
import { flag, getDb, isDrifted, roomHintFrom, shortId, hoursAgo, STALE, MAX_ATTEMPTS, slackPost, slackReady } from './lib';
import { compilePrompt, PROMPT_VERSION } from './prompt';
import { DEFAULT_MODEL_ID } from './models';

const APPLY = flag('apply');
const REQUEUE_FAILED = flag('requeue-failed');

async function main(): Promise<void> {
  const db = await getDb();
  const open = await db.masteringRun.findMany({
    where: { status: { in: ['QUEUED', 'ASSIGNED', 'MASTERED', 'FAILED'] } },
    orderBy: { queuedAt: 'asc' },
  });

  const stale: { run: (typeof open)[number]; why: string }[] = [];
  for (const r of open) {
    if (r.status === 'QUEUED' && hoursAgo(r.queuedAt) > STALE.QUEUED_H) {
      stale.push({ run: r, why: `QUEUED ${Math.round(hoursAgo(r.queuedAt))}h — never dispatched` });
    } else if (r.status === 'ASSIGNED' && hoursAgo(r.assignedAt) > STALE.ASSIGNED_H) {
      stale.push({ run: r, why: `ASSIGNED ${Math.round(hoursAgo(r.assignedAt))}h — human never returned it` });
    } else if (r.status === 'MASTERED' && hoursAgo(r.masteredAt) > STALE.MASTERED_H) {
      stale.push({ run: r, why: `MASTERED ${Math.round(hoursAgo(r.masteredAt))}h — result exists but never went live` });
    }
  }
  const retryable = open.filter((r) => r.status === 'FAILED' && r.attempt < MAX_ATTEMPTS);

  // Drift: a run that says UPDATED whose mastered URL left photoUrls (host
  // wholesale-replace or delete after apply) — the status would lie forever.
  const updated = await db.masteringRun.findMany({
    where: { status: 'UPDATED' },
    include: { listing: { select: { photoUrls: true } } },
  });
  const drifted = updated.filter((r) => isDrifted(r.masteredUrl, r.listing.photoUrls));

  console.log(`\n🕰  Mastering reconcile — ${open.length} open run(s): ${stale.length} stalled, ${retryable.length} retryable FAILED, ${drifted.length} drifted`);
  for (const s of stale) console.log(`   ⏰ ${shortId(s.run.id)}  listing #${s.run.listingId}  ${s.why}`);
  for (const r of retryable) console.log(`   🔁 ${shortId(r.id)}  listing #${r.listingId}  FAILED a${r.attempt}: ${r.failureReason ?? '—'}`);
  for (const r of drifted) console.log(`   🫥 ${shortId(r.id)}  listing #${r.listingId}  UPDATED but the mastered URL left photoUrls — host edit? re-queue or let it stand`);

  if (!stale.length && !retryable.length && !drifted.length) {
    console.log('   all clear\n');
    return;
  }

  if (APPLY && REQUEUE_FAILED) {
    for (const r of retryable) {
      const next = await db.masteringRun.create({
        data: {
          listingId: r.listingId,
          photoIndex: r.photoIndex,
          originalUrl: r.originalUrl,
          attempt: r.attempt + 1,
          promptVersion: PROMPT_VERSION,
          prompt: compilePrompt({ roomHint: roomHintFrom(r.originalUrl) }),
          model: r.model || DEFAULT_MODEL_ID, // the retry goes back to the same generator
        },
      });
      console.log(`   ✓ ${shortId(r.id)} → retry QUEUED as ${shortId(next.id)} (attempt ${r.attempt + 1})`);
    }
  }

  if (APPLY && (stale.length || drifted.length) && slackReady()) {
    const lines = [
      ...stale.map((s) => `• ${shortId(s.run.id)} (listing #${s.run.listingId}): ${s.why}`),
      ...drifted.map((r) => `• ${shortId(r.id)} (listing #${r.listingId}): UPDATED but no longer live — host edit drift`),
    ];
    await slackPost(`:hourglass_flowing_sand: *Mastering stall report* — ${lines.length} run(s) need a human:\n${lines.join('\n')}\nSee: pnpm master:status`);
    console.log(`   📣 stall alert posted to Slack`);
  } else if (APPLY && (stale.length || drifted.length)) {
    console.log('   (Slack not configured — stall alert printed only)');
  }
  console.log(APPLY ? '' : '\nDRY RUN — re-run with --apply to alert/requeue.\n');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
