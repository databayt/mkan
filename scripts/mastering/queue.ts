/**
 * Queue listing photos for mastering (state: photo → QUEUED run).
 *
 *   pnpm master:queue --all --apply                      # every unmastered photo
 *   pnpm master:queue --listing=123                      # dry plan, all photos
 *   pnpm master:queue --listing=123 --photos=1,3 --apply # queue photos 1 and 3
 *   pnpm master:queue --listing=123 --model=chatgpt-image --apply
 *
 * Flags: --all --listing=<prisma id | sourceListingId> --photos=<1-based,csv>
 *        --from-twenty [--stage=POOR_QUALITY] [--limit=N]
 *        --model=<generator, see models.ts> --allow-external --force --apply
 *
 * `--all` is the standing rule: a photo that reached the CRM **in the Port
 * Sudan book** and has never been mastered belongs in the queue, and nobody
 * has to decide that it looks bad first. Judging photo by photo was the wrong
 * shape — it needed an opinion per image before any work could start, and 1086
 * of 1095 photos are anonymous uuid re-hosts nobody has ever looked at. Queue
 * is cheap and idempotent; the scarce thing is the human at the far end, and
 * the drain rate is what limits that (see master:next), not the entry test.
 *
 * The book is the `portSudan` object in Twenty — 34 homes with a listing code,
 * the inventory actually being worked. It is a MEMBERSHIP test, never a quality
 * one: being in the book is the whole qualification. The first sweep read every
 * listing mkan holds and queued 1,082 photos, ten times the real scope.
 *
 * `--prune` removes queued runs whose listing has since left the book — but
 * only rows that record nothing: first attempt, never dispatched, no render.
 * Anything that was handed to a human or produced an image is left alone for a
 * person to decide about.
 *
 * `--model` picks which tool renders these runs (default $MASTERING_MODEL, else
 * nano-banana) and is frozen onto the row beside the prompt, so prep opens the
 * right web app and the record says what was actually asked for. Unregistered
 * ids are allowed — new tools should not need a code change to be used.
 *
 * Idempotent (doc §6): an active run for the same (listing, originalUrl) is
 * skipped, a finished UPDATED run with the same prompt version blocks
 * re-queueing unless --force, and a URL that IS a mastered output is never
 * re-queued. The prompt is compiled and frozen onto the row here.
 */
import { argv, flag, isCdnUrl, getDb, roomHintFrom, shortId, trim, describeError } from './lib';
import { compilePrompt, PROMPT_VERSION } from './prompt';
import { resolveModel, modelList } from './models';
import { twentyClient } from '../crm/twenty-rest';

const APPLY = flag('apply');
const FORCE = flag('force');
const ALLOW_EXTERNAL = flag('allow-external');
const LISTING = argv('listing');
const PHOTOS = argv('photos');
const FROM_TWENTY = flag('from-twenty');
const ALL = flag('all');
const PRUNE = flag('prune');
const STAGE = argv('stage', 'POOR_QUALITY');
const LIMIT = parseInt(argv('limit', '0'), 10) || 0;
const MODEL = resolveModel(argv('model'));

interface ListingRow {
  id: number;
  title: string | null;
  photoUrls: string[];
}

/**
 * The listing codes in the Port Sudan book — the pipeline's whole scope.
 *
 * Read live rather than cached: a home added to the book this morning should
 * be swept this hour, and one removed should stop being swept without anyone
 * editing a script.
 */
async function bookCodes(): Promise<string[]> {
  const client = twentyClient();
  const rows = (await client.all('portSudans', 0)) as unknown as { listingId?: string | null }[];
  const codes = [...new Set(rows.map((r) => trim(r.listingId)).filter(Boolean))];
  if (!codes.length) {
    throw new Error(
      'the Port Sudan book is empty (no portSudan record carries a listing code) — ' +
        'refusing to sweep, because "everything" is not what --all means',
    );
  }
  return codes;
}

/**
 * Queued runs on listings that are no longer in the book, and that record
 * nothing at all: first attempt, no Slack task, no mastered image, no note.
 * Anything a human has touched stays for a human to decide about.
 */
async function pruneOutOfScope(codes: string[]): Promise<void> {
  const db = await getDb();
  const inScope = await db.listing.findMany({ where: { code: { in: codes } }, select: { id: true } });
  const keep = inScope.map((l) => l.id);
  const where = {
    status: 'QUEUED' as const,
    attempt: 1,
    slackTs: null,
    masteredUrl: null,
    humanNote: null,
    listingId: { notIn: keep },
  };
  const doomed = await db.masteringRun.count({ where });
  if (!doomed) {
    console.log('   nothing queued outside the book\n');
    return;
  }
  if (!APPLY) {
    console.log(`   ${doomed} queued run(s) are outside the book and record nothing — --apply removes them\n`);
    return;
  }
  const { count } = await db.masteringRun.deleteMany({ where });
  console.log(`   🧹 removed ${count} queued run(s) whose listing is not in the book\n`);
}

