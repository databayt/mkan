/**
 * Dispatch QUEUED runs as Slack tasks (state: QUEUED → ASSIGNED).
 *
 *   pnpm master:dispatch                 # dry — print the messages
 *   pnpm master:dispatch --apply         # post to #makan-image-mastering
 *   pnpm master:dispatch --run=h3k9x2 --apply
 *   pnpm master:dispatch --run=h3k9x2 --repost --apply   # re-post a stale ASSIGNED task
 *
 * Flags: --run=<ref> --repost --limit=<N> --apply
 *
 * The task message is the whole human handoff (doc §11): the original image
 * (unfurled from its public CDN URL — no file staging), the frozen prompt in a
 * copyable block, and the exact return command. Posted directly via the Slack
 * Web API; Hermes' chat lane is not in this loop (see docs/image-mastering.md).
 */
import { resolveModel } from './models';
import { argv, flag, findRun, getDb, shortId, slackPost, slackReady, slackReplySafe } from './lib';

const APPLY = flag('apply');
const REPOST = flag('repost');
const RUN = argv('run');
const LIMIT = parseInt(argv('limit', '10'), 10) || 10;

const FENCE = '```';
const TICK = '`';

interface TaskRun {
  id: string;
  attempt: number;
  photoIndex: number;
  originalUrl: string;
  prompt: string;
  promptVersion: string;
  model: string;
  listing: { id: number; title: string | null; photoUrls: string[] };
}

function taskMessage(run: TaskRun): string {
  const title = (run.listing.title ?? '').slice(0, 60);
  return [
    `:house: *Makan image mastering* — Listing #${run.listing.id} «${title}»`,
    `Run ${TICK}${shortId(run.id)}${TICK} · photo ${run.photoIndex + 1}/${run.listing.photoUrls.length} · attempt ${run.attempt} · prompt ${run.promptVersion}`,
    `Original: ${run.originalUrl}`,
    '',
    '*Prompt — copy the whole block:*',
    `${FENCE}${run.prompt}${FENCE}`,
    `*Do:* open ${resolveModel(run.model).label} → attach the original image → paste the prompt → generate.`,
    `*Return it here:* reply *in this thread* with the mastered image attached (works from the phone). Then: ${TICK}pnpm master:done ${shortId(run.id)} --from-slack${TICK}`,
    `_Or_ download it on the Mac and run ${TICK}pnpm master:done ${shortId(run.id)}${TICK}`,
    `Bad result / blocked: ${TICK}pnpm master:reject ${shortId(run.id)} --note="why"${TICK}`,
  ].join('\n');
}

async function main(): Promise<void> {
  const db = await getDb();
  const runs = RUN
    ? [await findRun(RUN)].filter((r) => {
        if (r.status === 'QUEUED') return true;
        if (REPOST && r.status === 'ASSIGNED') return true;
        throw new Error(
          r.status === 'ASSIGNED'
            ? `run ${shortId(r.id)} is already ASSIGNED — pass --repost to post a fresh task (stale-thread remedy)`
            : `run ${shortId(r.id)} is ${r.status}, not QUEUED`,
        );
      })
    : await db.masteringRun.findMany({
        where: { status: 'QUEUED' },
        orderBy: { queuedAt: 'asc' },
        take: LIMIT,
        include: { listing: { select: { id: true, title: true, hostId: true, photoUrls: true } } },
      });

  console.log(`\n📨 Mastering dispatch — ${runs.length} QUEUED run(s) (${APPLY ? 'APPLY' : 'dry'})`);
  if (!runs.length) {
    console.log('  nothing to dispatch — pnpm master:queue first\n');
    return;
  }
  if (APPLY && !slackReady()) {
    throw new Error('Slack not configured — set SLACK_MASTERING_CHANNEL in .env (+ SLACK_BOT_TOKEN env or Keychain databayt/SLACK_BOT_TOKEN)');
  }

  for (const run of runs) {
    const msg = taskMessage(run as TaskRun);
    if (!APPLY) {
      console.log(`\n— ${shortId(run.id)} ————————————————————————————\n${msg}`);
      continue;
    }
    const { ts, url } = await slackPost(msg);
    // A reposted task must not leave a live-looking orphan thread behind —
    // a return dropped there would never be found by --from-slack.
    if (run.status === 'ASSIGNED' && run.slackTs && run.slackTs !== ts) {
      await slackReplySafe(run.slackTs, `:arrows_counterclockwise: task re-posted — continue in the new thread: ${url || ts}`);
    }
    await db.masteringRun.update({
      where: { id: run.id },
      data: { status: 'ASSIGNED', assignedAt: new Date(), slackTs: ts, slackUrl: url || null },
    });
    console.log(`  ✓ ${shortId(run.id)} → ASSIGNED  ${url || `ts ${ts}`}`);
  }

  console.log(
    APPLY
      ? `\n✅ dispatched ${runs.length} task(s) to Slack.\n`
      : `\nDRY RUN — would post ${runs.length} task(s). Re-run with --apply.\n`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
