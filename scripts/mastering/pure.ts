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
