/**
 * TikTok DMs → the rental agent, and back (2026-11-22). No TikTok DM API exists for @mkan.rw, so the web inbox is
 * driven in the logged-in session-vault Chrome (127.0.0.1:9222 — the one tt:upload posts through), in a HIDDEN
 * page that never takes focus (scripts/lib/vault-page.mjs in kun does the same).
 *
 *   pnpm tt:inbox --dry          read the inbox, print what it would answer and send; touch nothing
 *   pnpm tt:inbox                one real pass (the Hermes job `mkan-tiktok-inbox` runs it every 10 min, 07:00–22:00 Kigali)
 *   pnpm tt:inbox --only=<handle>   one chat;  --max=<n>  at most n answers;  --force  ignore the day window and the idle gate
 *
 * A pass: accept the message requests → read every chat that moved in the last day → for each chat with tenant lines
 * newer than our last message (and newer than WaState `tt-seen:<handle>`) wait out a 25 s quiet burst, POST the lines
 * to /api/agent/tiktok (the same brain WhatsApp uses), type the reply (at most two messages) → then type what
 * waits in WaState `tt-outbox` (a broker's answer, a viewing's confirmation, a follow-up: whatsapp.ts sendMessages).
 *
 * Rules (tiktok-inbox-pure.ts): a message of ours that the bot did not type is a person at Mkan — the bot holds that
 * chat 12 h; a chat that opened with our own message is a person's conversation, never the agent's; nothing older
 * than 12 h is answered; the pass does nothing while Abdout is at the keyboard (HID idle < 120 s) and never outside
 * 07:00–22:00 Kigali. Reading is always silent; only acting waits for idle.
 *
 * Env: TIKTOK_INBOX_CDP (default http://127.0.0.1:9222), MKAN_TT_URL (default https://www.mkan.sd), MKAN_TT_SECRET
 * (else MKAN_WA_BRIDGE_SECRET; both also read from the Keychain cf-mkan-<name>), TIKTOK_PAGE_HANDLE (mkan.rw).
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { execFileSync, execSync } from 'node:child_process';
import type { BrowserContext, Page } from 'playwright';
import { chromium } from 'playwright';
import { ownTikTok } from './tiktok-pure';
import {
  chatVerdict,
  drainPlan,
  idleSeconds,
  inDay,
  isBotText,
  markOf,
  mayAct,
  quietLeft,
  splitReply,
  videoIdIn,
  type ChatVerdict,
  type DmMsg,
  type OutRow,
  type SentMark,
} from './tiktok-inbox-pure';
import { cleanHandle, ttDigits, ttPhone, type TtLine } from '../../src/components/agent/tiktok-channel-pure';

const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
const flag = (n: string): boolean => process.argv.includes(`--${n}`);

const dry = flag('dry');
const force = flag('force');
const only = cleanHandle(argv('only'));
const MAX_ANSWERS = Number(argv('max', '20')) || 20;
const CDP = (process.env.TIKTOK_INBOX_CDP ?? '').trim() || 'http://127.0.0.1:9222';
const BASE = (process.env.MKAN_TT_URL ?? '').trim() || 'https://www.mkan.sd';
const OWN = ownTikTok().handle.toLowerCase();
const INBOX_URL = 'https://www.tiktok.com/messages?lang=en';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (a: number, b: number) => a + Math.random() * (b - a);
const log = (m: string) => console.log(`${new Date().toISOString()} ${dry ? '[dry] ' : ''}${m}`);

function keychain(service: string): string {
  try {
    return execSync(`security find-generic-password -s ${service} -w`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}
const secret = (): string =>
  process.env.MKAN_TT_SECRET?.trim() || process.env.MKAN_WA_BRIDGE_SECRET?.trim() || keychain('cf-mkan-MKAN_TT_SECRET') || keychain('cf-mkan-MKAN_WA_BRIDGE_SECRET');

function hidIdle(): number | null {
  try {
    return idleSeconds(execFileSync('ioreg', ['-c', 'IOHIDSystem'], { encoding: 'utf8', timeout: 5_000 }));
  } catch {
    return null;
  }
}

// ── the hidden page ──────────────────────────────────────────────────────────────────────────────

/**
 * A page in the vault Chrome that nobody sees: a HIDDEN target shares the vault's cookies, never shows in the tab
 * strip and takes no focus; focus emulation makes it believe it is visible so it renders and its timers run. The
 * same recipe as kun's scripts/lib/vault-page.mjs quietPage(); falls back to a background tab, never a focused one.
 */
