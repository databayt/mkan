/**
 * Reject a run's result (state: → REJECTED, + a fresh attempt row).
 *
 *   pnpm master:reject h3k9x2 --note="invented a window on the left wall"
 *   pnpm master:reject h3k9x2 --note="host photo too dark to rescue" --no-requeue
 *
 * The note is required — it is the feedback loop (doc §17): rejected-because
 * is what improves the next prompt version. Requeueing creates a NEW row with
 * attempt+1 and a freshly compiled prompt (an improved canonical prompt should
 * reach the retry), capped at MAX_ATTEMPTS.
 */
import { argv, flag, positional, findRun, getDb, roomHintFrom, shortId, slackReplySafe, MAX_ATTEMPTS, describeError } from './lib';
import { compilePrompt, PROMPT_VERSION } from './prompt';
import { DEFAULT_MODEL_ID } from './models';

async function main(): Promise<void> {
  const note = argv('note').trim();
  if (!note) throw new Error('a --note="why" is required — the reject reason feeds the next prompt version');
  const noRequeue = flag('no-requeue');

  const run = await findRun(positional());
  if (['REJECTED', 'FAILED'].includes(run.status)) {
    throw new Error(`run ${shortId(run.id)} is already ${run.status}`);
  }
  if (run.status === 'UPDATED') {
    throw new Error(`run ${shortId(run.id)} is live — use pnpm master:revert first`);
  }

  const db = await getDb();
  await db.masteringRun.update({
    where: { id: run.id },
    data: { status: 'REJECTED', humanNote: note },
  });
  console.log(`\n🚫 ${shortId(run.id)} → REJECTED — ${note}`);

  let requeued: string | null = null;
  if (!noRequeue && run.attempt < MAX_ATTEMPTS) {
    const next = await db.masteringRun.create({
      data: {
        listingId: run.listingId,
        photoIndex: run.photoIndex,
        originalUrl: run.originalUrl,
        attempt: run.attempt + 1,
        promptVersion: PROMPT_VERSION,
        // Recompile fresh (an improved canonical prompt should reach the
        // retry) but keep the filename room grounding attempt 1 had.
        prompt: compilePrompt({ roomHint: roomHintFrom(run.originalUrl) }),
        model: run.model || DEFAULT_MODEL_ID, // the retry goes back to the same generator
      },
    });
    requeued = shortId(next.id);
    console.log(`   attempt ${run.attempt + 1} QUEUED as ${requeued} — pnpm master:dispatch --apply`);
  } else if (!noRequeue) {
    console.log(`   attempt cap (${MAX_ATTEMPTS}) reached — requeue deliberately with pnpm master:queue --force`);
  }

  await slackReplySafe(
    run.slackTs,
    `:no_entry_sign: ${shortId(run.id)} rejected — ${note}${requeued ? `\nretrying as ${requeued} (attempt ${run.attempt + 1})` : ''}`,
  );
  console.log('');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${describeError(e)}\n`);
  process.exit(1);
});
