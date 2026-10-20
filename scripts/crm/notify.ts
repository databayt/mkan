/**
 * One Slack post to #mkan, from any CRM job — and the failure-streak alarm.
 *
 * The TikTok sweep looked only at `SLACK_BOT_TOKEN` and the Keychain
 * `databayt` item, so under launchd (no shell profile) its daily summary was
 * "no Slack token — summary not posted". The token lookup the Slack intake
 * lane already had (env → Keychain → ~/.hermes/.env) now serves every job.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MKAN_CHANNEL = (process.env.SLACK_HOME_CHANNEL ?? '').trim() || 'C0BS2NZE2AY'; // private #mkan

let cached: string | null = null;
export function slackToken(): string {
  if (cached != null) return cached;
  cached = (process.env.SLACK_BOT_TOKEN ?? '').trim();
  for (const [service, account] of [['databayt', 'SLACK_BOT_TOKEN'], ['cf-mkan-SLACK_BOT_TOKEN', '']] as const) {
    if (cached) break;
    try {
      const acct = account ? ` -a ${account}` : '';
      cached = execSync(`security find-generic-password -s ${service}${acct} -w`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      cached = '';
    }
  }
  if (!cached) {
    try {
      const line = readFileSync(join(homedir(), '.hermes/.env'), 'utf8').split('\n').find((l) => l.startsWith('SLACK_BOT_TOKEN='));
      cached = (line?.split('=').slice(1).join('=') ?? '').trim().replace(/^["']|["']$/g, '');
    } catch {
      cached = '';
    }
  }
  return cached;
}

/**
 * Uploads a file to #mkan with `comment` as its message — the TikTok page's
 * daily videos reach the phone this way. Slack's two-step external upload:
 * get an upload URL, POST the bytes, then complete into the channel. Needs the
 * bot's `files:write` scope. Never throws.
 */
export async function uploadToMkan(path: string, comment: string, opts: { channel?: string; title?: string } = {}): Promise<boolean> {
  const token = slackToken();
  if (!token) {
    console.warn('  ! no Slack token — file not uploaded');
    return false;
  }
  try {
    const bytes = readFileSync(path);
    const filename = path.split('/').pop() ?? 'file';
    const auth = { Authorization: `Bearer ${token}` };
    const step1 = (await (
      await fetch('https://slack.com/api/files.getUploadURLExternal', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ filename, length: String(bytes.length) }),
      })
    ).json()) as { ok?: boolean; error?: string; upload_url?: string; file_id?: string };
    if (!step1.ok || !step1.upload_url || !step1.file_id) {
      console.warn(`  ! slack upload: ${step1.error}`);
      return false;
    }
    const put = await fetch(step1.upload_url, { method: 'POST', body: bytes });
    if (!put.ok) {
      console.warn(`  ! slack upload: HTTP ${put.status}`);
      return false;
    }
    const done = (await (
      await fetch('https://slack.com/api/files.completeUploadExternal', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ files: [{ id: step1.file_id, title: opts.title ?? filename }], channel_id: opts.channel ?? MKAN_CHANNEL, initial_comment: comment }),
      })
    ).json()) as { ok?: boolean; error?: string };
    if (!done.ok) console.warn(`  ! slack upload: ${done.error}`);
    return !!done.ok;
  } catch (e) {
    console.warn(`  ! slack upload: ${(e as Error).message}`);
    return false;
  }
}

/** Posts `text` (Slack mrkdwn). Never throws: a missing token or a Slack error is logged. */
export async function postToMkan(text: string, opts: { channel?: string; threadTs?: string } = {}): Promise<boolean> {
  const token = slackToken();
  if (!token) {
    console.warn('  ! no Slack token (env, Keychain databayt/cf-mkan-SLACK_BOT_TOKEN, ~/.hermes/.env) — not posted');
    return false;
  }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: opts.channel ?? MKAN_CHANNEL, text, thread_ts: opts.threadTs, unfurl_links: false }),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!json.ok) console.warn(`  ! slack: ${json.error}`);
    return !!json.ok;
  } catch (e) {
    console.warn(`  ! slack: ${(e as Error).message}`);
    return false;
  }
}

const STREAKS = join(__dirname, '.data', 'failure-streaks.json');

/**
 * Count consecutive failures of a scheduled job; alert #mkan once when the
 * streak reaches `threshold`, and once more when it recovers. sync-up failed
 * 87 times against a sleeping CRM and nobody heard about any of them.
 */
export async function recordRun(job: string, ok: boolean, detail = '', threshold = 3): Promise<void> {
  let streaks: Record<string, { fails: number; alerted: boolean; last?: string }> = {};
  try {
    if (existsSync(STREAKS)) streaks = JSON.parse(readFileSync(STREAKS, 'utf8'));
  } catch {
    streaks = {};
  }
  const s = streaks[job] ?? { fails: 0, alerted: false };
  if (ok) {
    if (s.alerted) await postToMkan(`✅ *${job}* is running again after ${s.fails} failed run(s).`);
    streaks[job] = { fails: 0, alerted: false };
  } else {
    s.fails += 1;
    s.last = detail.slice(0, 300);
    if (s.fails >= threshold && !s.alerted) {
      await postToMkan(`⚠️ *${job}* has failed ${s.fails} runs in a row. Last error: \`${s.last || 'unknown'}\``);
      s.alerted = true;
    }
    streaks[job] = s;
  }
  mkdirSync(join(__dirname, '.data'), { recursive: true });
  writeFileSync(STREAKS, JSON.stringify(streaks, null, 2));
}