async function quietPage(browser: Awaited<ReturnType<typeof chromium.connectOverCDP>>): Promise<Page> {
  const context = browser.contexts()[0] as BrowserContext;
  let page: Page | null = null;
  if (!process.env.KUN_BROWSER_SHOW) {
    const cdp = await browser.newBrowserCDPSession();
    for (const params of [{ url: 'about:blank', hidden: true }, { url: 'about:blank', background: true }]) {
      try {
        const arriving = context.waitForEvent('page', { timeout: 8_000 });
        await cdp.send('Target.createTarget', params as never);
        page = await arriving;
        break;
      } catch {
        page = null;
      }
    }
  }
  if (!page) page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  try {
    const s = await context.newCDPSession(page);
    await s.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  } catch {
    // Rendering still works without it in a background tab.
  }
  return page;
}

// ── reading the inbox ────────────────────────────────────────────────────────────────────────────

interface Row {
  convId: string;
  name: string;
  preview: string;
  time: string;
}

const ROW = '[data-e2e="dm-new-conversation-item"]';

async function readRows(page: Page): Promise<Row[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((e) => ({
      convId: e.getAttribute('data-conv-id') ?? '',
      name: (e.querySelector('[data-e2e="dm-new-conversation-nickname"]') as HTMLElement | null)?.innerText?.trim() ?? '',
      preview: (e.querySelector('[class*="SpanInfoExtract"]') as HTMLElement | null)?.innerText?.trim() ?? '',
      time: (e.querySelector('[class*="SpanInfoTime"]') as HTMLElement | null)?.innerText?.trim() ?? '',
    }));
  }, ROW);
}

/** The inbox lists the last activity as "18:03" (today) or "11/20/2026"; skip a row last active before yesterday. */
export function recentRow(time: string, now = new Date()): boolean {
  if (/^\d{1,2}:\d{2}$/.test(time)) return true;
  const m = time.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return true; // "Yesterday", a weekday: unknown shape, so look
  const day = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return now.getTime() - day.getTime() < 2 * 86_400_000 + 12 * 3_600_000;
}

interface Chat {
  handle: string | null;
  msgs: DmMsg[];
}

/** The open chat: its @handle and its messages, oldest first. A shared video's id comes from the message's React props. */
async function readChat(page: Page): Promise<Chat> {
  return page.evaluate((own) => {
    const handle = (document.querySelector('[data-e2e="chat-uniqueid"]') as HTMLElement | null)?.innerText?.trim().replace(/^@/, '').toLowerCase() ?? null;
    const list = document.querySelector('[data-e2e="dm-new-message-list"]') as HTMLElement | null;
    const mid = list ? list.getBoundingClientRect().left + list.getBoundingClientRect().width / 2 : 0;
    let prevMine = false;
    const msgs: { id: string; mine: boolean; text: string; videoId: string | null }[] = [];
    for (const el of document.querySelectorAll('[data-e2e="dm-new-message-list"] [data-e2e="dm-new-chat-item"]')) {
      const id = (el.querySelector('[id^="more-action-icon-msg-"]') as HTMLElement | null)?.id.replace('more-action-icon-msg-', '') ?? '';
      if (!id) continue;
      const href = el.querySelector('a[href^="/@"]')?.getAttribute('href')?.toLowerCase() ?? '';
      let mine: boolean;
      if (href) mine = href === `/@${own}`;
      else {
        // No avatar on a run of messages from one sender: by side (ours sit on the right), else the one before.
        const r = (el.querySelector('[data-area="Actions"]') ?? el).getBoundingClientRect();
        mine = r.width > 0 && mid > 0 ? r.left + r.width / 2 > mid + 40 : prevMine;
      }
      prevMine = mine;
      const text = [...el.querySelectorAll('[data-e2e="dm-new-message-text"]')].map((t) => (t as HTMLElement).innerText.trim()).filter(Boolean).join('\n');
      const shared = el.querySelector('[data-e2e="dm-new-shared-video"]');
      const link = el.querySelector('a[href*="/video/"]')?.getAttribute('href') ?? '';
      // A shared video's post id sits in the React props of the card (the DOM shows only the author). No named inner
      // functions here: tsx's esbuild wraps them in a helper that does not exist in the page.
      let videoId: string | null = null;
      const key = shared ? Object.keys(shared).find((k) => k.startsWith('__reactFiber')) : undefined;
      let fiber = key && shared ? ((shared as unknown as Record<string, unknown>)[key] as { memoizedProps?: Record<string, unknown>; return?: unknown } | null) : null;
      for (let i = 0; i < 12 && fiber && !videoId; i++) {
        const v = fiber.memoizedProps?.itemId;
        if (typeof v === 'string' && /^\d{8,25}$/.test(v)) videoId = v;
        fiber = fiber.return as typeof fiber;
      }
      if (!videoId) videoId = link.match(/\/video\/(\d{8,25})/)?.[1] ?? null;
      msgs.push({ id, mine, text, videoId });
    }
    return { handle, msgs };
  }, OWN);
}

