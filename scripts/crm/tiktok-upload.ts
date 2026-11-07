/**
 * Posts the day's rendered TikTok videos to @mkan.rw — no phone step.
 *
 *   pnpm tt:upload [--date=YYYY-MM-DD] [--dry] [--notify] [--spread | --upto=<n>]
 *   pnpm tt:upload --plan [--spread | --upto=<n>]     what this slot would post — no browser, posts nothing
 *   pnpm tt:upload --file=<mp4> --caption=<txt> [--aigc] [--dry]   one ad-hoc video
 *
 * Drives TikTok Studio's web upload (tiktok.com/tiktokstudio/upload) in the
 * session-vault Chrome on 127.0.0.1:9222 — Abdout's own signed-in browser, so
 * the post comes from a real session, not a headless bot. TikTok's Content
 * Posting API stays private until an app audit passes (kun#168); switch this
 * file to the API then.
 *
 * What goes out each day (tt:run made it at 07:00): one post per queued home —
 * <date>/<ref>.mp4 + <ref>.txt, the broker's own footage cleaned of every text
 * and logo, their own sound kept, the caption carrying the code, the WhatsApp
 * number and the broker's credit. Nothing generated is in it (the upscale only
 * sharpens the real footage), so the AI-content label is switched OFF; an
 * ad-hoc --file post can still ask for it with --aigc. No carousels, no photo
 * posts, no picture videos (2026-11-05).
 * A per-day `uploads.json` keeps a rerun from posting twice. A posted home is
 * stamped in posted.json, so it rests 30 days like a hand-posted one, and its
 * TikTokPost row turns POSTED (with the post's URL when Studio shows it) or
 * FAILED with the reason.
 *
 * --spread (2026-11-07): the day's posts go out one by one through the day's slots (07:00, then
 * :30 past every hour 08–22). Each slot first renders its own share (tt:render --slot), then posts
 * its share of the day's queue (slotQuota): an even spread whatever the day's count, with a missed
 * slot caught up at most two at a time. A clean slot posts nothing to #mkan until the day's last
 * home is up. --upto=<n> instead brings the day to n posts. TikTok spreads reach per account, so
 * one post an hour reaches more people than a burst. A piece counts as out once it is in
 * uploads.json or pending.json, and nothing clicked-but-unconfirmed is posted twice.
 *
 * --dry fills everything (file, caption, label) and stops before Post, saving a
 * screenshot next to the video. Env: TIKTOK_UPLOAD_CDP (default http://127.0.0.1:9222).
 */
import { config } from 'dotenv';
config({ override: true });

import { refuseUnattended } from '../unattended';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { chromium, type Page, type Response } from 'playwright';
import { postToMkan, recordRun } from './notify';
import { dayPieces, errorText, kigaliHour, slotQuota, type Ledger } from './tiktok-post-pure';
import { ownTikTok } from './tiktok-pure';

const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
const flag = (n: string): boolean => process.argv.includes(`--${n}`);

const DATA = join(__dirname, '.data', 'tiktok-post');
const LEDGER = join(DATA, 'posted.json');
const date = argv('date', new Date().toISOString().slice(0, 10));
const DAY = join(DATA, date);
const UPLOADS = join(DAY, 'uploads.json');
// Clicked Post, confirmation not seen yet. TikTok may well have it: a retry must not post it again
// (a later upload slot, or kun's supervisor re-running the day's post). Cleared on confirmation, or by hand.
const PENDING = join(DAY, 'pending.json');
const CDP = (process.env.TIKTOK_UPLOAD_CDP ?? '').trim() || 'http://127.0.0.1:9222';
const PAGE = ownTikTok().handle;
const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload?lang=en';
const dry = flag('dry');

interface Piece {
  key: string; // the home's ref
  mp4: string;
  caption: string;
  aigc: boolean;
  /** The home's TikTokPost row (tt:pick wrote it into queue.json). */
  postId?: string;
}

const readJson = <T>(p: string, d: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : d);

