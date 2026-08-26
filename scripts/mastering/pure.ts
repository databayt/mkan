/**
 * Pure helpers for the mastering scripts — no env reads, no I/O, no module-
 * scope side effects. Tests import THIS file, so lib.ts's dotenv/Keychain
 * bootstrapping never runs inside the suite (tests/mastering.test.ts).
 */

export const CDN_HOST = 'cdn.databayt.org';

export const isCdnUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname === CDN_HOST;
  } catch {
    return false;
  }
};

// ── Where an image lives, and what it is called ─────────────────────────────
//
// A mastered photo gets the URL a human would have chosen:
//
//   https://cdn.databayt.org/mkan/0001-01/bedroom.webp
//
// The folder is the listing's own public code — the same `NNNN-NN` the CRM,
// the WhatsApp outreach and mkan.sd all share — so the photo and the page it
// belongs to read as one thing. The name is the room.
//
// An ORIGINAL never gets that name. It sits in `mkan/temp/<listing>/…` under
// whatever it was called when it arrived, and it stays there forever: the
// pretty path is what mastering EARNS, so the URL itself says whether a photo
// has been through the pipeline. Originals are immortal — nothing here deletes
// one — they simply stop being what the listing serves.
//
// Note: writing outside `mkan/uploads/*` requires the mkan IAM user's S3
// policy to allow `arn:aws:s3:::databayt-cdn/mkan/*`. The bucket and
// CloudFront already serve these keys.

/**
 * The folder a listing's photos live in: its public code when it has one
 * (`0001-01`), else the row id.
 *
 * Deliberately NOT `listingSegment`, which falls back to `sourceListingId` —
 * an EXTERNAL Airbnb room id has no business naming a folder on our own CDN.
 * 113 of 147 listings have no code yet (it is minted at publish), and those
 * are precisely the ones nobody is mastering.
 */
export const listingFolder = (listing: { code?: string | null; id: number | string }): string =>
  (listing.code && listing.code.trim()) || String(listing.id);

/**
 * A room name turned into a file name: lowercase, dashes, nothing exotic.
 * Returns null when nothing usable survives, so the caller falls back rather
 * than writing a file called `-`.
 */
export function photoSlug(input: string | null | undefined): string | null {
  const slug = (input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

/**
 * The first free name in a folder — `bedroom`, then `bedroom-2`, `bedroom-3`.
 *
 * Keys are written ONCE and never overwritten, and this is why. Re-mastering
 * happens after a revert, and objects here carry no Cache-Control: CloudFront
 * would keep serving the rejected photo from the old key for up to a day —
 * exactly the image the revert existed to remove. A second bedroom and a
 * second attempt at the first one are the same problem, and take the same
 * answer.
 */
export function allocateName(preferred: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(preferred)) return preferred;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${preferred}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`cannot allocate a name for "${preferred}" — 999 already taken`);
}

/** `mkan/0001-01/bedroom.webp` — what a mastered photo serves from. */
export const masteredKey = (folder: string, name: string, ns = 'mkan'): string =>
  `${ns}/${folder}/${name}.webp`;

/** `mkan/temp/0001-01/hall.jpg` — where an original waits to be mastered. */
export const tempKey = (folder: string, name: string, ext: string, ns = 'mkan'): string =>
  `${ns}/temp/${folder}/${name}.${ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'}`;

/** The file name (no extension) a stored URL is using, for collision checks. */
export function nameFromUrl(url: string): string | null {
  try {
    const stem = new URL(url).pathname.split('/').pop() ?? '';
    return stem.replace(/\.[a-z0-9]+$/i, '') || null;
  } catch {
    return null;
  }
}

/**
 * Names already spoken for in a listing's folder — read off the URLs the
 * listing actually serves plus every mastered output it has ever produced,
 * so a reverted attempt's key is never handed out twice.
 */
export function takenNames(folder: string, urls: (string | null | undefined)[], ns = 'mkan'): Set<string> {
  const prefix = `/${ns}/${folder}/`;
  const out = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    try {
      if (!new URL(url).pathname.startsWith(prefix)) continue;
    } catch {
      continue;
    }
    const name = nameFromUrl(url);
    if (name) out.add(name);
  }
  return out;
}

/**
 * Room hint from the photo's own filename — `…/living-room.webp` → "living
 * room". Photos named after the room they show (the heirs sets) ground the
 * prompt for free. Trailing digits are photo order within a room type, not
 * part of the room's name, so they are stripped. Only letters-and-spaces
 * survive: UUID basenames (every scraped re-host is `<uuid>.webp`) would
 * otherwise leak hex garbage into the prompt as a "room".
 */
export function roomHintFrom(url: string): string | null {
  const stem = url.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? '';
  const words = stem.replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim();
  return /^[a-z][a-z ]*$/i.test(words) ? words : null;
}

/**
 * Swap one URL for another in a photo array — BY VALUE, never by index (hosts
 * mutate the array under us). Null when `from` is absent: the host removed or
 * replaced that photo, and the caller must not guess a slot.
 */
