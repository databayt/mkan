/**
 * Prep the human generate step — one command sets the whole desk.
 *
 *   pnpm master:prep            # oldest ASSIGNED run
 *   pnpm master:prep na3qt4s5   # a specific run
 *
 * Copies the run's FROZEN prompt to the clipboard (pbcopy), opens the original
 * photo (census cache when present, else fetched to the temp dir), and opens
 * Gemini. The human part shrinks to: drag the image in, ⌘V, Enter, download —
 * then `pnpm master:done <run>` (which grabs the newest download itself).
 *
 * This is the no-spend, no-ToS-risk floor for "auto-complete the Slack tasks":
 * the generate click stays human until the billing /decide flips master:auto.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { positional, findRun, getDb, shortId } from './lib';

async function main(): Promise<void> {
  const ref = positional();
  const db = await getDb();
  const run = ref
    ? await findRun(ref)
    : await db.masteringRun.findFirst({
        where: { status: 'ASSIGNED' },
        orderBy: { assignedAt: 'asc' },
        include: { listing: { select: { id: true, title: true, hostId: true, photoUrls: true, isPublished: true } } },
      });
  if (!run) {
    console.log('\n(no ASSIGNED runs — pnpm master:dispatch --apply first)\n');
    return;
  }
  if (!['QUEUED', 'ASSIGNED'].includes(run.status)) {
    throw new Error(`run ${shortId(run.id)} is ${run.status} — prep applies to QUEUED/ASSIGNED runs`);
  }

  // Original: census cache first (photo-cache/<listingId>/<index+1>.<ext>), else fetch.
  let originalPath = '';
  const cacheDir = join('scripts/crm/.data/photo-cache', String(run.listingId));
  for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
    const p = join(cacheDir, `${run.photoIndex + 1}${ext}`);
    if (existsSync(p)) {
      originalPath = p;
      break;
    }
  }
  if (!originalPath) {
    const res = await fetch(run.originalUrl);
    if (!res.ok) throw new Error(`cannot fetch original (${res.status}) ${run.originalUrl}`);
    const dir = join(tmpdir(), 'mkan-mastering');
    mkdirSync(dir, { recursive: true });
    originalPath = join(dir, `${shortId(run.id)}-original${extname(new URL(run.originalUrl).pathname) || '.jpg'}`);
    writeFileSync(originalPath, Buffer.from(await res.arrayBuffer()));
  }

  execSync('pbcopy', { input: run.prompt });
  if (process.platform === 'darwin') {
    spawnSync('open', ['-R', originalPath], { stdio: 'ignore' }); // reveal in Finder for the drag
    spawnSync('open', ['https://gemini.google.com'], { stdio: 'ignore' });
  }

  console.log(`\n🎬 Prepped ${shortId(run.id)} — listing #${run.listingId} «${(run.listing.title ?? '').slice(0, 40)}», photo ${run.photoIndex + 1}, attempt ${run.attempt}`);
  console.log(`   prompt ${run.promptVersion} → clipboard · original revealed in Finder · Gemini opened`);
  console.log(`   do: drag the image into Gemini → ⌘V → Enter → download`);
  console.log(`   then: pnpm master:done ${shortId(run.id)}\n`);
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