function todaysPieces(): Piece[] {
  const file = argv('file');
  // preview/ holds renders made for a look or a broker's ask (any listing, consent or not), dry/ holds
  // dry-run renders: never posted.
  if (file && /[\\/](preview|dry)[\\/]/.test(file)) throw new Error(`${file} is a preview or dry-run render — those are never posted`);
  if (file) return [{ key: basename(file, '.mp4'), mp4: file, caption: readFileSync(argv('caption'), 'utf8'), aigc: flag('aigc') }];
  const out: Piece[] = [];
  const queue = readJson<{ id: number; code: string | null; postId?: string }[]>(join(DAY, 'queue.json'), []);
  for (const r of queue) {
    const ref = r.code?.trim() || `K${r.id}`;
    const mp4 = join(DAY, `${ref}.mp4`);
    // A REJECTED render leaves no mp4, so it never gets here.
    if (existsSync(mp4) && existsSync(join(DAY, `${ref}.txt`))) out.push({ key: ref, mp4, caption: readFileSync(join(DAY, `${ref}.txt`), 'utf8'), aigc: false, postId: r.postId });
  }
  return out;
}

const VAULT_JOB = 'com.databayt.chrome-session';

async function cdpUp(): Promise<boolean> {
  try {
    return (await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(2000) })).ok;
  } catch {
    return false;
  }
}

/** Wake the session vault when it is down; true once its CDP port answers. */
async function wakeVault(waitMs = 90_000): Promise<boolean> {
  if (await cdpUp()) return true;
  // The vault's launchd job respects a Cmd-Q (it only restarts after a crash), so a quit
  // or a reboot leaves it down. kickstart starts the loaded job without fighting a person
  // using it. chrome-debug.sh is the fallback, detached: it execs Chrome in the foreground,
  // so waiting on it (the old execFileSync) timed out at 60 s and killed the vault with it.
  try {
    execFileSync('launchctl', ['kickstart', `gui/${process.getuid?.() ?? 501}/${VAULT_JOB}`], { stdio: 'ignore', timeout: 15_000 });
  } catch {
    spawn('bash', [join(homedir(), '.claude', 'bin', 'chrome-debug.sh')], { stdio: 'ignore', detached: true }).unref();
  }
  for (const end = Date.now() + waitMs; Date.now() < end; ) {
    if (await cdpUp()) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function connect() {
  if (!(await wakeVault())) throw new Error(`the session-vault Chrome did not come up on ${CDP} — run: launchctl kickstart gui/$(id -u)/${VAULT_JOB}`);
  return chromium.connectOverCDP(CDP, { timeout: 30_000 });
}

/** TikTok Studio throws tours and "turn on content checks?" prompts; none of them is the post. */
async function dismissPrompts(p: Page): Promise<void> {
  // Feature tours (react-joyride) lay an overlay over the whole form.
  for (let i = 0; i < 6 && (await p.locator('.react-joyride__overlay, .react-joyride__tooltip').first().isVisible().catch(() => false)); i++) {
    const skip = p.locator('.react-joyride__tooltip button').filter({ hasText: /skip|got it|done|close|next/i }).last();
    if (await skip.isVisible().catch(() => false)) await skip.click({ force: true }).catch(() => {});
    else await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
  }
  await p.evaluate(() => document.getElementById('react-joyride-portal')?.remove()).catch(() => {});
  const modal = p.locator('.TUXModal-overlay, [role="dialog"]');
  for (let i = 0; i < 4 && (await modal.first().isVisible().catch(() => false)); i++) {
    const m = modal.first();
    const text = await m.innerText().catch(() => '');
    // The copyright/muted-music check is worth having; every other prompt is a tour.
    const name = /content checks/i.test(text) ? /^turn on$/i : /^(got it|not now|skip|close|cancel)$/i;
    const b = m.getByRole('button', { name }).first();
    if (!(await b.isVisible().catch(() => false))) break;
    await b.click().catch(() => {});
    await p.waitForTimeout(1000);
  }
}

/** A run that died mid-upload leaves a draft banner: discard it so the new file takes. */
async function discardDraft(p: Page): Promise<void> {
  const discard = p.getByRole('button', { name: /^discard$/i });
  if (!(await discard.first().isVisible().catch(() => false))) return;
  await discard.first().click();
  await p.waitForTimeout(1000);
  const confirm = p.locator('.TUXModal-overlay, [role="dialog"]').getByRole('button', { name: /^discard$/i });
  if (await confirm.first().isVisible().catch(() => false)) await confirm.first().click();
  await p.waitForTimeout(1500);
}

const EDITOR = '.public-DraftEditor-content, div[contenteditable="true"]';

/**
 * The upload page with the file in and the caption editor on screen. Studio has
 * sat on a half-built form after the file went in (11-05: "locator.waitFor
 * Timeout … DraftEditor-content"): the page is reloaded once and the file put in
 * again before the run gives up on this piece.
 */
async function openForm(p: Page, piece: Piece): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    if (attempt === 1) await p.goto(UPLOAD_URL, { waitUntil: 'domcontentloaded' });
    else await p.reload({ waitUntil: 'domcontentloaded' });
    if (/\/login/.test(p.url()) || (await p.locator('input[type=file]').count().catch(() => 0)) === 0) {
      await p.waitForTimeout(6000);
      if (/\/login/.test(p.url())) throw new Error(`the vault Chrome is logged out of TikTok — scan the QR at ${UPLOAD_URL} with @${PAGE} on the phone`);
    }
    await discardDraft(p);
    await dismissPrompts(p);
    const input = p.locator('input[type=file]').first();
    await input.waitFor({ state: 'attached', timeout: 60_000 });
    await input.setInputFiles(piece.mp4);
    try {
      await p.locator(EDITOR).first().waitFor({ state: 'visible', timeout: attempt === 1 ? 90_000 : 150_000 });
      return;
    } catch (e) {
      const shot = join(dirname(piece.mp4), `${piece.key}.editor-timeout.png`);
      await p.screenshot({ path: shot, fullPage: true }).catch(() => {});
      if (attempt >= 2) throw new Error(`the caption editor never appeared, after one reload (screenshot ${shot})`);
      console.warn(`  … ${piece.key}: the caption editor did not appear (${(e as Error).message.split('\n')[0]}) — reloading once`);
    }
  }
}

