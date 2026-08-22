/**
 * Shared plumbing for the image-mastering scripts (Epic: listing photo
 * mastering — docs/image-mastering.md).
 *
 * dotenv loads HERE, so every entry script imports './lib' FIRST — and
 * '@/lib/db' / '@/lib/s3' read env at module scope, so they are only reachable
 * through the lazy getDb()/getS3() below (the same deferred-import gotcha the
 * crm scripts document).
 */
import { config } from 'dotenv';
config({ override: true });

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { twentyClient } from '../crm/twenty-rest';

export const trim = (v: string | null | undefined): string => (v ?? '').trim();

// Twenty creds: env first, Keychain fallback (the crm.py precedent) — the
// mastering scripts must work without TWENTY_* in .env. Port 3100, never 3000:
// 3000 is hogwarts' dev server and fails silently.
if (!trim(process.env.TWENTY_API_URL)) process.env.TWENTY_API_URL = 'http://localhost:3100';
if (!trim(process.env.TWENTY_API_KEY)) {
  try {
    process.env.TWENTY_API_KEY = execSync(
      'security find-generic-password -s databayt-twenty -a mkan -w',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
  } catch {
    // CRM rollup stays best-effort — mastering never depends on it.
  }
}

/** `--name=value` argv helper (crm idiom). */
export const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
export const flag = (n: string): boolean => process.argv.includes(`--${n}`);
/** First bare (non-flag) argument after the script name — the run ref. */
export const positional = (): string =>
  process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '';

/** Stale thresholds in hours — reconcile flags anything older (doc §18). */
export const STALE = {
  QUEUED_H: parseInt(trim(process.env.MASTERING_STALE_QUEUED_H) || '168', 10),
  ASSIGNED_H: parseInt(trim(process.env.MASTERING_STALE_ASSIGNED_H) || '48', 10),
  MASTERED_H: parseInt(trim(process.env.MASTERING_STALE_MASTERED_H) || '24', 10),
};
export const MAX_ATTEMPTS = 3;

export const CDN_HOST = 'cdn.databayt.org';
const NS = trim(process.env.NEXT_PUBLIC_CDN_NAMESPACE) || 'mkan';

/** Mastered output lives beside host uploads — IAM only allows `mkan/uploads/*`. */
export const masteredKey = (runId: string): string => `${NS}/uploads/mastered/${runId}.webp`;

export const isCdnUrl = (url: string): boolean => {
  try {
    return new URL(url).hostname === CDN_HOST;
  } catch {
    return false;
  }
};

export const hoursAgo = (d: Date | null | undefined): number =>
  d ? (Date.now() - d.getTime()) / 3_600_000 : 0;
export const ago = (d: Date | null | undefined): string => {
  if (!d) return '—';
  const h = hoursAgo(d);
  return h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};

// ── lazy app-lib imports (env must load before their module scope runs) ──────
export async function getDb() {
  const { db } = await import('@/lib/db');
  return db;
}
export async function getS3() {
  return import('@/lib/s3');
}

/**
 * Find one run by full id or any unique substring (cuids share a timestamp
 * prefix, so the distinctive part is the tail — `master:done h3k9x2` works).
 */
export async function findRun(ref: string) {
  if (!ref) throw new Error('missing run ref — pass the run id (or its unique tail) from the Slack task');
  const db = await getDb();
  const matches = await db.masteringRun.findMany({
    where: { id: { contains: ref } },
    include: { listing: { select: { id: true, title: true, hostId: true, photoUrls: true, isPublished: true } } },
    take: 5,
  });
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`no run matches "${ref}" — see pnpm master:status`);
  throw new Error(`"${ref}" is ambiguous (${matches.map((m) => m.id.slice(-8)).join(', ')}) — use more characters`);
}

export const shortId = (id: string): string => id.slice(-8);

export async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

/** Open files in the default viewer (macOS Preview) for the honesty eyeball. */
export function openFiles(paths: string[]): void {
  if (process.platform === 'darwin') spawnSync('open', paths, { stdio: 'ignore' });
}