export function swapPhoto(urls: string[], from: string, to: string): string[] | null {
  const idx = urls.indexOf(from);
  if (idx === -1) return null;
  const next = [...urls];
  next[idx] = to;
  return next;
}

/**
 * A run has DRIFTED when it says UPDATED but its mastered URL is no longer in
 * the listing's photoUrls — a host wholesale-replace or delete after apply.
 * The status would otherwise lie forever; reconcile/status surface this.
 */
export const isDrifted = (masteredUrl: string | null, photoUrls: string[]): boolean =>
  Boolean(masteredUrl) && !photoUrls.includes(masteredUrl as string);

// ── Slack return-lane shapes (spec §13) — parsing only, transport lives in lib ──
export type SlackReturn = {
  fileId: string;
  name: string;
  mimetype: string;
  size: number;
  downloadUrl: string;
  user: string;
  ts: string;
  threadTs?: string;
  text: string;
};

export type SlackMessage = {
  ts: string;
  thread_ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  files?: {
    id: string;
    name?: string;
    mimetype?: string;
    size?: number;
    url_private_download?: string;
    url_private?: string;
  }[];
};

export const IMAGE_MIME = /^image\/(png|jpe?g|webp)$/i;

/** Human-attached images out of raw Slack messages, newest first. */
export const toReturns = (messages: SlackMessage[]): SlackReturn[] =>
  messages
    .filter((m) => !m.bot_id && m.subtype !== 'bot_message') // human returns only
    .flatMap((m) =>
      (m.files ?? [])
        .filter((f) => IMAGE_MIME.test(f.mimetype ?? '') && (f.url_private_download || f.url_private))
        .map((f) => ({
          fileId: f.id,
          name: f.name ?? `${f.id}.png`,
          mimetype: f.mimetype ?? 'image/png',
          size: f.size ?? 0,
          downloadUrl: (f.url_private_download || f.url_private) as string,
          user: m.user ?? '',
          ts: m.ts,
          threadTs: m.thread_ts,
          text: m.text ?? '',
        })),
    )
    .sort((a, b) => Number(b.ts) - Number(a.ts));

// ── When a dropped file cannot be the render it claims to be ────────────────

/**
 * A file in OUR inbox: the human put it there deliberately, so the only thing
 * worth disproving is that it existed before the photo did. Compare against
 * the moment the PHOTO first entered the pipeline (the earliest run over that
 * original URL), never against the attempt in flight.
 *
 * Attempt 2 is queued and dispatched only AFTER the previous attempt is
 * rejected — while the human, working ahead, has usually already rendered the
 * replacement. Run irrpmcb2 is the proof: the render was saved at 01:59Z, the
 * revert/requeue/dispatch cycle ran 02:02–02:16Z, and a guard that compared
 * against `assignedAt` refused a perfectly good photo. The render sat unread
 * and was eventually lost. A render genuinely cannot pre-date the first time
 * we ever asked for that photo; anything tighter punishes working ahead.
 */
export const predatesLineage = (fileMtimeMs: number, firstQueuedAt: Date | null | undefined): boolean =>
  Boolean(firstQueuedAt) && fileMtimeMs < (firstQueuedAt as Date).getTime();

/**
 * A file from a folder that is NOT ours (~/Downloads, the machine's junk
 * drawer) gets the strict rule: it must post-date the dispatch it answers.
 * There the cost of a false accept is mastering an unrelated screenshot into a
 * live listing, so the burden of proof sits on the file.
 */
export const predatesDispatch = (fileMtimeMs: number, assignedAt: Date | null | undefined): boolean =>
  Boolean(assignedAt) && fileMtimeMs < (assignedAt as Date).getTime();

/**
 * States the machine can never have produced — the tell that something wrote
 * these rows outside the scripts. Each pairing is impossible by construction:
 * `dispatch` sets ASSIGNED with the Slack ts in one update, `done` sets
 * masteredUrl with MASTERED, and UPDATED is always stamped with appliedAt.
 *
 * This exists because it already happened: on 2026-08-25 an ad-hoc write
 * rewrote the frozen prompt of three dispatched runs from v1 to v2 and reset
 * their status, leaving Slack tasks quoting one prompt and the database
 * claiming another. Nothing in the pipeline noticed for a day.
 */
export function impossibleState(run: {
  status: string;
  slackTs: string | null;
  masteredUrl: string | null;
  appliedAt: Date | null;
}): string | null {
  if (run.status === 'QUEUED' && run.slackTs) return 'QUEUED but carries a Slack task — dispatched, then reset';
  if (run.masteredUrl && !['MASTERED', 'UPDATED', 'REJECTED', 'FAILED'].includes(run.status))
    return `${run.status} but already has a mastered URL`;
  if (run.status === 'UPDATED' && !run.appliedAt) return 'UPDATED without an applied timestamp';
  return null;
}
