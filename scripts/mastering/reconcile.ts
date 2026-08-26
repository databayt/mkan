/**
 * The stall clock — nothing disappears silently (doc §18/§20).
 *
 *   pnpm master:reconcile                          # report only
 *   pnpm master:reconcile --apply                  # + Slack alert when stale
 *   pnpm master:reconcile --requeue-failed --apply # + retry safe FAILED runs
 *
 * Flags a run parked past its threshold (ASSIGNED > 48h, MASTERED-unapplied >
 * 24h — MASTERING_STALE_*_H env overrides), FAILED runs still under the attempt
 * cap, drift, impossible states, renders stuck in the inbox, and a queue that
 * has stopped moving. A long queue is NOT a fault: every unmastered photo is
 * queued by design, so the alarm is on the drain, not the depth.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';

import { flag, getDb, isDrifted, roomHintFrom, shortId, hoursAgo, trim, STALE, MAX_ATTEMPTS, slackPost, slackReady } from './lib';
import { impossibleState } from './pure';
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
    if (r.status === 'ASSIGNED' && hoursAgo(r.assignedAt) > STALE.ASSIGNED_H) {
      stale.push({ run: r, why: `ASSIGNED ${Math.round(hoursAgo(r.assignedAt))}h — human never returned it` });
    } else if (r.status === 'MASTERED' && hoursAgo(r.masteredAt) > STALE.MASTERED_H) {
      stale.push({ run: r, why: `MASTERED ${Math.round(hoursAgo(r.masteredAt))}h — result exists but never went live` });
    }
  }
  const retryable = open.filter((r) => r.status === 'FAILED' && r.attempt < MAX_ATTEMPTS);

  // The queue is supposed to be long. Every photo in the CRM that has never
  // been mastered is queued, so a thousand QUEUED rows is the healthy state and
  // the old per-run "never dispatched" alarm would have fired a thousand times
  // on the first sweep. What matters is not the queue's length but whether it
  // is MOVING: photos waiting with nothing in flight means the drain stopped,
  // and that is one alert about the pipeline, not N alerts about photos.
  const queued = open.filter((r) => r.status === 'QUEUED');
  const inFlight = open.filter((r) => r.status === 'ASSIGNED' || r.status === 'MASTERED');
  const oldestQueued = queued.reduce<Date | null>(
    (m, r) => (!m || r.queuedAt < m ? r.queuedAt : m),
    null,
  );
  const drainStopped =
    queued.length > 0 && inFlight.length === 0 && hoursAgo(oldestQueued) > STALE.UNDISPATCHED_H;

  // Drift: a run that says UPDATED whose mastered URL left photoUrls (host
  // wholesale-replace or delete after apply) — the status would lie forever.
  const updated = await db.masteringRun.findMany({
    where: { status: 'UPDATED' },
    include: { listing: { select: { photoUrls: true } } },
  });
  const drifted = updated.filter((r) => isDrifted(r.masteredUrl, r.listing.photoUrls));

  // States the scripts cannot produce — the tell that something wrote these
  // rows from outside. Checked over EVERY run, not just the open ones: the
  // 2026-08-25 prompt rewrite left its fingerprints on finished rows too.
  const allRuns = await db.masteringRun.findMany({
    select: { id: true, listingId: true, status: true, slackTs: true, masteredUrl: true, appliedAt: true },
  });
  const impossible = allRuns
    .map((r) => ({ run: r, why: impossibleState(r) }))
    .filter((x): x is { run: (typeof allRuns)[number]; why: string } => x.why !== null);

  // Renders already made, already paid for, sitting unread because an ingest
  // refused them. The relay says so once, in the moment; nothing repeats it.
  const inbox = trim(process.env.MASTERING_INBOX) || join(homedir(), 'mkan', 'inbox');
  const IMG = new Set(['.png', '.jpg', '.jpeg', '.webp']);
  const stuck = !existsSync(inbox)
    ? []
    : readdirSync(inbox)
        .filter((f) => !f.startsWith('.') && IMG.has(extname(f).toLowerCase()))
        .map((f) => ({ f, age: (Date.now() - statSync(join(inbox, f)).mtimeMs) / 3_600_000 }))
        .filter((x) => x.age > STALE.INBOX_H);

  console.log(
    `\n🕰  Mastering reconcile — ${queued.length} queued, ${inFlight.length} in flight: ${stale.length} stalled, ` +
      `${retryable.length} retryable FAILED, ${drifted.length} drifted, ${impossible.length} impossible, ` +
      `${stuck.length} render(s) stuck in the inbox`,
  );
  if (drainStopped) {
    console.log(
      `   🛑 ${queued.length} photo(s) waiting and none in flight — the queue has stopped moving ` +
        `(oldest ${Math.round(hoursAgo(oldestQueued))}h). Start it: pnpm master:next`,
    );
  }
  for (const s of stale) console.log(`   ⏰ ${shortId(s.run.id)}  listing #${s.run.listingId}  ${s.why}`);
  for (const r of retryable) console.log(`   🔁 ${shortId(r.id)}  listing #${r.listingId}  FAILED a${r.attempt}: ${r.failureReason ?? '—'}`);
  for (const r of drifted) console.log(`   🫥 ${shortId(r.id)}  listing #${r.listingId}  UPDATED but the mastered URL left photoUrls — host edit? re-queue or let it stand`);
  for (const x of impossible) console.log(`   ⚠️  ${shortId(x.run.id)}  listing #${x.run.listingId}  ${x.why}`);
  for (const x of stuck) console.log(`   📥 ${x.f} — ${Math.round(x.age)}h in the inbox, never ingested (pnpm master:relay --dry)`);

  if (!stale.length && !retryable.length && !drifted.length && !impossible.length && !stuck.length && !drainStopped) {
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

  const needsHuman = stale.length || drifted.length || impossible.length || stuck.length || drainStopped;
  if (APPLY && needsHuman && slackReady()) {
    const lines = [
      ...stale.map((s) => `• ${shortId(s.run.id)} (listing #${s.run.listingId}): ${s.why}`),
      ...drifted.map((r) => `• ${shortId(r.id)} (listing #${r.listingId}): UPDATED but no longer live — host edit drift`),
      ...impossible.map((x) => `• ${shortId(x.run.id)} (listing #${x.run.listingId}): ${x.why} — written from outside the scripts`),
      ...stuck.map((x) => `• \`${x.f}\`: ${Math.round(x.age)}h in the inbox, never ingested`),
      ...(drainStopped
        ? [`• *the queue has stopped* — ${queued.length} photo(s) waiting, none in flight. \`pnpm master:next\``]
        : []),
    ];
    await slackPost(`:hourglass_flowing_sand: *Mastering stall report* — ${lines.length} run(s) need a human:\n${lines.join('\n')}\nSee: pnpm master:status`);
    console.log(`   📣 stall alert posted to Slack`);
  } else if (APPLY && needsHuman) {
    console.log('   (Slack not configured — stall alert printed only)');
  }
  console.log(APPLY ? '' : '\nDRY RUN — re-run with --apply to alert/requeue.\n');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
