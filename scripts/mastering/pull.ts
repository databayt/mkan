/**
 * The Twenty pull — an image dropped on a Home record becomes a mastering run.
 *
 *   pnpm master:pull            # dry: report what would be pulled
 *   pnpm master:pull --apply    # pull, rehost, queue, stage, digest
 *
 * The operator gesture is dragging a host's photo onto the Home record in the
 * Twenty UI (Files section). Every ~5 minutes (launchd, install-pull-cron.sh)
 * this script:
 *
 *   1. finds new image attachments on Home records (cursor:
 *      .data/mastering-pull.json — watermark + seen ids, because a 6-photo
 *      drag lands in the same second and a bare timestamp would straddle it)
 *   2. downloads the bytes from Twenty's local file store and REFUSES anything
 *      that does not decode as an image (/files/* answers 200 even for paths
 *      that do not exist — status codes prove nothing here)
 *   3. re-hosts to the CDN under the listing (originals are immortal there;
 *      the Twenty attachment is kept too — nothing is destroyed)
 *   4. appends to Listing.photoUrls and queues a MasteringRun — the room hint
 *      comes from the ATTACHMENT's human name (`majlis.jpg`), read BEFORE the
 *      rehost renames it to a UUID key
 *   5. stages a copy in ~/mkan/inbox/originals/ named `<short> <name>` so the
 *      drag into the generator carries the run id with it
 *   6. posts ONE digest to #mkan and marks the runs ASSIGNED (slackTs = the
 *      digest — no per-photo message walls)
 *
 * Homes without an mkanListingId are named in the digest and skipped — the
 * pull never creates listings. A download that keeps failing is announced
 * loudly after MAX_FAILS and only then given up on; a silent drop is the one
 * outcome this lane must never produce.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join } from 'node:path';
import {
  allocateName,
  argv,
  cdnNamespace,
  flag,
  getDb,
  getS3,
  listingFolder,
  photoSlug,
  roomHintFrom,
  shortId,
  slackPost,
  slackReady,
  takenNames,
  tempKey,
  trim,, describeError } from './lib';
import { compilePrompt, PROMPT_VERSION } from './prompt';
import { DEFAULT_MODEL_ID } from './models';
import { twentyClient } from '../crm/twenty-rest';

const APPLY = flag('apply');
const INBOX = argv('inbox') || trim(process.env.MASTERING_INBOX) || join(homedir(), 'mkan', 'inbox');
const ORIGINALS = join(INBOX, 'originals');
const STATE_FILE = 'scripts/crm/.data/mastering-pull.json';
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
const MAX_FAILS = 3;
const MIN_BYTES = 10_000;

interface PullState {
  watermark: string; // ISO — createdAt high-water mark, minus overlap on read
  seen: string[]; // attachment ids already processed (or given up on)
  fails: Record<string, number>;
}

function loadState(): PullState {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as PullState;
  } catch {
    return { watermark: new Date(0).toISOString(), seen: [], fails: {} };
  }
}
function saveState(s: PullState): void {
  s.seen = s.seen.slice(-500);
  mkdirSync('scripts/crm/.data', { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

/** One entry of the FILES composite as Twenty v2.31 returns it — `url` is fully signed. */
interface TwentyFileItem {
  fileId?: string;
  label?: string;
  url?: string;
}

interface TwentyAttachment {
  id: string;
  name: string;
  fullPath: string;
  /**
   * Twenty v2.31 returns FILES as an ARRAY carrying a ready-made signed `url`.
   * Older records expose a `{ path, token }` object instead. Both are read: a
   * shape assumption here is invisible until a download silently fails.
   */
  file?: TwentyFileItem[] | { path?: string; token?: string } | null;
  createdAt: string;
  targetHomeId: string | null;
}