/** Open a chat from the list by clicking its PREVIEW (the name can navigate to the profile) and wait for its messages. */
async function openChat(page: Page, convId: string): Promise<Chat | null> {
  const row = page.locator(`${ROW}[data-conv-id="${convId}"]`).first();
  if (!(await row.count())) return null;
  const before = await page.locator('[data-e2e="chat-uniqueid"]').first().innerText({ timeout: 500 }).catch(() => '');
  await row.locator('[class*="SpanInfoExtract"]').first().click({ timeout: 8_000 });
  for (let i = 0; i < 24; i++) {
    await sleep(400);
    const chat = await readChat(page);
    if (chat.handle && chat.msgs.length && (chat.handle !== before.replace(/^@/, '').toLowerCase() || i >= 4)) {
      if (page.url().includes('/@')) {
        // The click went to a profile: back to the inbox, and this chat is skipped this pass.
        await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded' });
        return null;
      }
      return chat;
    }
  }
  return null;
}

/** Message requests: strangers' DMs wait behind a row until Accept. Returns the count seen (dry) or accepted. */
async function messageRequests(page: Page): Promise<{ seen: string | null; accepted: number }> {
  const entry = page.locator(`[data-e2e="dm-new-conversation-list"] :text-matches("^Message requests?$", "i")`).first();
  if (!(await entry.isVisible().catch(() => false))) return { seen: null, accepted: 0 };
  const seen = (await entry.locator('xpath=ancestor::*[self::div or self::li][1]').innerText().catch(() => '')).replace(/\s+/g, ' ').trim() || 'Message requests';
  if (dry) return { seen, accepted: 0 };
  let accepted = 0;
  await entry.click({ timeout: 8_000 }).catch(() => {});
  await sleep(1_500);
  for (let i = 0; i < 20; i++) {
    const row = page.locator(ROW).first();
    if (!(await row.count())) break;
    await row.locator('[class*="SpanInfoExtract"]').first().click({ timeout: 8_000 }).catch(() => {});
    await sleep(1_500);
    const accept = page.getByRole('button', { name: /^accept$/i }).first();
    if (!(await accept.isVisible().catch(() => false))) break;
    await accept.click().catch(() => {});
    accepted += 1;
    await sleep(jitter(1_500, 3_000));
  }
  await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ROW, { timeout: 30_000 }).catch(() => {});
  return { seen, accepted };
}

// ── typing ───────────────────────────────────────────────────────────────────────────────────────