async function setCaption(p: Page, text: string): Promise<void> {
  const box = p.locator(EDITOR).first();
  const first = text.trim().split('\n')[0]!.trim();
  for (let attempt = 1; attempt <= 2; attempt++) {
    await box.waitFor({ state: 'visible', timeout: 60_000 });
    await dismissPrompts(p);
    await box.click();
    // The editor starts with the file name in it.
    await p.keyboard.press('Meta+A');
    await p.keyboard.press('Backspace');
    // Draft.js ignores synthetic input events but takes a paste whole — newlines, emoji, hashtags.
    await box.evaluate((el, t) => {
      const dt = new DataTransfer();
      dt.setData('text/plain', t);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text.trim());
    await p.waitForTimeout(1000);
    await p.keyboard.press('Escape').catch(() => {}); // a trailing hashtag opens the suggestion list
    const got = (await box.innerText().catch(() => '')).trim();
    if (got.startsWith(first)) return;
    if (attempt === 2) throw new Error(`caption did not take — the box reads "${got.slice(0, 60)}"`);
    await p.waitForTimeout(3000);
  }
}

/**
 * The AI-generated label, set to `on`. A listing video is real footage (the
 * upscale sharpens it, nothing is generated), so it goes out with the label
 * OFF — and Studio may remember the last post's setting, so it is checked
 * either way. No switch on the form means TikTok's default: off.
 */
async function setAigc(p: Page, on: boolean): Promise<void> {
  const more = p.getByText(/^show more$/i).first();
  if (await more.isVisible().catch(() => false)) await more.click();
  const sw = p.locator('[data-e2e="aigc_container"] .Switch__content').first();
  if (!on && !(await sw.isVisible({ timeout: 8000 }).catch(() => false))) return;
  await sw.waitFor({ timeout: 15_000 });
  if (((await sw.getAttribute('aria-checked')) === 'true') !== on) await sw.click();
  // First time on, TikTok explains the label in a dialog.
  if (on) {
    const turnOn = p.locator('.TUXModal-overlay, [role="dialog"]').getByRole('button', { name: /^turn on$/i });
    if (await turnOn.first().isVisible({ timeout: 3000 }).catch(() => false)) await turnOn.first().click();
  }
  await p.waitForTimeout(800);
  if (((await sw.getAttribute('aria-checked')) === 'true') !== on) throw new Error(`the AI-generated label would not switch ${on ? 'on' : 'off'}`);
}

/** A post's id in a Studio API answer: item_id / aweme_id / video_id, 17–20 digits. */
const ID_IN_JSON = /"(?:item_id|aweme_id|video_id|itemId|awemeId)"\s*:\s*"?(\d{17,20})/;

/**
 * Where the post went, best effort: Studio's own answer to the publish call
 * (watched while Post is clicked), else the newest row on Studio's content list
 * whose text carries the ref. Null when neither shows it — tt:stats fills the
 * URL in later by the ref in the caption.
 */
async function postedUrl(p: Page, piece: Piece, seen: Set<string>): Promise<{ url: string; id: string } | null> {
  const id = [...seen][0];
  if (id) return { id, url: `https://www.tiktok.com/@${PAGE}/video/${id}` };
  try {
    if (!/tiktokstudio\/content/.test(p.url())) await p.goto('https://www.tiktok.com/tiktokstudio/content', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    for (let i = 0; i < 8; i++) {
      const hit = await p.evaluate((ref) => {
        for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/video/"]'))) {
          const row = a.closest('[data-tt*="row"], [class*="row"], tr, li') ?? a.parentElement?.parentElement ?? a;
          if ((row.textContent ?? '').includes(ref)) return a.href;
        }
        return null;
      }, piece.key);
      const m = hit?.match(/\/video\/(\d{15,20})/);
      if (m) return { id: m[1]!, url: `https://www.tiktok.com/@${PAGE}/video/${m[1]}` };
      await p.waitForTimeout(5000);
    }
  } catch {
    /* the URL is a nice-to-have; the post is out */
  }
  return null;
}

async function postOne(p: Page, piece: Piece): Promise<{ result: string; url?: string; id?: string }> {
  await openForm(p, piece);
  await p.waitForTimeout(3000);
  await dismissPrompts(p);
  await setCaption(p, piece.caption);
  await dismissPrompts(p);
  await setAigc(p, piece.aigc);
  await dismissPrompts(p);

  const post = p.locator('button[data-e2e="post_video_button"]').or(p.getByRole('button', { name: /^post$/i })).first();
  // Post stays disabled until the upload finishes processing.
  await post.waitFor({ timeout: 120_000 });
  for (let i = 0; i < 60 && (await post.isDisabled().catch(() => true)); i++) await p.waitForTimeout(3000);
  const shot = join(dirname(piece.mp4), `${piece.key}.upload.png`);
  await p.screenshot({ path: shot, fullPage: true });
  if (dry) return { result: `dry run — filled, not posted (${shot})` };

  // Studio's answer to the publish call names the new post: watch for it while Post is clicked.
  const ids = new Set<string>();
  const watch = (res: Response) => {
    const u = res.url();
    if (!/tiktok\.com/.test(u) || !/post|publish|create|project/i.test(u)) return;
    res.text().then((t) => {
      const m = t.match(ID_IN_JSON);
      if (m) ids.add(m[1]!);
    }).catch(() => {});
  };
  p.on('response', watch);
  try {
    const pending = readJson<Record<string, string>>(PENDING, {});
    pending[piece.key] = new Date().toISOString();
    writeFileSync(PENDING, JSON.stringify(pending, null, 2));
    await post.click();
    // A pending copyright/content check asks once more.
    const now = p.getByRole('button', { name: /^post now$/i });
    if (await now.first().isVisible({ timeout: 5000 }).catch(() => false)) await now.first().click();
    await p.waitForURL(/tiktokstudio\/content|\/manage/, { timeout: 180_000 }).catch(async () => {
      if (!(await p.getByText(/(uploaded|posted|being processed)/i).first().isVisible().catch(() => false))) {
        await p.screenshot({ path: shot, fullPage: true });
        throw new Error(`no confirmation after Post (screenshot ${shot})`);
      }
    });
    await p.waitForTimeout(3000);
  } finally {
    p.off('response', watch);
  }
  const where = await postedUrl(p, piece, ids);
  return { result: where ? `posted — ${where.url}` : 'posted (URL not shown yet — tt:stats fills it in)', ...(where ?? {}) };
}

/** The home's TikTokPost row, written without ever stopping the upload. */
async function markRow(piece: Piece, data: Record<string, unknown>): Promise<void> {
  if (!piece.postId || dry) return;
  try {
    const { db } = await import('../../src/lib/db');
    await db.tikTokPost.update({ where: { id: piece.postId }, data });
  } catch (e) {
    console.warn(`  ! TikTokPost ${piece.key}: ${errorText(e).slice(0, 160)}`);
  }
}

/**
 * How many pieces this slot may post. --spread (the Hermes slots since 2026-11-07): its share of
 * the day, slotQuota over the whole queue, rendered or not, less the rejected renders. --upto=<n>:
 * the day is at n once this slot is done. Neither: everything rendered.
 */
function slotCap(pieces: Piece[], done: Record<string, string>, pending: Record<string, string>): { out: number; room: number; total: number } {
  if (flag('spread')) {
    const queue = readJson<{ id: number; code: string | null }[]>(join(DAY, 'queue.json'), []).map((r) => r.code?.trim() || `K${r.id}`);
    const s = dayPieces(queue, existsSync(DAY) ? readdirSync(DAY) : [], done, pending);
    return { out: s.out, room: slotQuota(s.total, s.out, kigaliHour()), total: s.total };
  }
  const out = pieces.filter((x) => done[x.key] || pending[x.key]).length;
  const upto = Number.parseInt(argv('upto'), 10);
  return { out, room: Number.isFinite(upto) ? Math.max(0, upto - out) : Infinity, total: pieces.length };
}

/** --plan: the slot's dry run — which pieces it would post, read from the day's files only. */
function plan(): void {
  const pieces = todaysPieces();
  const done = readJson<Record<string, string>>(UPLOADS, {});
  const pending = readJson<Record<string, string>>(PENDING, {});
  const { out, room, total } = slotCap(pieces, done, pending);
  const due = pieces.filter((x) => !done[x.key] && !pending[x.key]);
  const now = due.slice(0, room === Infinity ? due.length : room);
  const mode = flag('spread') ? `spread, the ${kigaliHour()}:00 slot's share is ${room}` : `upto=${argv('upto') || 'all'}`;
  console.log(`${date}: ${total} in the day, ${pieces.length} rendered, ${out} out already, ${mode} → this slot posts ${now.length}${now.length ? `: ${now.map((x) => x.key).join(', ')}` : ''}; ${Math.max(0, total - out - now.length)} left for later slots`);
}

async function main(): Promise<void> {
  if (flag('plan')) return plan();
  refuseUnattended('uploading to the public TikTok page');
  const pieces = todaysPieces();
  const done = readJson<Record<string, string>>(UPLOADS, {});
  const pending = readJson<Record<string, string>>(PENDING, {});
  // --repost=<key>: Abdout looked at the profile and the piece is not there — post it again.
  const repost = argv('repost');
  if (repost && pending[repost]) {
    delete pending[repost];
    writeFileSync(PENDING, JSON.stringify(pending, null, 2));
  }
  const unsure = pieces.filter((x) => !done[x.key] && pending[x.key] && !flag('force'));
  const ready = pieces.filter((x) => flag('force') || (!done[x.key] && !pending[x.key]));
  const { out, room, total } = slotCap(pieces, done, pending);
  const due = room === Infinity || flag('force') ? ready : ready.slice(0, room);
  // --spread counts the homes that still have to render, too.
  const later = flag('spread') ? Math.max(0, total - out - due.length) : ready.length - due.length;
  if (ready.length && !due.length) return void console.log(`slot quota reached for ${date}: ${out} of ${total} out, ${later} left for the next slots`);
  const unsureLine = (key: string, at: string) => `• ⚠️ ${key}: Post was clicked at ${at.slice(11, 16)} UTC but TikTok never confirmed — look at @${PAGE}; if it is not there: \`pnpm tt:upload --repost=${key}\``;
  const unsureLines = unsure.map((x) => unsureLine(x.key, pending[x.key]!));
  if (!due.length && !unsure.length) {
    if (flag('spread') && total > out) return void console.log(`nothing rendered to post yet for ${date}: ${out} of ${total} out, ${total - out} still to render`);
    return void console.log(pieces.length ? `all ${pieces.length} pieces for ${date} already posted` : `nothing rendered for ${date} — run tt:run`);
  }
  if (!due.length) {
    for (const l of unsureLines) console.warn(l);
    if (flag('notify') && !dry) await postToMkan([`📲 *TikTok @${PAGE}* — nothing re-posted; needs a look:`, ...unsureLines].join('\n'));
    process.exitCode = 77; // needs Abdout: kun's job-run/lanes record it so, and nothing re-runs it
    return;
  }

  const browser = await connect();
  for (const old of browser.contexts()[0]!.pages()) if (old.url().includes('tiktokstudio/upload')) await old.close().catch(() => {});
  const page = await browser.contexts()[0]!.newPage();
  // The vault window can be narrow; Studio hides the post form's side panel below desktop width.
  await page.setViewportSize({ width: 1440, height: 900 });
  const ledger = readJson<Ledger>(LEDGER, {});
  const lines: string[] = [];
  let ok = 0;
  try {
    for (const [i, piece] of due.entries()) {
      // A person doesn't post three videos in the same minute.
      if (i > 0 && !dry) await page.waitForTimeout(90_000 + Math.random() * 120_000);
      try {
        const r = await postOne(page, piece);
        console.log(`  ✅ ${piece.key}: ${r.result}`);
        if (dry) continue;
        ok += 1;
        done[piece.key] = new Date().toISOString();
        writeFileSync(UPLOADS, JSON.stringify(done, null, 2));
        if (pending[piece.key] || readJson<Record<string, string>>(PENDING, {})[piece.key]) {
          const p = readJson<Record<string, string>>(PENDING, {});
          delete p[piece.key];
          writeFileSync(PENDING, JSON.stringify(p, null, 2));
        }
        if (ledger[piece.key]) ledger[piece.key] = { ...ledger[piece.key]!, postedAt: done[piece.key], ...(r.url ? { url: r.url } : {}) };
        await markRow(piece, { status: 'POSTED', postedAt: new Date(done[piece.key]!), reason: null, ...(r.url ? { tiktokUrl: r.url, tiktokId: r.id } : {}) });
        lines.push(`• ${piece.key}${r.url ? ` — ${r.url}` : ''}${piece.aigc ? ' (AI label on)' : ''}`);
      } catch (e) {
        const why = (e as Error).message;
        console.warn(`  ! ${piece.key}: ${why}`);
        lines.push(`• ⚠️ ${piece.key} not posted: ${why.slice(0, 200)}`);
        // Clicked but unconfirmed stays as it was (it may well be up); anything else failed.
        if (!dry && !readJson<Record<string, string>>(PENDING, {})[piece.key]) await markRow(piece, { status: 'FAILED', reason: why.slice(0, 500) });
        else if (!dry) await markRow(piece, { reason: `Post clicked, never confirmed: ${why.slice(0, 400)}` });
      }
    }
  } finally {
    if (!dry) writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
    if (!dry) await page.close().catch(() => {}); // a dry run leaves the filled form open to look at
    await browser.close().catch(() => {}); // detaches; the vault Chrome keeps running
    if (!dry && due.some((x) => x.postId)) await import('../../src/lib/db').then((m) => m.db.$disconnect()).catch(() => {});
  }
  if (dry) return;
  // Clicked but never confirmed — before this run or in it: never re-posted on its own.
  const left = readJson<Record<string, string>>(PENDING, {});
  const unconfirmed = pieces.filter((x) => !done[x.key] && left[x.key]).map((x) => unsureLine(x.key, left[x.key]!));
  // Up to 16 slots a day: a clean --spread slot stays out of #mkan until the day's last home is up.
  const quiet = flag('spread') && ok === due.length && !unconfirmed.length && later > 0;
  if (flag('notify') && !quiet) await postToMkan([`📲 *TikTok @${PAGE}* — ${ok}/${due.length} posted automatically${later ? ` (${later} more later today)` : ''}`, ...lines, ...unconfirmed, `https://www.tiktok.com/@${PAGE}`].join('\n'));
  await recordRun('tiktok-upload', ok === due.length && !unconfirmed.length, `${ok}/${due.length} posted${unconfirmed.length ? `, ${unconfirmed.length} unconfirmed` : ''}`);
  if (unconfirmed.length) process.exitCode = 77; // needs Abdout: a retry could post it twice
  else if (ok < due.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n❌ ${errorText(e)}\n`);
  process.exit(1);
});
