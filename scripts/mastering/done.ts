/**
 * Return a mastered image (state: ASSIGNED → MASTERED → UPDATED).
 *
 *   pnpm master:done h3k9x2                    # newest image in ~/Downloads
 *   pnpm master:done h3k9x2 --file=/path/x.png
 *   pnpm master:done h3k9x2 --from-slack        # image the human attached in Slack
 *   pnpm master:done h3k9x2 --yes --no-open    # skip eyeball + confirm (CI/auto lane)
 *
 * Flags: --file=<path> --from-slack --window=<minutes, default 120> --yes --no-open
 *
 * Return lanes (spec §13): the human returns the render either by attaching
 * it in the run's Slack thread (--from-slack — the only lane that works from
 * a phone) or by downloading it on this Mac (~/Downloads, the default).
 *
 * What it does, in order: validate the candidate (decodes, ≥1200px wide, not
 * byte-identical to the original), open original + candidate side-by-side for
 * the honesty eyeball (same property, same reality — doc §23), normalize with
 * sharp (≤2048px wide, WebP), upload to S3 under mkan/uploads/mastered/, then
 * in one transaction mark MASTERED and swap the URL into Listing.photoUrls **by
 * URL match, never by index** (hosts mutate the array under us) → UPDATED.
 * Finally mirror progress to the Twenty home (best-effort) and reply in the
 * Slack task thread. Originals are never deleted — recovery: master:revert.
 *
 * Validation failures abort with NO state change (fix the file, re-run).
 * A real upload failure marks the run FAILED with the reason (doc §18).
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  argv,
  flag,
  positional,
  findRun,
  getDb,
  getS3,
  masteredKey,
  shortId,
  confirm,
  openFiles,
  slackReplySafe,
  slackReturns,
  type SlackReturn,
  slackDownload,
  slackReactSafe,
  swapPhoto,
  twentyRollup,
} from './lib';

const FILE = argv('file');
const FROM_SLACK = flag('from-slack');
const WINDOW_MIN = parseInt(argv('window', '120'), 10) || 120;
const YES = flag('yes');
const NO_OPEN = flag('no-open');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MIN_WIDTH = 1200;
const OUT_WIDTH = 2048;
const WEBP_QUALITY = 82;

/** Newest image in ~/Downloads modified within the window. */
function newestDownload(): string {
  const dir = join(homedir(), 'Downloads');
  const cutoff = Date.now() - WINDOW_MIN * 60_000;
  const candidates = readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
    .map((f) => ({ path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .filter((f) => f.mtime >= cutoff)
    .sort((a, b) => b.mtime - a.mtime);
  if (!candidates.length) {
    throw new Error(`no image newer than ${WINDOW_MIN}min in ~/Downloads — pass --file=<path> (or widen --window)`);
  }
  return candidates[0].path;
}

const sha256 = (buf: Buffer | Uint8Array): string => createHash('sha256').update(buf).digest('hex');

/**
 * The human's returned image for this run (spec §13). Preference order:
 *   1. an image attached IN the run's task thread  — unambiguous
 *   2. an image in the channel whose text names the run — `DONE kbbvvatd`
 *   3. the newest human image in the channel — only when this run is the sole
 *      one waiting, otherwise refuse rather than master the wrong photo
 * The eyeball still owns identity: matching a run is not proof of the room.
 */
async function pickSlackReturn(runSlackTs: string | null, runId: string): Promise<SlackReturn> {
  const returns = await slackReturns(runSlackTs ? [runSlackTs] : []);
  if (!returns.length) {
    throw new Error('no human-attached image found in the mastering channel — attach the render in the task thread, or pass --file=');
  }
  const short = shortId(runId);
  const inThread = runSlackTs ? returns.find((r) => r.threadTs === runSlackTs) : undefined;
  if (inThread) return inThread;
  const named = returns.find((r) => r.text.toLowerCase().includes(short.toLowerCase()) || r.text.includes(runId));
  if (named) return named;

  const db = await getDb();
  const waiting = await db.masteringRun.count({ where: { status: { in: ['QUEUED', 'ASSIGNED'] } } });
  const newest = returns[0];
  if (waiting > 1) {
    throw new Error(
      `${waiting} runs are waiting and the newest channel image (${newest.name}) names none of them — ` +
        `reply with the image IN the task thread, or say \`DONE ${short}\` with it, or pass --file=`,
    );
  }
  console.log('  ⚠️  channel-level return (not in the task thread) — this is the only run waiting, so using it');
  return newest;
}

async function main(): Promise<void> {
  const run = await findRun(positional());
  if (!['QUEUED', 'ASSIGNED'].includes(run.status)) {
    throw new Error(`run ${shortId(run.id)} is ${run.status} — done applies to QUEUED/ASSIGNED runs`);
  }
  if (run.status === 'QUEUED') {
    console.log(`  ⚠️  run ${shortId(run.id)} was never dispatched to Slack — proceeding anyway`);
  }

  let candidatePath: string;
  let candidate: Buffer;
  let slackReturn: SlackReturn | null = null;
  if (FROM_SLACK) {
    slackReturn = await pickSlackReturn(run.slackTs, run.id);
    candidate = await slackDownload(slackReturn);
    const scratchIn = join(tmpdir(), 'mkan-mastering');
    mkdirSync(scratchIn, { recursive: true });
    candidatePath = join(scratchIn, `${shortId(run.id)}-slack-${slackReturn.fileId}${extname(slackReturn.name) || '.png'}`);
    writeFileSync(candidatePath, candidate);
    console.log(`  ↓ Slack return: ${slackReturn.name} (${(slackReturn.size / 1e6).toFixed(1)} MB) → ${candidatePath}`);
  } else {
    candidatePath = FILE || newestDownload();
    candidate = readFileSync(candidatePath);
  }

  const sharp = (await import('sharp')).default;
  const meta = await sharp(candidate).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error(`cannot decode ${candidatePath}`);
  if (width < MIN_WIDTH) {
    throw new Error(`candidate is ${width}px wide — need ≥${MIN_WIDTH}px (regenerate at a larger size)`);
  }
  const ratio = width / height;
  if (ratio < 1.15 || ratio > 1.6) {
    console.log(`  ⚠️  aspect ${ratio.toFixed(2)} is off the 4:3 target (1.33) — object-cover will crop; consider regenerating`);
  }

  // Fetch the original — for the identity check and the side-by-side eyeball.
  const res = await fetch(run.originalUrl);
  if (!res.ok) throw new Error(`cannot fetch original (${res.status}) ${run.originalUrl}`);
  const original = Buffer.from(await res.arrayBuffer());
  if (sha256(original) === sha256(candidate)) {
    throw new Error('candidate is byte-identical to the original — wrong file?');
  }

  console.log(`\n🖼  Run ${shortId(run.id)} — listing #${run.listing.id}, photo ${run.photoIndex + 1}, attempt ${run.attempt}`);
  console.log(`   candidate: ${candidatePath} (${width}×${height})`);

  const scratch = join(tmpdir(), 'mkan-mastering');
  mkdirSync(scratch, { recursive: true });
  const originalPath = join(scratch, `${shortId(run.id)}-original${extname(new URL(run.originalUrl).pathname) || '.jpg'}`);
  writeFileSync(originalPath, original);
  if (!NO_OPEN) openFiles([originalPath, candidatePath]);

  if (!YES && !(await confirm('Same property, same reality — and clearly better photography. Apply?'))) {
    console.log('  aborted — state unchanged\n');
    return;
  }

  const output = await sharp(candidate)
    .rotate() // honor EXIF orientation before stripping metadata
    .resize({ width: OUT_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  const s3 = await getS3();
  if (!s3.isS3Configured()) {
    throw new Error('S3 is not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET) — state unchanged');
  }

  const db = await getDb();
  let masteredUrl: string | null = null;
  try {
    masteredUrl = await s3.putObject({
      key: masteredKey(run.id),
      body: output,
      contentType: 'image/webp',
    });
    if (!masteredUrl) throw new Error('putObject returned null');
  } catch (e) {
    const reason = `CDN upload failed: ${(e as Error).message}`;
    await db.masteringRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', failureReason: reason },
    });
    await slackReplySafe(run.slackTs, `:x: ${shortId(run.id)} FAILED — ${reason}`);
    throw new Error(reason);
  }

  // MASTERED, then apply: swap by URL match inside one transaction. If the
  // host removed the original meanwhile, stay MASTERED with a note (doc §16).
  const applied = await db.$transaction(async (tx) => {
    // Conditional claim: a second concurrent `done` (or one racing a reject)
    // matches zero rows here and rolls back instead of regressing the state.
    const claimed = await tx.masteringRun.updateMany({
      where: { id: run.id, status: { in: ['QUEUED', 'ASSIGNED'] } },
      data: { status: 'MASTERED', masteredAt: new Date(), masteredUrl },
    });
    if (claimed.count === 0) {
      throw new Error(`run ${shortId(run.id)} was claimed by another process — state unchanged`);
    }
    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: run.listingId },
      select: { photoUrls: true },
    });
    const next = swapPhoto(listing.photoUrls, run.originalUrl, masteredUrl as string);
    if (!next) {
      await tx.masteringRun.update({
        where: { id: run.id },
        data: { humanNote: 'original no longer in photoUrls at apply time — mastered but not live' },
      });
      return null;
    }
    await tx.listing.update({ where: { id: run.listingId }, data: { photoUrls: next } });
    await tx.masteringRun.update({
      where: { id: run.id },
      data: { status: 'UPDATED', appliedAt: new Date() },
    });
    return next;
  });

  if (!applied) {
    console.log(`\n⚠️  MASTERED but NOT applied — the original left photoUrls. Mastered copy: ${masteredUrl}\n`);
    await slackReplySafe(run.slackTs, `:warning: ${shortId(run.id)} mastered, but the original photo was removed from the listing — not applied.\n${masteredUrl}`);
    return;
  }

  // Distinct photos of this listing that reached UPDATED (a retried photo counts once).
  const masteredCount = new Set(
    (
      await db.masteringRun.findMany({
        where: { listingId: run.listingId, status: 'UPDATED' },
        select: { originalUrl: true },
      })
    ).map((r) => r.originalUrl),
  ).size;

  let crmNote = 'Twenty skipped';
  try {
    crmNote = await twentyRollup(run.listingId, applied, masteredCount);
  } catch (e) {
    crmNote = `Twenty rollup failed (non-fatal): ${(e as Error).message}`;
  }

  await slackReplySafe(
    run.slackTs,
    `:white_check_mark: ${shortId(run.id)} mastered and live (attempt ${run.attempt})\nbefore: ${run.originalUrl}\nafter: ${masteredUrl}`,
  );
  if (slackReturn) await slackReactSafe(slackReturn.ts, 'white_check_mark');

  console.log(`\n✅ UPDATED — live in photoUrls slot ${applied.indexOf(masteredUrl) + 1}/${applied.length}`);
  console.log(`   after:  ${masteredUrl}`);
  console.log(`   before: ${run.originalUrl} (kept on CDN — master:revert restores it)`);
  console.log(`   ${crmNote}`);
  console.log(
    run.listing.isPublished
      ? `   check:  https://mkan.sd/ar/listings/${run.listingId}\n`
      : '   check:  listing is unpublished (busy) — the public URL 404s; verify via pnpm master:status or the hosting dashboard\n',
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
