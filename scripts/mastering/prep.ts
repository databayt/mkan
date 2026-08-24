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
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { flag, positional, findRun, getDb, shortId } from './lib';
import { compilePrompt, PROMPT_VERSION } from './prompt';
import { resolveModel } from './models';

/**
 * Print the standing instructions for a ChatGPT Project (or Gemini Gem) —
 * paste ONCE into the project, and the per-image job becomes drag → Enter.
 * Emitted from compilePrompt() so a PROMPT_VERSION bump can never leave a
 * stale copy behind in a doc. The room hint deliberately stays OUT: it varies
 * per photo and lives on each run's record.
 */
function printChatgptSetup(): void {
  console.log(`\n═══ Standing instructions for the "Makan Mastering" project (prompt ${PROMPT_VERSION}) ═══\n`);
  console.log('Create once: ChatGPT → Projects → New project → "Makan Mastering" → Instructions → paste:\n');
  console.log('---');
  console.log('Every image I send you is a real listing photo from a homes marketplace. For each one, apply exactly this:\n');
  console.log(compilePrompt());
  console.log('\nReturn only the transformed photograph. Never ask follow-up questions.');
  console.log('---\n');
  console.log(`Then per image: drag from ~/mkan/inbox/originals/ → Enter → save the render into ~/mkan/inbox/ KEEPING the run-id prefix from the original's filename. The relay ingests it from there.`);
  console.log(`When the canonical prompt bumps (v2…), re-run this and replace the project instructions once.\n`);
}

async function main(): Promise<void> {
  if (flag('setup-chatgpt')) {
    printChatgptSetup();
    return;
  }
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
  // The cache is INDEX-named from census time; photoUrls can be reordered or
  // re-named after it (listing 1180's room-rename did exactly that). Revealing
  // the wrong original is the identity failure this pipeline exists to
  // prevent, so trust the cache only when its size matches the live original.
  if (originalPath) {
    try {
      const head = await fetch(run.originalUrl, { method: 'HEAD' });
      const len = parseInt(head.headers.get('content-length') ?? '0', 10);
      if (!head.ok || !len || len !== statSync(originalPath).size) originalPath = '';
    } catch {
      originalPath = '';
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

  const model = resolveModel(run.model);
  execSync('pbcopy', { input: run.prompt });
  // The run's own generator, not a hardcoded one — an unregistered model has
  // no app to open, and the human already knows where they are going. Prefer
  // the desktop app: `open -a` fails loudly when it is not installed, so its
  // exit status IS the presence check and the URL stays the honest fallback.
  let openedVia = '';
  if (process.platform === 'darwin') {
    spawnSync('open', ['-R', originalPath], { stdio: 'ignore' }); // reveal in Finder for the drag
    if (model.app && spawnSync('open', ['-a', model.app], { stdio: 'ignore' }).status === 0) {
      openedVia = `${model.app} app`;
    } else if (model.url) {
      spawnSync('open', [model.url], { stdio: 'ignore' });
      openedVia = model.url;
    }
  }

  console.log(`\n🎬 Prepped ${shortId(run.id)} — listing #${run.listingId} «${(run.listing.title ?? '').slice(0, 40)}», photo ${run.photoIndex + 1}, attempt ${run.attempt}`);
  console.log(`   prompt ${run.promptVersion} → clipboard · original revealed in Finder${openedVia ? ` · ${model.label} opened (${openedVia})` : ` · ${model.label} has nothing to open`}`);
  console.log(`   do: drag the image into ${model.label} → ⌘V → Enter → download`);
  console.log(`   then: pnpm master:done ${shortId(run.id)}\n`);
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