/** Download attachment bytes — trust only a decodable image, never the status. */
async function download(att: TwentyAttachment): Promise<Buffer> {
  const base = trim(process.env.TWENTY_API_URL).replace(/\/+$/, '');
  const key = trim(process.env.TWENTY_API_KEY);
  // Newer Twenty exposes a `file` composite whose path may carry a signed
  // token; older records only have fullPath. Try the most specific first.
  // The signed url points at whatever public host Twenty was configured with
  // (a Tailscale funnel here). Keep its path and token, swap the origin for the
  // API we already talk to — otherwise every pull round-trips the internet to
  // reach a container on this same machine.
  const signed = (Array.isArray(att.file) ? att.file : [])
    .map((f) => trim(f?.url))
    .filter(Boolean)
    .map((u) => {
      try {
        const parsed = new URL(u);
        return `${base}${parsed.pathname}${parsed.search}`;
      } catch {
        return u;
      }
    });
  const legacy = Array.isArray(att.file) ? null : att.file;
  const candidates = [
    ...signed,
    legacy?.path && legacy?.token ? `${base}/files/${legacy.path}?token=${legacy.token}` : null,
    legacy?.path ? `${base}/files/${legacy.path}` : null,
    `${base}/files/${att.fullPath}`,
  ].filter(Boolean) as string[];
  let lastErr = 'no candidate URL';
  for (const url of candidates) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok || buf.length < MIN_BYTES) {
      lastErr = `${res.status}, ${buf.length}B from ${url.split('?')[0]}`;
      continue;
    }
    try {
      const sharp = (await import('sharp')).default;
      const meta = await sharp(buf).metadata();
      if (meta.width && meta.height) return buf;
      lastErr = `not decodable (${url.split('?')[0]})`;
    } catch {
      lastErr = `not an image (${url.split('?')[0]})`;
    }
  }
  throw new Error(lastErr);
}