async function resolveListings(): Promise<ListingRow[]> {
  const db = await getDb();
  if (LISTING) {
    const where = /^\d+$/.test(LISTING)
      ? { id: parseInt(LISTING, 10) }
      : { sourceListingId: LISTING };
    const listing = await db.listing.findFirst({
      where,
      select: { id: true, title: true, photoUrls: true },
    });
    if (!listing) throw new Error(`no listing matches --listing=${LISTING}`);
    return [listing];
  }
  if (ALL) {
    const codes = await bookCodes();
    // Ordering by id keeps a partial run resumable in the same order, and the
    // per-photo skips below do the real filtering — this is deliberately not a
    // query about quality.
    return db.listing.findMany({
      where: { code: { in: codes }, photoUrls: { isEmpty: false } },
      select: { id: true, title: true, photoUrls: true },
      orderBy: { id: 'asc' },
    });
  }
  if (FROM_TWENTY) {
    // The CRM Kanban is the trigger surface: homes parked at photoStage=STAGE.
    const client = twentyClient();
    const homes = (await client.all('homes', 0)).filter(
      (h) => h.photoStage === STAGE && h.mkanListingId != null,
    );
    const ids = homes.map((h) => h.mkanListingId as number);
    const sliced = LIMIT ? ids.slice(0, LIMIT) : ids;
    if (!sliced.length) {
      console.log(`  no Twenty homes at photoStage=${STAGE} with an mkanListingId`);
      return [];
    }
    const found = await db.listing.findMany({
      where: { id: { in: sliced } },
      select: { id: true, title: true, photoUrls: true },
    });
    if (found.length < sliced.length) {
      const missing = sliced.filter((id) => !found.some((l) => l.id === id));
      console.warn(`  ! ${missing.length} Twenty home(s) reference an mkanListingId with no mkan listing (${missing.join(', ')}) — skipped; fix the CRM pointer`);
    }
    return found;
  }
  throw new Error('pass --all, --listing=<id>, or --from-twenty (see header for usage)');
}

async function main(): Promise<void> {
  console.log(`\n📸 Mastering queue — prompt ${PROMPT_VERSION}, model ${MODEL.label} (${APPLY ? 'APPLY' : 'dry'})`);
  if (!MODEL.url) console.log(`   ⚠️  «${MODEL.id}» is not in the registry — recorded as given, prep has no app to open (known: ${modelList()})`);
  const db = await getDb();
  if (PRUNE) await pruneOutOfScope(await bookCodes());
  const listings = await resolveListings();

  const wanted = new Set(
    trim(PHOTOS)
      ? PHOTOS.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0)
      : [],
  );

  let planned = 0;
  let skipped = 0;
  for (const listing of listings) {
    const runs = await db.masteringRun.findMany({
      where: { listingId: listing.id },
      select: { originalUrl: true, masteredUrl: true, status: true, attempt: true, promptVersion: true, id: true },
    });
    const masteredOutputs = new Set(runs.map((r) => r.masteredUrl).filter(Boolean) as string[]);
    console.log(`\n▸ Listing #${listing.id} «${(listing.title ?? '').slice(0, 40)}» — ${listing.photoUrls.length} photos`);

    for (let i = 0; i < listing.photoUrls.length; i++) {
      const url = listing.photoUrls[i];
      const label = `photo ${i + 1}`;
      if (wanted.size && !wanted.has(i + 1)) continue;
      const skip = (why: string): void => {
        console.log(`  · ${label}: skip — ${why}`);
        skipped++;
      };

      if (masteredOutputs.has(url)) {
        skip('already a mastered image');
        continue;
      }
      const history = runs.filter((r) => r.originalUrl === url);
      const active = history.find((r) => ['QUEUED', 'ASSIGNED', 'MASTERED'].includes(r.status));
      if (active) {
        skip(`active run ${shortId(active.id)} (${active.status})`);
        continue;
      }
      const finished = history.find((r) => r.status === 'UPDATED' && r.promptVersion === PROMPT_VERSION);
      if (finished && !FORCE) {
        skip(`already mastered with prompt ${PROMPT_VERSION} (${shortId(finished.id)}) — --force to redo`);
        continue;
      }
      if (!isCdnUrl(url) && !ALLOW_EXTERNAL) {
        skip('external URL (not cdn.databayt.org) — Slack handoff needs a fetchable original; --allow-external to override');
        continue;
      }

      const attempt = history.reduce((m, r) => Math.max(m, r.attempt), 0) + 1;
      if (!APPLY) {
        console.log(`  + ${label}: would queue (attempt ${attempt})  ${url.slice(0, 70)}`);
        planned++;
        continue;
      }
      const run = await db.masteringRun.create({
        data: {
          listingId: listing.id,
          photoIndex: i,
          originalUrl: url,
          attempt,
          promptVersion: PROMPT_VERSION,
          prompt: compilePrompt({ roomHint: roomHintFrom(url) }),
          model: MODEL.id,
        },
      });
      console.log(`  ✓ ${label}: QUEUED as ${shortId(run.id)} (attempt ${attempt})`);
      planned++;
    }
  }

  console.log(
    APPLY
      ? `\n✅ queued ${planned} run(s), skipped ${skipped}. Next: pnpm master:dispatch --apply\n`
      : `\nDRY RUN — would queue ${planned} run(s), skip ${skipped}. Re-run with --apply.\n`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${describeError(e)}\n`);
  process.exit(1);
});
