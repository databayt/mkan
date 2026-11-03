/**
 * Posts the day's rendered TikTok pieces to @mkan.rw — no phone step.
 *
 *   pnpm tt:upload [--date=YYYY-MM-DD] [--dry] [--notify]
 *   pnpm tt:upload --file=<mp4> --caption=<txt> [--aigc] [--dry]   one ad-hoc video
 *
 * Drives TikTok Studio's web upload (tiktok.com/tiktokstudio/upload) in the
 * session-vault Chrome on 127.0.0.1:9222 — Abdout's own signed-in browser, so
 * the post comes from a real session, not a headless bot. TikTok's Content
 * Posting API stays private until an app audit passes (kun#168); switch this
 * file to the API then.
 *
 * What goes out each day (tt:run made it at 07:00):
 *   - each queued home: <date>/<ref>.mp4 + <ref>.txt (a consented broker's footage, AI-upscaled, on mkan's AI track → AI label on)
 *   - the picture video: <date>/carousel/video.mp4 + video-caption.txt (mkan's AI track → AI label on)
 *   - the same slides as a photo post: <date>/carousel/<n>.jpg + caption.txt, through Studio's
 *     Photos tab (swipeable, up to 35; no AI voice, so no label). TIKTOK_PHOTO_POSTS=off skips it.
 * A per-day `uploads.json` keeps a rerun from posting twice. A posted home is
 * stamped in posted.json, so it rests 30 days like a hand-posted one.
 *
 * --dry fills everything (file, caption, label) and stops before Post, saving a
 * screenshot next to the video. Env: TIKTOK_UPLOAD_CDP (default http://127.0.0.1:9222).
 */
import { config } from 'dotenv';
config({ override: true });

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { postToMkan, recordRun } from './notify';
import { errorText, photoTitle, type Ledger } from './tiktok-post-pure';
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
// (the 13:00 retry, or kun's supervisor re-running the day's post). Cleared on confirmation, or by hand.
const PENDING = join(DAY, 'pending.json');
const CDP = (process.env.TIKTOK_UPLOAD_CDP ?? '').trim() || 'http://127.0.0.1:9222';
const PAGE = ownTikTok().handle;
const UPLOAD_URL = 'https://www.tiktok.com/tiktokstudio/upload?lang=en';
/** Studio's web upload takes photo posts on its Photos tab (checked 2026-11-01: jpg/png/webp, up to 35). */
const PHOTO_POSTS = (process.env.TIKTOK_PHOTO_POSTS ?? '').trim().toLowerCase() !== 'off';
const dry = flag('dry');

interface Piece {
  key: string; // ref for a home, `datavideo` for the voiced carousel, `slides` for its photo post
  mp4: string; // the video, or a photo post's first slide
  /** A photo post's slides, in order. */
  photos?: string[];
  caption: string;
  aigc: boolean;
}

const readJson = <T>(p: string, d: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : d);

function todaysPieces(): Piece[] {
  const file = argv('file');
  // preview/ holds renders made for a look or a broker's ask (any listing, consent or not): never posted.
  if (file && /[\\/]preview[\\/]/.test(file)) throw new Error(`${file} is a preview render — previews are never posted`);
  if (file) return [{ key: basename(file, '.mp4'), mp4: file, caption: readFileSync(argv('caption'), 'utf8'), aigc: flag('aigc') }];
  const out: Piece[] = [];
  const queue = readJson<{ id: number; code: string | null }[]>(join(DAY, 'queue.json'), []);
  for (const r of queue) {
    const ref = r.code?.trim() || `K${r.id}`;
    const mp4 = join(DAY, `${ref}.mp4`);
    if (existsSync(mp4) && existsSync(join(DAY, `${ref}.txt`))) out.push({ key: ref, mp4, caption: readFileSync(join(DAY, `${ref}.txt`), 'utf8'), aigc: true });
  }
  const dv = join(DAY, 'carousel', 'video.mp4');
  if (existsSync(dv)) out.push({ key: 'datavideo', mp4: dv, caption: readFileSync(join(DAY, 'carousel', 'video-caption.txt'), 'utf8'), aigc: true });
  // The slides themselves as a swipeable photo post — what a tenant scrolls past as "slides".
  const dir = join(DAY, 'carousel');
  const slides = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.jpg$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).map((f) => join(dir, f)) : [];
  if (PHOTO_POSTS && slides.length >= 2 && existsSync(join(dir, 'caption.txt'))) out.push({ key: 'slides', mp4: slides[0]!, photos: slides.slice(0, 35), caption: readFileSync(join(dir, 'caption.txt'), 'utf8'), aigc: false });
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