async function main(): Promise<void> {
  const db = await getDb();
  const client = twentyClient();
  const state = loadState();
  const overlap = new Date(new Date(state.watermark).getTime() - 10 * 60_000);

  const all = (await client.all('attachments', 0)) as unknown as TwentyAttachment[];
  const fresh = all
    .filter((a) => a.targetHomeId && IMAGE_EXT.test(a.name ?? ''))
    .filter((a) => !state.seen.includes(a.id))
    .filter((a) => new Date(a.createdAt) >= overlap)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  console.log(`\n📡 Mastering pull — ${all.length} attachment(s) in Twenty, ${fresh.length} new on homes (${APPLY ? 'APPLY' : 'dry'})`);
  if (!fresh.length) {
    console.log('   nothing new\n');
    return;
  }

  const s3 = await getS3();
  const staged: string[] = [];
  const skipped: string[] = [];
  const givenUp: string[] = [];
  const runsMade: { id: string; short: string; listingId: number; room: string | null; stagedAs: string }[] = [];

  for (const att of fresh) {
    const label = `${att.name} (${shortId(att.id)})`;
    // Resolve home → listing. Duplicate homes per mkanListingId exist in the
    // CRM; the attachment belongs to ONE home record, so no ambiguity here.
    let mkanListingId: number | null = null;
    try {
      const res = (await client.rest('GET', `homes/${att.targetHomeId}?depth=0`)) as {
        data?: { home?: { mkanListingId?: number | null; title?: string } };
      };
      mkanListingId = res.data?.home?.mkanListingId ?? null;
    } catch (e) {
      skipped.push(`${label}: home lookup failed — ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    if (!mkanListingId) {
      skipped.push(`${label}: its home has no mkanListingId — import the listing first`);
      state.seen.push(att.id);
      continue;
    }
    const listing = await db.listing.findUnique({
      where: { id: mkanListingId },
      select: { id: true, code: true, title: true, photoUrls: true },
    });
    if (!listing) {
      skipped.push(`${label}: no mkan listing #${mkanListingId} — fix the CRM pointer`);
      state.seen.push(att.id);
      continue;
    }

    if (!APPLY) {
      console.log(`   + would pull ${label} → listing #${listing.id}`);
      staged.push(label);
      continue;
    }

    let bytes: Buffer;
    try {
      bytes = await download(att);
    } catch (e) {
      const fails = (state.fails[att.id] ?? 0) + 1;
      state.fails[att.id] = fails;
      if (fails >= MAX_FAILS) {
        state.seen.push(att.id);
        delete state.fails[att.id];
        givenUp.push(`${label}: download failed ${fails}×, giving up — ${(e as Error).message.slice(0, 100)}`);
      } else {
        console.warn(`   ! ${label}: download failed (attempt ${fails}/${MAX_FAILS}) — ${(e as Error).message.slice(0, 100)}`);
      }
      continue;
    }

    // Room hint from the HUMAN's filename — and, now, the file name itself.
    const room = roomHintFrom(att.name);
    const ext = (extname(att.name).slice(1) || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    // An original lands in `temp/`, keeping the name the human gave it:
    // `mkan/temp/0001-01/hall.jpg`. The clean `mkan/0001-01/hall.webp` is what
    // mastering promotes it to, so the URL alone says which one this is. The
    // rehost used to bury it under a uuid, throwing away the one piece of
    // human evidence the file carried.
    const folder = listingFolder(listing);
    const stem = photoSlug(att.name.replace(/\.[a-z0-9]+$/i, '')) ?? shortId(att.id);
    const name = allocateName(stem, takenNames(`temp/${folder}`, listing.photoUrls, cdnNamespace()));
    const cdnUrl = await s3.putObject({
      key: tempKey(folder, name, ext),
      body: bytes,
      contentType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg',
    });
    if (!cdnUrl) {
      console.warn(`   ! ${label}: S3 unconfigured — leaving for next tick`);
      continue;
    }

    const photoIndex = listing.photoUrls.length;
    await db.listing.update({
      where: { id: listing.id },
      data: { photoUrls: { push: cdnUrl } },
    });
    const run = await db.masteringRun.create({
      data: {
        listingId: listing.id,
        photoIndex,
        originalUrl: cdnUrl,
        attempt: 1,
        promptVersion: PROMPT_VERSION,
        prompt: compilePrompt({ roomHint: room }),
        model: DEFAULT_MODEL_ID,
      },
    });

    mkdirSync(ORIGINALS, { recursive: true });
    const stagedAs = `${shortId(run.id)} ${att.name}`;
    writeFileSync(join(ORIGINALS, stagedAs), bytes);
    state.seen.push(att.id);
    delete state.fails[att.id];
    if (new Date(att.createdAt) > new Date(state.watermark)) state.watermark = att.createdAt;
    runsMade.push({ id: run.id, short: shortId(run.id), listingId: listing.id, room, stagedAs });
    console.log(`   ✓ ${label} → run ${shortId(run.id)} (listing #${listing.id}${room ? `, ${room}` : ''}) → staged ${stagedAs}`);
  }

  if (APPLY && runsMade.length && slackReady()) {
    const lines = runsMade.map(
      (r) => `• \`${r.short}\` listing #${r.listingId}${r.room ? ` · ${r.room}` : ''} — staged as \`${r.stagedAs}\``,
    );
    const digest = [
      `:camera_with_flash: *${runsMade.length} new photo(s) from Twenty queued for mastering*`,
      ...lines,
      `*Do:* drag them from \`~/mkan/inbox/originals/\` into the ChatGPT *master* project (standing prompt — nothing to paste), then save each render into \`~/mkan/inbox/\` keeping the \`<run-id> …\` prefix. The relay does the rest.`,
      ...(skipped.length ? ['', '*Skipped:*', ...skipped.map((s) => `• ${s}`)] : []),
      ...(givenUp.length ? ['', ':warning: *Given up (needs a human):*', ...givenUp.map((s) => `• ${s}`)] : []),
    ].join('\n');
    try {
      const { ts, url } = await slackPost(digest);
      await db.masteringRun.updateMany({
        where: { id: { in: runsMade.map((r) => r.id) } },
        data: { status: 'ASSIGNED', assignedAt: new Date(), slackTs: ts, slackUrl: url || null },
      });
      console.log(`   📣 digest posted — ${runsMade.length} run(s) ASSIGNED`);
    } catch (e) {
      console.warn(`   ! digest failed (runs stay QUEUED; master:dispatch will carry them): ${describeError(e)}`);
    }
  } else if (APPLY && (skipped.length || givenUp.length) && slackReady()) {
    await slackPost(
      [':warning: *Mastering pull — nothing queued, but:*', ...skipped.map((s) => `• ${s}`), ...givenUp.map((s) => `• ${s}`)].join('\n'),
    ).catch(() => undefined);
  }

  if (APPLY) saveState(state);
  console.log(
    APPLY
      ? `\n✅ pulled ${runsMade.length}, skipped ${skipped.length}, gave up ${givenUp.length}\n`
      : `\nDRY RUN — would pull ${staged.length}, skip ${skipped.length}. Re-run with --apply.\n`,
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${describeError(e)}\n`);
  process.exit(1);
});
