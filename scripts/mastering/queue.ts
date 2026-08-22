/**
 * Queue listing photos for mastering (state: photo → QUEUED run).
 *
 *   pnpm master:queue --listing=123                      # dry plan, all photos
 *   pnpm master:queue --listing=123 --photos=1,3 --apply # queue photos 1 and 3
 *   pnpm master:queue --from-twenty --limit=2 --apply    # pull POOR_QUALITY homes
 *
 * Flags: --listing=<prisma id | sourceListingId> --photos=<1-based,csv>
 *        --from-twenty [--stage=POOR_QUALITY] [--limit=N]
 *        --allow-external --force --apply
 *
 * Idempotent (doc §6): an active run for the same (listing, originalUrl) is
 * skipped, a finished UPDATED run with the same prompt version blocks
 * re-queueing unless --force, and a URL that IS a mastered output is never
 * re-queued. The prompt is compiled and frozen onto the row here.
 */
import { argv, flag, isCdnUrl, getDb, shortId, trim } from './lib';
import { compilePrompt, PROMPT_VERSION, MODEL_HUMAN_WEB } from './prompt';
import { twentyClient } from '../crm/twenty-rest';

const APPLY = flag('apply');
const FORCE = flag('force');
const ALLOW_EXTERNAL = flag('allow-external');
const LISTING = argv('listing');
const PHOTOS = argv('photos');
const FROM_TWENTY = flag('from-twenty');
const STAGE = argv('stage', 'POOR_QUALITY');
const LIMIT = parseInt(argv('limit', '0'), 10) || 0;

interface ListingRow {
  id: number;
  title: string | null;
  photoUrls: string[];
}

/**
 * Room hint from the photo's own filename — `…/living-room.webp` → "living
 * room". Photos named after the room they show (the heirs sets) ground the
 * prompt for free; anything still on `01.webp` returns null and the prompt
 * compiles exactly as it always did. Trailing digits are photo order within a
 * room type, not part of the room's name, so they are stripped.
 */
function roomHintFrom(url: string): string | null {
  const stem = url.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? '';
  const words = stem.replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim();
  return words && !/^\d+$/.test(words) ? words : null;
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
    return db.listing.findMany({
      where: { id: { in: sliced } },
      select: { id: true, title: true, photoUrls: true },
    });
  }
  throw new Error('pass --listing=<id> or --from-twenty (see header for usage)');
}

async function main(): Promise<void> {
  console.log(`\n📸 Mastering queue — prompt ${PROMPT_VERSION}, model ${MODEL_HUMAN_WEB} (${APPLY ? 'APPLY' : 'dry'})`);
  const db = await getDb();
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
          model: MODEL_HUMAN_WEB,
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
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
