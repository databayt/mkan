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

/** Mastered output lives beside host uploads — IAM only allows `mkan/uploads/*`. */
export const masteredKey = (runId: string, ns = 'mkan'): string =>
  `${ns}/uploads/mastered/${runId}.webp`;

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