// ── Slack (direct Web API — Hermes chat replies are flaky; see plan) ─────────
// Token resolution: explicit env → Keychain (the /credentials convention) →
// the Hermes gateway's token (~/.hermes/.env) — today the one Slack bot this
// machine has, so tasks post as Hermes Agent, the same bot that will operate
// the channel in Phase 2.
let cachedToken: string | null = null;
function slackToken(): string {
  if (cachedToken != null) return cachedToken;
  cachedToken = trim(process.env.SLACK_BOT_TOKEN);
  if (!cachedToken) {
    try {
      cachedToken = execSync('security find-generic-password -s databayt -a SLACK_BOT_TOKEN -w', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      cachedToken = '';
    }
  }
  if (!cachedToken) {
    try {
      const hermesEnv = readFileSync(join(homedir(), '.hermes/.env'), 'utf8');
      const line = hermesEnv.split('\n').find((l) => l.startsWith('SLACK_BOT_TOKEN='));
      cachedToken = trim(line?.split('=').slice(1).join('=')).replace(/^"|"$/g, '');
    } catch {
      cachedToken = '';
    }
  }
  return cachedToken;
}
export function slackChannel(): string {
  return trim(process.env.SLACK_MASTERING_CHANNEL);
}
export function slackReady(): boolean {
  return Boolean(slackToken() && slackChannel());
}

async function slackApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${slackToken()}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!json.ok) throw new Error(`slack ${method} → ${json.error ?? res.status}`);
  return json;
}

/** Post to the mastering channel (or a thread in it); returns ts + permalink. */
export async function slackPost(text: string, threadTs?: string): Promise<{ ts: string; url: string }> {
  const channel = slackChannel();
  if (!slackReady()) throw new Error('Slack not configured — set SLACK_MASTERING_CHANNEL (+ SLACK_BOT_TOKEN env or Keychain databayt/SLACK_BOT_TOKEN)');
  const posted = await slackApi<{ ts: string }>('chat.postMessage', {
    channel,
    text,
    unfurl_links: true,
    unfurl_media: true,
    ...(threadTs ? { thread_ts: threadTs } : {}),
  });
  let url = '';
  try {
    const res = await fetch(
      `https://slack.com/api/chat.getPermalink?channel=${encodeURIComponent(channel)}&message_ts=${encodeURIComponent(posted.ts)}`,
      { headers: { Authorization: `Bearer ${slackToken()}` } },
    );
    const json = (await res.json()) as { ok?: boolean; permalink?: string };
    if (json.ok && json.permalink) url = json.permalink;
  } catch {
    // permalink is a nicety, never fatal
  }
  return { ts: posted.ts, url };
}

/** Best-effort thread reply — mastering must not fail because Slack did. */
export async function slackReplySafe(threadTs: string | null | undefined, text: string): Promise<void> {
  if (!threadTs || !slackReady()) return;
  try {
    await slackPost(text, threadTs);
  } catch (e) {
    console.warn(`  ! slack reply failed: ${(e as Error).message}`);
  }
}

/** GET a Slack Web API method (history/files read paths take query params). */
async function slackGet<T>(method: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, {
    headers: { Authorization: `Bearer ${slackToken()}` },
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; needed?: string } & T;
  if (!json.ok) {
    const err = json.error ?? String(res.status);
    if (err === 'missing_scope') {
      throw new Error(
        `slack ${method} → missing_scope (needs ${json.needed ?? '?'}). The kun bot can post but not read: ` +
          'add `files:read` + `groups:history` to the app at api.slack.com/apps → OAuth & Permissions → ' +
          'Bot Token Scopes, then Reinstall to Workspace (docs/image-mastering.md → "Slack return lane").',
      );
    }
    throw new Error(`slack ${method} → ${err}`);
  }
  return json;
}

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

type SlackMessage = {
  ts: string;
  thread_ts?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  files?: { id: string; name?: string; mimetype?: string; size?: number; url_private_download?: string; url_private?: string }[];
};

const IMAGE_MIME = /^image\/(png|jpe?g|webp)$/i;

const toReturns = (messages: SlackMessage[]): SlackReturn[] =>
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
    .sort((a, b) => Number(b.ts) - Number(a.ts)); // newest first

/**
 * Human-uploaded images in the mastering channel — the spec's §13 return lane.
 * Reads the channel top level AND the replies of the given task threads, so a
 * return works whether it landed in the run's thread (preferred) or loose in
 * the channel (what a phone share does).
 */