/** Type one message in the open chat, press Enter and wait until it shows as ours. Returns its id, or null when it never appeared. */
async function typeMessage(page: Page, text: string, digits: string, remember: (m: SentMark) => Promise<void>): Promise<string | null> {
  const before = new Set((await readChat(page)).msgs.filter((m) => m.mine).map((m) => m.id));
  const editor = page.locator('[data-e2e="dm-new-input-editor"] [contenteditable="true"], [contenteditable="true"][aria-label^="Send a message"]').first();
  await editor.click({ timeout: 8_000 });
  await page.keyboard.insertText(text);
  await sleep(400);
  // Marked as the bot's own BEFORE it shows, so the next read never takes it for a person typing.
  await remember(markOf(text));
  await page.keyboard.press('Enter');
  for (let i = 0; i < 25; i++) {
    await sleep(500);
    const sent = (await readChat(page)).msgs.find((m) => m.mine && !before.has(m.id) && isBotText(m.text, [markOf(text)]));
    if (sent) return sent.id;
  }
  void digits;
  return null;
}

// ── the pass ─────────────────────────────────────────────────────────────────────────────────────

interface Pending {
  row: Row;
  handle: string;
  verdict: Extract<ChatVerdict, { act: 'answer' }>;
}

async function main(): Promise<void> {
  const now = new Date();
  if (!dry && !force && !inDay(now)) return log('outside 07:00–22:00 Kigali — nothing to do');
  if (!dry && !force) {
    const idle = hidIdle();
    if (!mayAct(idle)) return log(`Abdout is at the keyboard (idle ${idle ?? '?'} s < 120 s) — not acting this pass`);
  }
  const key = secret();
  if (!dry && !key) throw new Error('no MKAN_TT_SECRET or MKAN_WA_BRIDGE_SECRET (env or Keychain cf-mkan-…)');

  const { db } = await import('../../src/lib/db');
  const { mutateState, readState, writeState } = await import('../../src/components/agent/wa-state');
  const { ackOutbox, readOutbox } = await import('../../src/components/agent/tiktok-channel');

  try {
    const up = await fetch(`${CDP}/json/version`, { signal: AbortSignal.timeout(3_000) }).then((r) => r.ok).catch(() => false);
    if (!up) throw new Error(`the session-vault Chrome is not up on ${CDP} — launchctl kickstart gui/$(id -u)/com.databayt.chrome-session`);
    const browser = await chromium.connectOverCDP(CDP, { timeout: 30_000 });
    const page = await quietPage(browser);
    const out = { answered: 0, held: 0, sent: 0, accepted: 0, skipped: 0 };
    try {
      await page.goto(INBOX_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      if (/\/login/.test(page.url())) throw new Error('the vault Chrome is logged out of TikTok — scan the QR at tiktok.com/login with @mkan.rw on the phone');
      await page.waitForSelector(ROW, { timeout: 30_000 });
      await sleep(1_500);

      const req = await messageRequests(page);
      if (req.seen) log(`requests: "${req.seen}"${dry ? ' (would accept them)' : ` — accepted ${req.accepted}`}`);
      out.accepted = req.accepted;

      // What the bot typed, per chat, and who is held: one read each.
      const sentAll = await readState<{ id: string; phone: string; at: string; h?: string }[]>('tenant-sent', []);
      const humanState = await readState<Record<string, string>>('tenant-human', {});
      const marksFor = (digits: string): SentMark[] => sentAll.filter((s) => s.phone === digits && s.h).map((s) => ({ h: s.h!, p: '' }));
      const convs = new Map<string, string>(); // handle → conversation id, for the outbox
      const heldHandles = new Set<string>();
      const busyHandles = new Set<string>();

      const rows = (await readRows(page)).filter((r) => r.convId && recentRow(r.time, now));
      log(`${rows.length} chat(s) active in the last day`);

      const assess = async (row: Row): Promise<{ chat: Chat; handle: string; digits: string; verdict: ChatVerdict; seenId: string | null } | null> => {
        const chat = await openChat(page, row.convId);
        const handle = cleanHandle(chat?.handle);
        if (!chat || !handle) return null;
        const digits = ttDigits(ttPhone(handle));
        convs.set(handle, row.convId);
        const seen = await readState<{ lastId?: string }>(`tt-seen:${handle}`, {});
        const botWasHere =
          marksFor(digits).length > 0 || (await db.agentTask.count({ where: { profile: { waPhone: ttPhone(handle) } } }).catch(() => 0)) > 0;
        const verdict = chatVerdict({ msgs: chat.msgs, sent: marksFor(digits), seenId: seen.lastId ?? null, botWasHere, now: new Date() });
        return { chat, handle, digits, verdict, seenId: seen.lastId ?? null };
      };

      const pending: Pending[] = [];
      for (const row of rows) {
        if (pending.length >= MAX_ANSWERS) break;
        const a = await assess(row).catch((err) => {
          log(`  ! ${row.name}: ${(err as Error).message.split('\n')[0]}`);
          return null;
        });
        if (!a) continue;
        if (only && a.handle !== only) continue;
        const { handle, digits, verdict, chat } = a;
        if (verdict.humanAt && !dry && (!humanState[digits] || Date.parse(humanState[digits]!) < verdict.humanAt.getTime())) {
          // A person at Mkan typed here: the shared hold (the server and the follow-ups read it too).
          await mutateState<Record<string, string>>('tenant-human', {}, (h) => ({ ...h, [digits]: verdict.humanAt!.toISOString() }));
          humanState[digits] = verdict.humanAt.toISOString();
        }
        if (verdict.act === 'skip') {
          if (verdict.why === 'hold' || (verdict.humanAt && Date.now() - verdict.humanAt.getTime() < 12 * 3_600_000)) heldHandles.add(handle);
          if (verdict.why === 'hold') out.held += 1;
          else out.skipped += 1;
          const last = [...chat.msgs].reverse().find((m) => !m.mine && (m.text || m.videoId));
          const lastWords = last ? ` — last from them: ${last.videoId ? `[video ${last.videoId}] ` : ''}${last.text.slice(0, 80).replace(/\n/g, ' ')}` : '';
          log(`  – @${handle}: ${verdict.why}${verdict.humanAt ? ` (a person typed ${verdict.humanAt.toISOString().slice(11, 16)}Z)` : ''}${lastWords}`);
          continue;
        }
        pending.push({ row, handle, verdict });
      }

      for (const p of pending) {
        // A burst waits until the tenant has been quiet 25 s: re-read the chat after each wait (more lines may have come).
        let v = p.verdict;
        for (let tries = 0; tries < 4 && !dry; tries++) {
          const left = quietLeft(v.lines, new Date());
          if (left <= 0) break;
          log(`  … @${p.handle}: waiting ${Math.ceil(left / 1000)} s for the burst to settle`);
          await sleep(left + 500);
          const again = await assess(p.row).catch(() => null);
          if (!again || again.verdict.act !== 'answer') {
            v = null as never;
            break;
          }
          v = again.verdict;
        }
        if (!v) continue;
        const lines: TtLine[] = v.lines.map((l) => ({ id: l.id, text: l.text, at: l.sentAt.toISOString(), videoId: v.videos[l.id] ?? null }));
        const shown = lines.map((l) => `${l.videoId ? `[video ${l.videoId}] ` : ''}${l.text}`.trim()).join(' / ');
        if (dry) {
          log(`  → would answer @${p.handle} (${lines.length} line${lines.length === 1 ? '' : 's'}): ${shown.slice(0, 200)}`);
          out.answered += 1;
          continue;
        }
        if (!mayAct(hidIdle()) && !force) {
          log('Abdout is back at the keyboard — stopping before the next reply');
          break;
        }
        const digits = ttDigits(ttPhone(p.handle));
        const res = await post({ handle: p.handle, lines }, key);
        if (!res) {
          busyHandles.add(p.handle);
          continue;
        }
        if (res.reply) {
          const open = await openChat(page, p.row.convId);
          if (!open) {
            log(`  ! @${p.handle}: chat did not reopen — reply left held on the server`);
            busyHandles.add(p.handle);
            continue;
          }
          const remember = async (m: SentMark) => {
            const entry = { id: `tt-typed-${Date.now()}`, phone: digits, at: new Date().toISOString(), h: m.h };
            await mutateState('tenant-sent', [] as unknown[], (s) => [...s, entry].slice(-2000));
          };
          let typed = 0;
          for (const part of splitReply(res.reply)) {
            const id = await typeMessage(page, part, digits, remember);
            if (!id) break;
            typed += 1;
            await sleep(jitter(1_500, 4_000));
          }
          if (typed === 0) {
            log(`  ! @${p.handle}: the reply did not appear in the chat — left held, will retry`);
            busyHandles.add(p.handle);
            continue;
          }
          await post({ handle: p.handle, ack: res.ackId ? [res.ackId] : [], text: res.reply }, key);
          log(`  ✓ @${p.handle}: answered (${typed} message${typed === 1 ? '' : 's'}, ${res.reply.length} chars)`);
          out.answered += 1;
        } else {
          log(`  – @${p.handle}: no reply (${res.why ?? 'none'})`);
          if (res.why === 'busy' || res.why === 'held' || res.why === 'error') {
            busyHandles.add(p.handle);
            continue;
          }
        }
        // Handled (answered, or deliberately not): the newest line is not read again.
        await writeState(`tt-seen:${p.handle}`, { lastId: p.verdict.newest, at: new Date().toISOString(), conv: p.row.convId });
        await sleep(jitter(2_000, 5_000));
      }

      // The queue: what the agent wants these tenants to hear later.
      const queued = await readOutbox();
      for (const [h] of convs) {
        const digits = ttDigits(ttPhone(h));
        if (humanState[digits] && Date.now() - Date.parse(humanState[digits]!) < 12 * 3_600_000) heldHandles.add(h);
      }
      const plan = drainPlan(queued as OutRow[], { now: new Date(), held: heldHandles, busy: busyHandles });
      if (queued.length) log(`outbox: ${queued.length} queued — ${plan.send.length} to send, ${plan.wait.length} waiting, ${plan.drop.length} stale`);
      if (!dry && plan.drop.length) await ackOutbox(plan.drop.map((r) => r.id));
      let lastHandle = '';
      for (const r of plan.send) {
        const digits = ttDigits(ttPhone(r.handle));
        const convId = convs.get(r.handle) ?? (await readState<{ conv?: string }>(`tt-seen:${r.handle}`, {})).conv;
        if (dry) {
          log(`  → would send @${r.handle} [${r.label}]: ${r.text.slice(0, 160).replace(/\n/g, ' ')}`);
          continue;
        }
        if (!convId) {
          log(`  ! @${r.handle}: no conversation known — left queued`);
          continue;
        }
        if (!mayAct(hidIdle()) && !force) {
          log('Abdout is back at the keyboard — stopping the outbox');
          break;
        }
        if (lastHandle !== r.handle) {
          const open = await openChat(page, convId);
          if (!open) {
            log(`  ! @${r.handle}: chat not in the inbox list — left queued`);
            continue;
          }
          lastHandle = r.handle;
        }
        const remember = async (m: SentMark) => {
          const entry = { id: `tt-typed-${Date.now()}`, phone: digits, at: new Date().toISOString(), h: m.h };
          await mutateState('tenant-sent', [] as unknown[], (s) => [...s, entry].slice(-2000));
        };
        let ok = true;
        for (const part of splitReply(r.text)) {
          if (!(await typeMessage(page, part, digits, remember))) ok = false;
          if (!ok) break;
          await sleep(jitter(1_500, 4_000));
        }
        if (ok) {
          await ackOutbox([r.id]);
          out.sent += 1;
          log(`  ✓ @${r.handle}: sent [${r.label}]`);
        } else log(`  ! @${r.handle}: [${r.label}] did not appear — left queued`);
        await sleep(jitter(3_000, 8_000));
      }
    } finally {
      await page.close().catch(() => {});
      await browser.close().catch(() => {});
    }
    log(JSON.stringify(out));
    if (!dry) await writeState('tt-inbox:last', { at: new Date().toISOString(), ...out }).catch(() => {});
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

/** POST to the agent; null on a transport error or a non-2xx (the lines are tried again next pass). */
async function post(body: unknown, key: string): Promise<{ reply: string | null; why?: string; ackId?: string } | null> {
  try {
    const res = await fetch(`${BASE}/api/agent/tiktok`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mkan-tt-secret': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000),
    });
    if (!res.ok) {
      log(`  ! agent answered HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as { reply: string | null; why?: string; ackId?: string };
  } catch (err) {
    log(`  ! agent not reached: ${(err as Error).message}`);
    return null;
  }
}

if (process.argv[1] && /tiktok-inbox\.ts$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(`✗ ${(err as Error).message}`);
    process.exit(1);
  });
}