async function setCaption(p: Page, text: string): Promise<void> {
  const box = p.locator('.public-DraftEditor-content, div[contenteditable="true"]').first();
  await box.waitFor({ timeout: 60_000 });
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
  const got = (await box.innerText()).trim();
  const first = text.trim().split('\n')[0]!.trim();
  if (!got.startsWith(first)) throw new Error(`caption did not take — the box reads "${got.slice(0, 60)}"`);
}

async function setAigc(p: Page): Promise<void> {
  const more = p.getByText(/^show more$/i).first();
  if (await more.isVisible().catch(() => false)) await more.click();
  const sw = p.locator('[data-e2e="aigc_container"] .Switch__content').first();
  await sw.waitFor({ timeout: 15_000 });
  if ((await sw.getAttribute('aria-checked')) !== 'true') await sw.click();
  // First time on, TikTok explains the label in a dialog.
  const turnOn = p.locator('.TUXModal-overlay, [role="dialog"]').getByRole('button', { name: /^turn on$/i });
  if (await turnOn.first().isVisible({ timeout: 3000 }).catch(() => false)) await turnOn.first().click();
  await p.waitForTimeout(800);
  if ((await sw.getAttribute('aria-checked')) !== 'true') throw new Error('the AI-generated label would not switch on — not posting an unlabelled AI voice');
}

/**
 * Every slide up before Post. Studio wakes Post while photos are still uploading (11-01 dry
 * runs: 3 of 7, then 6 of 7 with one failed), and a failed slide shows a retry arrow over
 * it — tapped up to three times. A partial set is never posted: the run says so, and the
 * 13:00 retry tries the day again.
 */
async function waitForPhotos(p: Page, n: number, waitMs = 8 * 60_000): Promise<void> {
  const done = p.getByText(new RegExp(`\\b${n} photos? uploaded`, 'i')).first();
  const failed = p.locator('[class*="errorOverlay"]');
  let retries = 0;
  for (const end = Date.now() + waitMs; Date.now() < end; ) {
    if (await done.isVisible().catch(() => false)) return;
    if (retries < 3 && (await failed.count().catch(() => 0)) > 0) {
      retries += 1;
      await failed.first().click().catch(() => {});
    }
    await p.waitForTimeout(3000);
  }
  const got = (await p.getByText(/photos? uploaded/i).first().textContent().catch(() => ''))?.match(/\d+/)?.[0] ?? 'some';
  throw new Error(`only ${got} of ${n} photos uploaded after ${Math.round(waitMs / 60_000)} min${retries ? ` (${retries} retried)` : ''} — not posting a partial set`);
}