export async function slackReturns(threadTss: string[] = [], limit = 50): Promise<SlackReturn[]> {
  if (!slackReady()) throw new Error('Slack not configured — set SLACK_MASTERING_CHANNEL (+ SLACK_BOT_TOKEN)');
  const channel = slackChannel();
  const top = await slackGet<{ messages: SlackMessage[] }>('conversations.history', {
    channel,
    limit: String(limit),
  });
  const found = toReturns(top.messages ?? []);
  for (const ts of threadTss.filter(Boolean)) {
    try {
      const thread = await slackGet<{ messages: SlackMessage[] }>('conversations.replies', {
        channel,
        ts,
        limit: '50',
      });
      // replies[0] is the parent (already in history) — dedupe by file id below
      found.push(...toReturns(thread.messages ?? []));
    } catch (e) {
      console.warn(`  ! slack thread ${ts} unreadable: ${(e as Error).message}`);
    }
  }
  const seen = new Set<string>();
  return found.filter((r) => (seen.has(r.fileId) ? false : (seen.add(r.fileId), true)));
}

/** Download a Slack-hosted file (private URLs need the bot token as Bearer). */
export async function slackDownload(ret: SlackReturn): Promise<Buffer> {
  const res = await fetch(ret.downloadUrl, { headers: { Authorization: `Bearer ${slackToken()}` } });
  if (!res.ok) throw new Error(`slack file download failed (${res.status}) ${ret.name}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Slack answers an unauthorized fetch with the HTML sign-in page, 200 OK.
  if (buf.subarray(0, 15).toString('utf8').trim().toLowerCase().startsWith('<!doctype html')) {
    throw new Error('slack returned HTML, not the image — the token lacks files:read (see the scope note above)');
  }
  return buf;
}

/** React on the returned message so the channel shows what the loop consumed. */
export async function slackReactSafe(ts: string, name: string): Promise<void> {
  if (!slackReady()) return;
  try {
    await slackApi('reactions.add', { channel: slackChannel(), timestamp: ts, name });
  } catch (e) {
    console.warn(`  ! slack reaction failed: ${(e as Error).message}`);
  }
}

// ── Twenty rollup (listing-level mirror — Home stays the ops Kanban) ─────────
// LINKS composites match twenty-upsert.ts shapes.
const linkOne = (url: string) => ({ primaryLinkUrl: url, primaryLinkLabel: '', secondaryLinks: [] });
const linkMany = (urls: string[]) =>
  urls.length
    ? {
        primaryLinkUrl: urls[0],
        primaryLinkLabel: '',
        secondaryLinks: urls.slice(1).map((u) => ({ label: '', url: u })),
      }
    : undefined;

/**
 * Mirror mastering progress onto the Twenty `home` record: photo URLs (what
 * the site now serves), photosMastered count, lastMasteredAt, and photoStage →
 * MASTERED once every photo is done. Fields exist via twenty-schema.ts
 * (`crm:seed-objects` / `crm:sync-options`). Returns a status line; throws
 * only inside — callers treat Twenty as best-effort (the CRM is down whenever
 * the laptop is, and mastering must not depend on it).
 */
export async function twentyRollup(
  listingId: number,
  photoUrls: string[],
  masteredCount: number,
): Promise<string> {
  const client = twentyClient(); // throws when TWENTY_API_URL/KEY are unset
  const unwrap = (res: unknown): Record<string, unknown>[] => {
    const d = (res as { data?: unknown })?.data ?? res;
    const v = (d as Record<string, unknown>)?.homes ?? d;
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  };
  let home = unwrap(
    await client.rest('GET', `homes?filter=mkanListingId[eq]:${listingId}&depth=0&limit=1`),
  )[0];
  if (!home) {
    // Filter syntax on NUMBER fields has bitten before — fall back to a scan.
    home = (await client.all('homes', 0)).find((h) => h.mkanListingId === listingId);
  }
  if (!home) return `no Twenty home carries mkanListingId=${listingId} — CRM not updated`;
  const total = photoUrls.length;
  const body: Record<string, unknown> = {
    photoUrls: linkMany(photoUrls),
    coverPhotoUrl: photoUrls[0] ? linkOne(photoUrls[0]) : undefined,
    photoCount: total,
    photosMastered: masteredCount,
    lastMasteredAt: new Date().toISOString(),
  };
  if (masteredCount >= total && total > 0) body.photoStage = 'MASTERED';
  await client.rest('PATCH', `homes/${home.id as string}`, body);
  return `Twenty home updated — ${masteredCount}/${total} mastered${body.photoStage ? ' · photoStage=MASTERED' : ''}`;
}