async function postOne(p: Page, piece: Piece): Promise<string> {
  await p.goto(piece.photos ? `${UPLOAD_URL}&tab=photo` : UPLOAD_URL, { waitUntil: 'domcontentloaded' });
  if (/\/login/.test(p.url()) || (await p.locator('input[type=file]').count().catch(() => 0)) === 0) {
    await p.waitForTimeout(6000);
    if (/\/login/.test(p.url())) throw new Error(`the vault Chrome is logged out of TikTok — scan the QR at ${UPLOAD_URL} with @${PAGE} on the phone`);
  }
  await discardDraft(p);
  if (piece.photos) {
    // The Photos tab swaps the file input for one that takes images, several at once.
    const images = p.locator('input[type=file][accept*="image"]');
    if ((await images.count().catch(() => 0)) === 0) {
      await p.getByText('Photos', { exact: true }).first().click({ timeout: 15_000 });
      await images.first().waitFor({ state: 'attached', timeout: 15_000 });
    }
    await images.first().setInputFiles(piece.photos);
  } else {
    await p.locator('input[type=file]').first().setInputFiles(piece.mp4);
  }
  await p.locator('.public-DraftEditor-content, div[contenteditable="true"]').first().waitFor({ timeout: 60_000 });
  await p.waitForTimeout(3000);
  await dismissPrompts(p);
  await setCaption(p, piece.caption);
  await dismissPrompts(p);
  if (piece.photos) {
    // A photo post has a title line of its own (90 characters): the caption's first line.
    const title = p.getByPlaceholder(/catchy title/i).first();
    if (await title.isVisible().catch(() => false)) await title.fill(photoTitle(piece.caption)).catch(() => {});
  }
  if (piece.aigc) await setAigc(p);
  await dismissPrompts(p);
  if (piece.photos) await waitForPhotos(p, piece.photos.length);

  const post = p.locator('button[data-e2e="post_video_button"]').or(p.getByRole('button', { name: /^post$/i })).first();
  // Post stays disabled until the upload finishes processing.
  await post.waitFor({ timeout: 120_000 });
  for (let i = 0; i < 60 && (await post.isDisabled().catch(() => true)); i++) await p.waitForTimeout(3000);
  const shot = join(dirname(piece.mp4), `${piece.key}.upload.png`);
  await p.screenshot({ path: shot, fullPage: true });
  if (dry) return `dry run — filled, not posted (${shot})`;

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
  return 'posted';
}

async function main(): Promise<void> {
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
  const due = pieces.filter((x) => flag('force') || (!done[x.key] && !pending[x.key]));
  const unsureLine = (key: string, at: string) => `• ⚠️ ${key}: Post was clicked at ${at.slice(11, 16)} UTC but TikTok never confirmed — look at @${PAGE}; if it is not there: \`pnpm tt:upload --repost=${key}\``;
  const unsureLines = unsure.map((x) => unsureLine(x.key, pending[x.key]!));
  if (!due.length && !unsure.length) return void console.log(pieces.length ? `all ${pieces.length} pieces for ${date} already posted` : `nothing rendered for ${date} — run tt:run`);
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
        console.log(`  ✅ ${piece.key}: ${r}`);
        if (dry) continue;
        ok += 1;
        done[piece.key] = new Date().toISOString();
        writeFileSync(UPLOADS, JSON.stringify(done, null, 2));
        if (pending[piece.key] || readJson<Record<string, string>>(PENDING, {})[piece.key]) {
          const p = readJson<Record<string, string>>(PENDING, {});
          delete p[piece.key];
          writeFileSync(PENDING, JSON.stringify(p, null, 2));
        }
        if (ledger[piece.key]) ledger[piece.key] = { ...ledger[piece.key]!, postedAt: done[piece.key] };
        lines.push(`• ${piece.key}${piece.photos ? ` (${piece.photos.length} photos)` : ''}${piece.aigc ? ' (AI voice, labelled)' : ''}`);
      } catch (e) {
        console.warn(`  ! ${piece.key}: ${(e as Error).message}`);
        lines.push(`• ⚠️ ${piece.key} not posted: ${(e as Error).message.slice(0, 200)}`);
      }
    }
  } finally {
    if (!dry) writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
    if (!dry) await page.close().catch(() => {}); // a dry run leaves the filled form open to look at
    await browser.close().catch(() => {}); // detaches; the vault Chrome keeps running
  }
  if (dry) return;
  // Clicked but never confirmed — before this run or in it: never re-posted on its own.
  const left = readJson<Record<string, string>>(PENDING, {});
  const unconfirmed = pieces.filter((x) => !done[x.key] && left[x.key]).map((x) => unsureLine(x.key, left[x.key]!));
  if (flag('notify')) await postToMkan([`📲 *TikTok @${PAGE}* — ${ok}/${due.length} posted automatically`, ...lines, ...unconfirmed, `https://www.tiktok.com/@${PAGE}`].join('\n'));
  await recordRun('tiktok-upload', ok === due.length && !unconfirmed.length, `${ok}/${due.length} posted${unconfirmed.length ? `, ${unconfirmed.length} unconfirmed` : ''}`);
  if (unconfirmed.length) process.exitCode = 77; // needs Abdout: a retry could post it twice
  else if (ok < due.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`\n❌ ${errorText(e)}\n`);
  process.exit(1);
});
