/**
 * The Slack `#mkan` intake lane — the hands.
 *
 *   pnpm home:sweep   [--apply] [--limit=N] [--since=<unix>]   read #mkan since the cursor, act on every new message
 *   pnpm home:extract --text="…" | --ts=<slack ts>            read one message, print the JSON, write nothing
 *   pnpm home:intake  --ts=<slack ts> [--apply]                one channel message → host + home records + thread reply
 *   pnpm home:update  --code=0005-01 --text="…" [--apply]      merge more words into one home
 *   pnpm home:status                                           what this lane has seeded, and where each home stands
 *
 * Hermes hears every message in #mkan and runs `home:sweep --apply`; a launchd
 * timer runs the same sweep every two minutes as the second ear. All replies are
 * posted by this script as the `kun` bot — Hermes answers [SILENT].
 *
 * Reader: `claude -p` on the Max plan (no API key, no per-message cost) under the
 * frozen prompt in ./home-intake-prompt.ts; every record keeps the version that
 * read it. Documented at kun.databayt.org/docs/home.
 *
 * Dry run is the default. `--apply` writes Twenty + Slack. Nothing here touches
 * the site — going live is `home:publish`, a separate, human-triggered word.
 */
import { config } from 'dotenv';
config({ override: true });

import { execSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { twentyClient, phoneOf, fromMicros, type Phones, type Currency } from './twenty-rest';
import { INTAKE_PROMPT_VERSION, buildIntakePrompt, type ReadMode, type Vocab } from './home-intake-prompt';
import {
  buildReply,
  completenessPct,
  enforceVocab,
  isEligible,
  mustGaps,
  nextListingCode,
  nextManualAccount,
  normalizeSudanPhone,
  parseIntakeResult,
  parseLiveCommand,
  phonesComposite,
  phonesInText,
  saysPriceConfirmed,
  toAsciiDigits,
  type HomeFacts,
  type IntakeResult,
  type Unit,
} from './home-intake-pure';

// ── argv ─────────────────────────────────────────────────────────────────────
const trim = (v: string | null | undefined): string => (v ?? '').trim();
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const flag = (n: string): boolean => process.argv.includes(`--${n}`);
const APPLY = flag('apply');
const cmd = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'help';

// ── credentials (env first, Keychain second — the mastering precedent) ───────
if (!trim(process.env.TWENTY_API_URL)) process.env.TWENTY_API_URL = 'http://localhost:3100';
if (!trim(process.env.TWENTY_API_KEY)) {
  try {
    process.env.TWENTY_API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* twentyClient() will say what is missing */
  }
}
let cachedSlackToken: string | null = null;
function slackToken(): string {
  if (cachedSlackToken != null) return cachedSlackToken;
  cachedSlackToken = trim(process.env.SLACK_BOT_TOKEN);
  if (!cachedSlackToken) {
    try {
      cachedSlackToken = execSync('security find-generic-password -s databayt -a SLACK_BOT_TOKEN -w', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      cachedSlackToken = '';
    }
  }
  if (!cachedSlackToken) {
    try {
      const line = readFileSync(join(homedir(), '.hermes/.env'), 'utf8').split('\n').find((l) => l.startsWith('SLACK_BOT_TOKEN='));
      cachedSlackToken = trim(line?.split('=').slice(1).join('=')).replace(/^["']|["']$/g, '');
    } catch {
      cachedSlackToken = '';
    }
  }
  if (!cachedSlackToken) throw new Error('no Slack bot token: SLACK_BOT_TOKEN env, Keychain databayt/SLACK_BOT_TOKEN, or ~/.hermes/.env');
  return cachedSlackToken;
}
const CHANNEL = trim(process.env.SLACK_HOME_CHANNEL) || 'C0BS2NZE2AY'; // private #mkan
const TWENTY_UI = (trim(process.env.TWENTY_UI_URL) || 'https://mkan.databayt.org').replace(/\/+$/, '');
const READER_MODEL = trim(process.env.HOME_INTAKE_MODEL) || 'claude-sonnet-5';

// ── Slack (direct Web API, same bot Hermes uses) ─────────────────────────────
interface SlackMsg {
  ts: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
  thread_ts?: string;
  reply_count?: number;
  files?: { id: string; name?: string; mimetype?: string; url_private_download?: string }[];
}
async function slackGet<T>(method: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://slack.com/api/${method}?${qs}`, { headers: { Authorization: `Bearer ${slackToken()}` } });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; needed?: string } & T;
  if (!json.ok) throw new Error(`slack ${method} → ${json.error ?? res.status}${json.needed ? ` (needs ${json.needed})` : ''}`);
  return json;
}
async function slackPostApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${slackToken()}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!json.ok) throw new Error(`slack ${method} → ${json.error ?? res.status}`);
  return json;
}
let cachedBotId: string | null = null;
async function botUserId(): Promise<string> {
  if (cachedBotId) return cachedBotId;
  const me = await slackGet<{ user_id: string }>('auth.test', {});
  cachedBotId = me.user_id;
  return cachedBotId;
}
async function permalink(ts: string): Promise<string> {
  try {
    const r = await slackGet<{ permalink: string }>('chat.getPermalink', { channel: CHANNEL, message_ts: ts });
    return r.permalink;
  } catch {
    return '';
  }
}
async function reply(threadTs: string, text: string): Promise<void> {
  if (!APPLY) {
    console.log(`\n── would reply in thread ${threadTs} ──\n${text}\n`);
    return;
  }
  await slackPostApi('chat.postMessage', { channel: CHANNEL, thread_ts: threadTs, text, unfurl_links: false, unfurl_media: false });
}
/** Slack's mrkdwn escapes → the words as typed. */
function plainText(t: string | undefined): string {
  return (t ?? '')
    .replace(/<(https?:[^|>]+)(?:\|[^>]*)?>/g, '$1')
    .replace(/<@[A-Z0-9]+>/g, '')
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, '#$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}
function isHuman(m: SlackMsg, bot: string): boolean {
  if (!m.user || m.user === bot || m.bot_id) return false;
  if (m.subtype && m.subtype !== 'file_share' && m.subtype !== 'thread_broadcast') return false;
  return true;
}
async function messageByTs(ts: string): Promise<SlackMsg | null> {
  const r = await slackGet<{ messages: SlackMsg[] }>('conversations.history', { channel: CHANNEL, latest: ts, oldest: ts, inclusive: 'true', limit: '1' });
  return r.messages?.[0] ?? null;
}

// ── state + corpus (gitignored .data) ────────────────────────────────────────
const DATA_DIR = join(dirname(new URL(import.meta.url).pathname), '.data', 'home-intake');
const STATE_FILE = join(DATA_DIR, 'state.json');
interface PendingUnit {
  index: number;
  unit: Unit;
  result: IntakeResult;
  hostPhone: string | null;
  hostName: string | null;
  suspectCode: string | null;
  suspectId: string | null;
  text: string;
  link: string;
}
interface ThreadState {
  ts: string;
  codes: string[];
  homeIds: string[];
  hostId: string | null;
  account: string | null;
  lastReplyTs: string;
  createdAt: string;
  /** Units the reader understood but did not create — they looked like homes the host already has. */
  pending?: PendingUnit[];
}
interface State {
  cursor: string | null; // newest top-level ts already processed
  handled: string[];
  threads: Record<string, ThreadState>;
}
const LOCK_FILE = join(DATA_DIR, 'sweep.lock');
const LOCK_STALE_MS = 5 * 60 * 1000;
/** Two ears, one brain: Hermes and the launchd timer both call sweep — only one may run at a time. */
function acquireLock(): boolean {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(LOCK_FILE)) {
    const age = Date.now() - Number(readFileSync(LOCK_FILE, 'utf8') || 0);
    if (age < LOCK_STALE_MS) return false;
  }
  writeFileSync(LOCK_FILE, String(Date.now()));
  return true;
}
function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) writeFileSync(LOCK_FILE, '0');
  } catch {
    /* nothing to do */
  }
}
function loadState(): State {
  if (!existsSync(STATE_FILE)) return { cursor: null, handled: [], threads: {} };
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State;
}
function saveState(s: State): void {
  if (!APPLY) return; // a dry run never moves the cursor
  mkdirSync(DATA_DIR, { recursive: true });
  s.handled = s.handled.slice(-2000);
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function appendJsonl(name: string, row: unknown): void {
  if (!APPLY) return;
  mkdirSync(DATA_DIR, { recursive: true });
  appendFileSync(join(DATA_DIR, name), JSON.stringify(row) + '\n');
}

// ── the reader (claude -p on the Max plan) ───────────────────────────────────
/** The claude CLI, wherever this process was started from (launchd and the Hermes gateway carry a bare PATH). */
function claudeBin(): string {
  const candidates = [trim(process.env.CLAUDE_BIN), join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return 'claude';
}
function runReader(prompt: string, attempt = 0): IntakeResult {
  const started = Date.now();
  const proc = spawnSync(
    claudeBin(),
    ['-p', '--no-session-persistence', '--model', READER_MODEL, '--output-format', 'json', '--disallowedTools', 'Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'NotebookEdit'],
    {
      input: prompt,
      encoding: 'utf8',
      timeout: 150_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PATH: `${join(homedir(), '.local/bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}`, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
    },
  );
  if (proc.error) throw new Error(`reader could not start (is the claude CLI installed?): ${proc.error.message}`);
  let envelope: { is_error?: boolean; result?: string; subtype?: string } = {};
  try {
    envelope = JSON.parse(proc.stdout || '{}');
  } catch {
    throw new Error(`reader returned non-JSON: ${(proc.stdout || proc.stderr).slice(0, 200)}`);
  }
  if (envelope.is_error) throw new Error(`reader error: ${envelope.result ?? envelope.subtype ?? 'unknown'}`);
  const text = envelope.result ?? '';
  try {
    const parsed = parseIntakeResult(text);
    console.log(`  reader ${INTAKE_PROMPT_VERSION}/${READER_MODEL} · ${((Date.now() - started) / 1000).toFixed(1)}s · kind=${parsed.kind} units=${parsed.units.length}`);
    return parsed;
  } catch (e) {
    if (attempt >= 1) throw e;
    console.warn(`  ! reader output rejected (${(e as Error).message.slice(0, 120)}) — asking once more`);
    return runReader(`${prompt}\n\nYour previous answer was rejected: ${(e as Error).message}. Return ONLY the JSON object.`, attempt + 1);
  }
}

// ── Twenty ───────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const client = twentyClient();
async function vocab(): Promise<Vocab> {
  const res = (await client.rest('GET', 'metadata/objects')) as { data?: unknown };
  const data = res.data ?? res;
  const list: Row[] = Array.isArray(data) ? data : ((data as Row).objects as Row[]) ?? Object.values(data as Row);
  const home = list.find((o) => o.nameSingular === 'home');
  if (!home) throw new Error('no `home` object in this workspace — is TWENTY_API_KEY the mkan key?');
  const fields = (home.fields as Row[]) ?? [];
  const opts = (name: string): string[] =>
    (((fields.find((f) => f.name === name)?.options as Row[]) ?? []).map((o) => o.value as string));
  return { zones: opts('zone'), cities: opts('city'), propertyTypes: opts('propertyType'), amenities: opts('amenities'), highlights: opts('highlights') };
}
const linkOne = (url: string | null | undefined, label = '') => (url ? { primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] } : undefined);
const currency = (amount: number | null | undefined) => (amount != null ? { amountMicros: Math.round(amount * 1_000_000), currencyCode: 'SDG' } : undefined);
const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
const createdId = (res: unknown): string => {
  const d = (res as { data?: Row })?.data ?? (res as Row);
  const rec = (d as Row)?.createHome ?? (d as Row)?.createHost ?? (d as Row)?.createNote ?? (d as Row)?.createNoteTarget ?? d;
  return String((rec as Row)?.id ?? '');
};
function latLngFrom(url: string | null): { lat: number; lng: number } | null {
  if (!url) return null;
  const m = /[@?&](?:q=)?(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(url);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}
function factsFromUnit(u: Unit, r: IntakeResult, hostPhone: string | null, extra: Partial<HomeFacts> = {}): HomeFacts {
  const pin = latLngFrom(r.area.mapsUrl);
  return {
    titleAr: u.titleAr,
    descriptionAr: u.descriptionAr,
    propertyType: u.propertyType,
    bedrooms: u.bedrooms,
    bathrooms: u.bathrooms,
    beds: u.beds,
    guestCapacity: u.guestCapacity,
    priceNightSdg: u.priceNightSdg,
    priceConfirmed: u.priceConfirmed,
    zone: r.area.zone,
    mapsUrl: r.area.mapsUrl,
    latitude: pin?.lat ?? null,
    longitude: pin?.lng ?? null,
    hostPhone,
    amenities: u.amenities,
    rawWords: u.rawWords,
    photoCount: 0,
    ...extra,
  };
}
/** The site URL when the CRM says this home is already live there. */
function liveUrlOf(h: Row): string | null {
  const live = h.publishState === 'LIVE' || h.mkanPublishState === 'LIVE';
  if (!live) return null;
  const link = ((h.mkanListingUrl as Row | null)?.primaryLinkUrl as string | null) ?? ((h.listingUrl as Row | null)?.primaryLinkUrl as string | null);
  return link ?? (h.listingId ? `https://mkan.sd/ar/listings/${h.listingId}` : null);
}
/** What Twenty holds for a home → the facts shape the level is judged on. */
function factsFromRow(h: Row): HomeFacts {
  const addr = (h.homeAddress as Row | null) ?? null;
  const price = fromMicros(h.priceNightSdg as Currency | null);
  const amenities = Array.isArray(h.amenities) ? (h.amenities as string[]) : [];
  const raw = Array.isArray(h.amenitiesRaw) ? (h.amenitiesRaw as string[]) : [];
  return {
    titleAr: (h.titleAr as string | null) || (h.name as string | null) || null,
    descriptionAr: (h.descriptionAr as string | null) || (h.description as string | null) || null,
    propertyType: (h.propertyType as string | null) ?? null,
    bedrooms: (h.bedrooms as number | null) ?? null,
    bathrooms: (h.bathrooms as number | null) ?? null,
    beds: (h.beds as number | null) ?? null,
    guestCapacity: (h.guestCapacity as number | null) ?? null,
    priceNightSdg: price,
    priceConfirmed: Boolean(h.priceConfirmedByHost),
    zone: (h.zone as string | null) ?? null,
    mapsUrl: ((h.googleMapsUrl as Row | null)?.primaryLinkUrl as string | null) ?? null,
    latitude: (addr?.addressLat as number | null) ?? null,
    longitude: (addr?.addressLng as number | null) ?? null,
    hostPhone: phoneOf(h.hostPhone as Phones | null),
    amenities,
    rawWords: raw,
    photoCount: (h.photoCount as number | null) ?? 0,
  };
}
function homeBody(f: HomeFacts, r: IntakeResult, u: Unit, code: string, account: string, hostId: string | null, hostName: string | null): Row {
  const pin = latLngFrom(r.area.mapsUrl);
  const addressText = r.area.addressText;
  return clean({
    name: f.titleAr ?? `${code}${hostName ? ` · ${hostName}` : ''}`,
    titleAr: f.titleAr,
    descriptionAr: f.descriptionAr,
    account,
    listingId: code,
    hostId: hostId ?? undefined,
    hostName,
    hostPhone: phonesComposite(f.hostPhone),
    hostWhatsapp: phonesComposite(r.host.whatsapp),
    bedrooms: f.bedrooms,
    bathrooms: f.bathrooms,
    beds: f.beds,
    guestCapacity: f.guestCapacity,
    priceNightSdg: currency(f.priceNightSdg),
    priceConfirmedByHost: f.priceConfirmed,
    propertyType: f.propertyType,
    mkanPropertyType: f.propertyType,
    zone: f.zone,
    city: r.area.city ?? (f.zone ? 'PORT_SUDAN' : undefined),
    country: 'SUDAN',
    googleMapsUrl: linkOne(f.mapsUrl, 'Google Maps'),
    homeAddress:
      addressText || pin
        ? clean({ addressStreet1: addressText ?? undefined, addressCity: 'Port Sudan', addressState: 'Red Sea', addressCountry: 'Sudan', addressLat: pin?.lat, addressLng: pin?.lng })
        : undefined,
    amenities: f.amenities,
    highlights: u.highlights,
    amenitiesRaw: f.rawWords.length ? f.rawWords : undefined,
    notesAr: [u.priceNote, r.leftover].filter(Boolean).join('\n') || undefined,
    source: 'FIELD_SCOUT',
    labels: ['MANUAL'],
    pipelineStage: 'VETTING',
    publishState: 'NOT_IMPORTED',
    photoCount: 0,
    dataCompletenessPct: completenessPct(f),
  });
}
async function attachNote(homeId: string, code: string, text: string, link: string): Promise<void> {
  const title = `Slack intake ${code} · reader ${INTAKE_PROMPT_VERSION}`;
  const markdown = `${link ? `${link}\n\n` : ''}${text}`;
  try {
    const note = await client.rest('POST', 'notes', { title, bodyV2: { markdown } });
    const noteId = createdId(note);
    if (noteId) await client.rest('POST', 'noteTargets', { noteId, targetHomeId: homeId });
  } catch (e) {
    console.warn(`  ! note failed (${(e as Error).message.slice(0, 120)}) — keeping the words on notesEn instead`);
    await client.rest('PATCH', `homes/${homeId}`, { notesEn: markdown });
  }
}

// ── the yes ──────────────────────────────────────────────────────────────────
/** `live 0005-01` — a human said yes. The site first, then Twenty mirrors; the thread gets the URL. */
async function goLive(threadTs: string, code: string): Promise<void> {
  const { publishHome } = await import('./home-publish');
  const r = await publishHome(code, { apply: APPLY });
  console.log(`  live ${code}: ${r.ok ? r.url : r.reason}`);
  if (!r.ok) {
    await reply(threadTs, `⛔ لم يُنشر ${code} / not published: ${r.reason}`);
    return;
  }
  await reply(threadTs, `🟢 *${code}* ${APPLY ? 'منشور الآن / is live' : 'سيُنشر (تجربة) / would go live'}: ${r.url}${r.pinNote ? `\n_${r.pinNote}_` : ''}`);
}

// ── handlers ─────────────────────────────────────────────────────────────────
interface Ctx {
  vocab: Vocab;
  hosts: Row[];
  homes: Row[];
  state: State;
}
async function loadCtx(): Promise<Ctx> {
  const v = await vocab();
  const [hosts, homes] = await Promise.all([client.all('hosts'), client.all('homes')]);
  return { vocab: v, hosts, homes, state: loadState() };
}
function hostByPhone(ctx: Ctx, phone: string | null): Row | null {
  if (!phone) return null;
  return ctx.hosts.find((h) => normalizeSudanPhone(phoneOf(h.phone as Phones | null)) === phone || normalizeSudanPhone(phoneOf(h.whatsapp as Phones | null)) === phone) ?? null;
}
/** The host's account number: the host record's own `mkanUsername` first, then what its homes carry. */
function accountForHost(ctx: Ctx, hostId: string | null, phone: string | null): string | null {
  const host = hostId ? ctx.hosts.find((h) => h.id === hostId) : null;
  const own = (host?.mkanUsername as string | null) ?? null;
  if (own && /^\d{4}$/.test(own)) return own;
  const rows = ctx.homes.filter((h) => (hostId && h.hostId === hostId) || (phone && normalizeSudanPhone(phoneOf(h.hostPhone as Phones | null)) === phone));
  const accounts = rows.map((h) => h.account as string | null).filter((a): a is string => !!a && /^\d{4}$/.test(a));
  return accounts.sort()[0] ?? null;
}
/**
 * Every manual account number already spoken for, from both sides of the join. A host can
 * hold a number before any of their homes do (filed today, first home tomorrow), and a home
 * can carry one whose host record was never written — read both or the sequence hands the
 * same number out twice.
 */
function takenAccounts(ctx: Ctx): (string | null)[] {
  return [...ctx.homes.map((h) => h.account as string | null), ...ctx.hosts.map((h) => h.mkanUsername as string | null)];
}
/**
 * A home the host already has that these words may describe again. Ranked by likeness
 * (type, rooms, bathrooms, beds, a shared title word) and never the same record twice
 * in one message — a host with three similar flats gets three different answers.
 */
function suspectedDuplicate(ctx: Ctx, phone: string | null, hostId: string | null, f: HomeFacts, taken: Set<string>): Row | null {
  if (!phone && !hostId) return null;
  const mine = ctx.homes.filter((h) => (hostId && h.hostId === hostId) || (phone && normalizeSudanPhone(phoneOf(h.hostPhone as Phones | null)) === phone));
  let best: { row: Row; score: number } | null = null;
  for (const h of mine) {
    if (taken.has(String(h.id))) continue;
    let score = 0;
    if (f.propertyType && (h.propertyType as string | null) === f.propertyType) score += 2;
    if (f.bedrooms != null && (h.bedrooms as number | null) === f.bedrooms) score += 2;
    if (f.bathrooms != null && (h.bathrooms as number | null) === f.bathrooms) score += 1;
    if (f.beds != null && (h.beds as number | null) === f.beds) score += 1;
    const title = `${h.titleAr ?? ''} ${h.name ?? ''}`;
    if (f.titleAr && f.titleAr.split(/\s+/).some((w) => w.length > 3 && title.includes(w))) score += 1;
    if (score >= 4 && (!best || score > best.score)) best = { row: h, score };
  }
  return best?.row ?? null;
}

async function handleMessage(ctx: Ctx, m: SlackMsg): Promise<void> {
  const text = plainText(m.text);
  console.log(`\n▶ message ${m.ts}: ${text.slice(0, 80).replace(/\n/g, ' ')}${text.length > 80 ? '…' : ''}`);
  if (!text) return;
  const live = parseLiveCommand(text);
  if (live) {
    if (!live.code) {
      await reply(m.ts, '⚠️ أي وحدة؟ اكتب `live 0005-01` بالكود / which home? write `live` with its code');
      return;
    }
    await goLive(m.ts, live.code);
    return;
  }
  const prompt = buildIntakePrompt({ text, vocab: ctx.vocab, mode: 'message' });
  const raw = runReader(prompt);
  const r = enforceVocab(raw, ctx.vocab);
  appendJsonl('corpus.jsonl', { ts: m.ts, text, result: r, promptVersion: INTAKE_PROMPT_VERSION, model: READER_MODEL, at: new Date().toISOString() });
  if (r.kind !== 'homes' || r.units.length === 0) {
    console.log(`  ↳ ${r.kind} — nothing to seed`);
    return;
  }
  const hostPhone = r.host.phone ?? phonesInText(text)[0] ?? null;
  const hostName = r.host.name;
  const existingHost = hostByPhone(ctx, hostPhone);
  let hostId = (existingHost?.id as string | undefined) ?? null;
  // The account number is a login slot, not a fact about the host: it is the next free
  // number in order, and it is minted whether or not a phone was written down. The phone
  // is still required before `live` (mustGaps), so nothing reaches the site unreachable.
  const known = accountForHost(ctx, hostId, hostPhone);
  const account = known ?? nextManualAccount(takenAccounts(ctx));
  const newAccount = !known;
  console.log(`  host: ${hostName ?? '—'} ${hostPhone ?? '(no phone)'} → ${existingHost ? `existing ${hostId}` : 'new'} · account ${account}`);
  if (!existingHost && APPLY) {
    const created = await client.rest('POST', 'hosts', clean({ name: hostName ?? hostPhone ?? account, mkanUsername: account, phone: phonesComposite(hostPhone), whatsapp: phonesComposite(r.host.whatsapp), source: 'FIELD_SCOUT', contactFoundVia: 'FIELD_SCOUT', preferredLanguage: r.language === 'en' ? 'EN' : 'AR' }));
    hostId = createdId(created) || null;
    console.log(`  + host ${hostId}`);
  }
  const link = await permalink(m.ts);
  const taken = ctx.homes.map((h) => h.listingId as string | null);
  const units: { code: string | null; recordUrl: string | null; facts: HomeFacts }[] = [];
  const homeIds: string[] = [];
  const codes: string[] = [];
  const pending: PendingUnit[] = [];
  const takenDup = new Set<string>();
  let minted = 0;
  for (const u of r.units) {
    const f = factsFromUnit(u, r, hostPhone);
    const dup = suspectedDuplicate(ctx, hostPhone, hostId, f, takenDup);
    if (dup) {
      takenDup.add(String(dup.id));
      console.log(`  ~ unit ${u.index} looks like ${dup.listingId ?? dup.id} already — kept pending`);
      pending.push({ index: u.index, unit: u, result: r, hostPhone, hostName, suspectCode: (dup.listingId as string | null) ?? null, suspectId: String(dup.id), text, link });
      units.push({ code: `≈ ${dup.listingId ?? '?'} ؟`, recordUrl: `${TWENTY_UI}/object/home/${dup.id}`, facts: f });
      continue;
    }
    const code = nextListingCode(account, [...taken, ...codes], 0);
    minted++;
    const body = homeBody(f, r, u, code, account, hostId, hostName);
    if (APPLY) {
      const created = await client.rest('POST', 'homes', body);
      const id = createdId(created);
      homeIds.push(id);
      codes.push(code);
      await attachNote(id, code, text, link);
      console.log(`  + home ${code} → ${id}`);
      units.push({ code, recordUrl: `${TWENTY_UI}/object/home/${id}`, facts: f });
    } else {
      codes.push(code);
      console.log(`  would create home ${code}:`, JSON.stringify(body));
      units.push({ code, recordUrl: null, facts: f });
    }
  }
  void minted;
  let text2 = buildReply({ hostName, hostPhone, units, promptVersion: INTAKE_PROMPT_VERSION, dryRun: !APPLY, account, newAccount });
  if (pending.length) {
    const codesList = pending.map((p) => p.suspectCode ?? '?').join(' ');
    const titles = pending
      .map((p) => {
        const row = ctx.homes.find((h) => String(h.id) === p.suspectId);
        return `• ${p.index} ↔ *${p.suspectCode}* ${String(row?.titleAr ?? row?.name ?? '').slice(0, 70)}`;
      })
      .join('\n');
    text2 += `\n\n${titles}`;
    text2 +=
      `\n\n❓ ${pending.length === 1 ? 'هذه الوحدة تشبه' : 'هذه الوحدات تشبه'} ${codesList} الموجودة عند نفس المضيف. ` +
      `ردّ بـ \`same ${codesList}\` لدمج كلماتك فيها بالترتيب، أو \`new\` لإنشاء وحدات جديدة.\n` +
      `(looks like ${codesList}, already this host's — reply \`same ${codesList}\` to merge these words into them in order, or \`new\` to create new homes)`;
  }
  await reply(m.ts, text2);
  ctx.state.threads[m.ts] = { ts: m.ts, codes, homeIds, hostId, account, lastReplyTs: m.ts, createdAt: new Date().toISOString(), pending: pending.length ? pending : undefined };
}

/** The human answered `same …` or `new` about units that looked like existing homes. */
async function resolvePending(ctx: Ctx, thread: ThreadState, verdict: { same: string[] } | { new: true }, m: SlackMsg): Promise<void> {
  const pending = thread.pending ?? [];
  const units: { code: string | null; recordUrl: string | null; facts: HomeFacts }[] = [];
  const taken = ctx.homes.map((h) => h.listingId as string | null);
  const account = thread.account ?? nextManualAccount(takenAccounts(ctx));
  for (let i = 0; i < pending.length; i++) {
    const p = pending[i];
    const f = factsFromUnit(p.unit, p.result, p.hostPhone);
    if ('same' in verdict) {
      const code = verdict.same[i] ?? verdict.same[verdict.same.length - 1] ?? p.suspectCode;
      const row = ctx.homes.find((h) => h.listingId === code);
      if (!row) {
        await reply(thread.ts, `⚠️ لا أعرف ${code} / no home with code ${code}`);
        continue;
      }
      const before = factsFromRow(row);
      // the scout's words fill what is empty and add to lists; they never blank a field
      const patch: Row = clean({
        titleAr: before.titleAr ? undefined : f.titleAr,
        descriptionAr: before.descriptionAr ? undefined : f.descriptionAr,
        propertyType: before.propertyType ? undefined : f.propertyType,
        // numbers: the scout's word wins — they were at the door; text: fill what is empty
        bedrooms: f.bedrooms ?? before.bedrooms,
        bathrooms: f.bathrooms ?? before.bathrooms,
        beds: f.beds ?? before.beds,
        guestCapacity: f.guestCapacity ?? before.guestCapacity,
        priceNightSdg: before.priceNightSdg == null ? currency(f.priceNightSdg) : undefined,
        zone: before.zone ?? f.zone,
        googleMapsUrl: before.mapsUrl ? undefined : linkOne(f.mapsUrl, 'Google Maps'),
        amenities: [...new Set([...before.amenities, ...f.amenities])],
        amenitiesRaw: [...new Set([...before.rawWords, ...f.rawWords])],
        notesAr: [row.notesAr as string | null, `[Slack ${new Date().toISOString().slice(0, 10)}] ${p.text}`].filter(Boolean).join('\n'),
        source: row.source ?? 'FIELD_SCOUT',
        priceConfirmedByHost: f.priceConfirmed || before.priceConfirmed ? true : undefined,
      });
      const after: HomeFacts = {
        ...before,
        bedrooms: f.bedrooms ?? before.bedrooms,
        bathrooms: f.bathrooms ?? before.bathrooms,
        beds: f.beds ?? before.beds,
        guestCapacity: f.guestCapacity ?? before.guestCapacity,
        amenities: patch.amenities as string[],
        rawWords: patch.amenitiesRaw as string[],
      };
      const changed = (['bedrooms', 'bathrooms', 'beds', 'guestCapacity'] as const).filter((k) => f[k] != null && f[k] !== before[k]).map((k) => `${k} ${before[k] ?? '—'}→${f[k]}`);
      if (changed.length) appendJsonl('corrections.jsonl', { ts: m.ts, thread: thread.ts, code, kind: 'same-merge', changed, text: p.text, at: new Date().toISOString() });
      patch.dataCompletenessPct = completenessPct(after);
      if (APPLY) {
        await client.rest('PATCH', `homes/${row.id}`, patch);
        await attachNote(String(row.id), String(row.listingId), p.text, p.link);
      }
      console.log(`  ~ merged unit ${p.index} into ${code}`);
      thread.codes.push(String(row.listingId));
      thread.homeIds.push(String(row.id));
      units.push({ code: String(row.listingId), recordUrl: `${TWENTY_UI}/object/home/${row.id}`, facts: after, liveUrl: liveUrlOf(row) });
    } else {
      const code = nextListingCode(account, [...taken, ...thread.codes], 0);
      const body = homeBody(f, p.result, p.unit, code, account, thread.hostId, p.hostName);
      if (APPLY) {
        const created = await client.rest('POST', 'homes', body);
        const id = createdId(created);
        await attachNote(id, code, p.text, p.link);
        thread.codes.push(code);
        thread.homeIds.push(id);
        units.push({ code, recordUrl: `${TWENTY_UI}/object/home/${id}`, facts: f });
        console.log(`  + home ${code} → ${id}`);
      } else {
        thread.codes.push(code);
        units.push({ code, recordUrl: null, facts: f });
        console.log(`  would create home ${code}:`, JSON.stringify(body));
      }
    }
  }
  thread.pending = undefined;
  await reply(thread.ts, buildReply({ hostName: pending[0]?.hostName ?? null, hostPhone: pending[0]?.hostPhone ?? null, units, promptVersion: INTAKE_PROMPT_VERSION, dryRun: !APPLY, account }));
}

/**
 * A number written down later for a host filed without one. The account is already minted
 * and stays minted — but the phone may turn out to belong to a host who already has an
 * account, and silently welding the two identities together is exactly the mistake the
 * `same` / `new` question exists to prevent. So: write it when it is free, say so when it
 * is not, and never move a home between accounts on a guess.
 */
async function phoneArrived(ctx: Ctx, thread: ThreadState, text: string): Promise<void> {
  if (!thread.hostId) return;
  const host = ctx.hosts.find((h) => h.id === thread.hostId);
  if (!host) return;
  if (normalizeSudanPhone(phoneOf(host.phone as Phones | null))) return; // already has one
  const said = phonesInText(text)[0] ?? null;
  if (!said) return;
  const owner = hostByPhone(ctx, said);
  if (owner && owner.id !== host.id) {
    const theirs = (owner.mkanUsername as string | null) ?? accountForHost(ctx, String(owner.id), said) ?? '—';
    await reply(
      thread.ts,
      `⚠️ الرقم ${said} مسجّل عند مضيف آخر (حساب ${theirs}). لم أنقل شيئاً — إن كان نفس الشخص انقل الوحدات إلى حسابه في Twenty.
` +
        `(that number already belongs to another host, account ${theirs} — nothing moved; move the homes in Twenty if it is the same person)`
    );
    return;
  }
  if (APPLY) {
    await client.rest('PATCH', `hosts/${host.id}`, { phone: phonesComposite(said) });
    for (const id of thread.homeIds) await client.rest('PATCH', `homes/${id}`, { hostPhone: phonesComposite(said) });
  }
  console.log(`  ☎ phone ${said} → host ${host.id}`);
  await reply(thread.ts, `☎️ سجّلت رقم المضيف ${said} / host phone recorded`);
}

async function handleReply(ctx: Ctx, thread: ThreadState, m: SlackMsg): Promise<void> {
  const text = plainText(m.text);
  console.log(`\n▶ reply in ${thread.ts} (${thread.codes.join(', ') || 'no homes'}): ${text.slice(0, 80).replace(/\n/g, ' ')}`);
  if (!text) return;
  if (thread.pending?.length) {
    const t = toAsciiDigits(text).trim();
    if (/^(new|جديد|جديدة)\b/iu.test(t)) return resolvePending(ctx, thread, { new: true }, m);
    const same = /^(same|نفس|نفسها|merge|دمج)\b(.*)$/iu.exec(t);
    if (same) return resolvePending(ctx, thread, { same: (same[2].match(/\d{4}-\d{2}/g) ?? []) }, m);
    await reply(thread.ts, `❓ أولاً: \`same ${thread.pending.map((p) => p.suspectCode).join(' ')}\` أو \`new\` — ثم أكمل التفاصيل / first answer same … or new, then add details`);
    return;
  }
  if (thread.homeIds.length === 0) return;
  await phoneArrived(ctx, thread, text);
  const live = parseLiveCommand(text);
  if (live) {
    const codes = live.code ? [live.code] : thread.codes;
    if (!codes.length) {
      await reply(thread.ts, '⚠️ لا توجد وحدة في هذا الثريد / no home in this thread');
      return;
    }
    for (const c of codes) await goLive(thread.ts, c);
    return;
  }
  const rows: Row[] = [];
  for (const id of thread.homeIds) {
    const res = (await client.rest('GET', `homes/${id}`)) as { data?: { home?: Row } };
    const row = res.data?.home ?? (res as Row);
    if (row && row.id) rows.push(row);
  }
  if (!rows.length) return;
  const known = rows.map((h, i) => ({ index: i + 1, code: h.listingId, ...factsFromRow(h) }));
  const raw = runReader(buildIntakePrompt({ text, vocab: ctx.vocab, mode: 'reply', known }));
  const r = enforceVocab(raw, ctx.vocab);
  appendJsonl('corpus.jsonl', { ts: m.ts, thread: thread.ts, text, result: r, promptVersion: INTAKE_PROMPT_VERSION, model: READER_MODEL, at: new Date().toISOString() });
  if (r.kind === 'reject') {
    for (const h of rows) if (APPLY) await client.rest('PATCH', `homes/${h.id}`, { pipelineStage: 'REJECTED' });
    appendJsonl('corrections.jsonl', { ts: m.ts, thread: thread.ts, kind: 'reject', text, at: new Date().toISOString() });
    await reply(thread.ts, `❌ فُهم — الوحدة ملغاة (REJECTED) / understood — marked rejected.`);
    return;
  }
  if (r.kind === 'not_home') {
    console.log('  ↳ not about the home — silent');
    return;
  }
  const confirmedByWords = saysPriceConfirmed(text);
  const units: { code: string | null; recordUrl: string | null; facts: HomeFacts }[] = [];
  const hostPhone = r.host.phone ?? phonesInText(text)[0] ?? null;
  for (let i = 0; i < rows.length; i++) {
    const h = rows[i];
    const before = factsFromRow(h);
    // one home in the thread → every unit in the reply is about it; several → match by index
    const u = rows.length === 1 ? r.units[0] : r.units.find((x) => x.index === i + 1);
    const patch: Row = {};
    const changes: Record<string, [unknown, unknown]> = {};
    const set = (key: string, value: unknown, was: unknown) => {
      if (value === undefined || value === null || (Array.isArray(value) && !value.length)) return;
      if (JSON.stringify(value) === JSON.stringify(was)) return;
      patch[key] = value;
      changes[key] = [was, value];
    };
    if (u) {
      set('titleAr', u.titleAr, before.titleAr);
      set('descriptionAr', u.descriptionAr, before.descriptionAr);
      set('propertyType', u.propertyType, before.propertyType);
      if (u.propertyType) set('mkanPropertyType', u.propertyType, before.propertyType);
      set('bedrooms', u.bedrooms, before.bedrooms);
      set('bathrooms', u.bathrooms, before.bathrooms);
      set('beds', u.beds, before.beds);
      set('guestCapacity', u.guestCapacity, before.guestCapacity);
      if (u.priceNightSdg != null) set('priceNightSdg', currency(u.priceNightSdg), before.priceNightSdg);
      const amen = [...new Set([...before.amenities, ...u.amenities])];
      if (amen.length !== before.amenities.length) set('amenities', amen, before.amenities);
      const raws = [...new Set([...before.rawWords, ...u.rawWords])];
      if (raws.length !== before.rawWords.length) set('amenitiesRaw', raws, before.rawWords);
      if (u.priceNote) set('notesAr', [h.notesAr, u.priceNote].filter(Boolean).join('\n'), h.notesAr);
    }
    set('zone', r.area.zone, before.zone);
    if (r.area.city) set('city', r.area.city, h.city);
    if (r.area.mapsUrl) set('googleMapsUrl', linkOne(r.area.mapsUrl, 'Google Maps'), before.mapsUrl);
    if (r.area.addressText) set('homeAddress', clean({ ...(h.homeAddress as Row | null), addressStreet1: r.area.addressText, addressCity: 'Port Sudan', addressState: 'Red Sea', addressCountry: 'Sudan' }), h.homeAddress);
    if (hostPhone && !before.hostPhone) set('hostPhone', phonesComposite(hostPhone), null);
    if (r.host.name && !h.hostName) set('hostName', r.host.name, null);
    const priceConfirmed = before.priceConfirmed || confirmedByWords || Boolean(u?.priceConfirmed);
    if (priceConfirmed !== before.priceConfirmed) set('priceConfirmedByHost', priceConfirmed, before.priceConfirmed);
    // the level, after the merge
    const after: HomeFacts = {
      ...before,
      titleAr: (patch.titleAr as string) ?? before.titleAr,
      descriptionAr: (patch.descriptionAr as string) ?? before.descriptionAr,
      propertyType: (patch.propertyType as string) ?? before.propertyType,
      bedrooms: (patch.bedrooms as number) ?? before.bedrooms,
      bathrooms: (patch.bathrooms as number) ?? before.bathrooms,
      beds: (patch.beds as number) ?? before.beds,
      guestCapacity: (patch.guestCapacity as number) ?? before.guestCapacity,
      priceNightSdg: u?.priceNightSdg ?? before.priceNightSdg,
      priceConfirmed,
      zone: (patch.zone as string) ?? before.zone,
      mapsUrl: r.area.mapsUrl ?? before.mapsUrl,
      latitude: latLngFrom(r.area.mapsUrl)?.lat ?? before.latitude,
      longitude: latLngFrom(r.area.mapsUrl)?.lng ?? before.longitude,
      hostPhone: before.hostPhone ?? hostPhone,
      amenities: (patch.amenities as string[]) ?? before.amenities,
      rawWords: (patch.amenitiesRaw as string[]) ?? before.rawWords,
    };
    patch.dataCompletenessPct = completenessPct(after);
    const eligible = isEligible(after);
    if (eligible && !liveUrlOf(h) && h.pipelineStage !== 'CLAIMED' && h.pipelineStage !== 'LIVE') patch.pipelineStage = 'CLAIMED';
    if (Object.keys(changes).length) appendJsonl('corrections.jsonl', { ts: m.ts, thread: thread.ts, code: h.listingId, changes, text, at: new Date().toISOString() });
    console.log(`  ${h.listingId}: ${Object.keys(changes).join(', ') || 'no field changed'} · ${patch.dataCompletenessPct}%${eligible ? ' · CLAIMED' : ''}`);
    if (APPLY && Object.keys(patch).length) await client.rest('PATCH', `homes/${h.id}`, patch);
    units.push({ code: h.listingId as string, recordUrl: `${TWENTY_UI}/object/home/${h.id}`, facts: after, liveUrl: liveUrlOf(h) });
  }
  await reply(thread.ts, buildReply({ hostName: (rows[0].hostName as string | null) ?? r.host.name, hostPhone: units[0]?.facts.hostPhone ?? null, units, promptVersion: INTAKE_PROMPT_VERSION, dryRun: !APPLY, account: (rows[0]?.account as string | null) ?? null }));
}

// ── commands ─────────────────────────────────────────────────────────────────
async function sweep(): Promise<void> {
  if (!acquireLock()) {
    console.log('another sweep is running (lock < 5 min old) — nothing to do');
    return;
  }
  try {
    await sweepLocked();
  } finally {
    releaseLock();
  }
}
async function sweepLocked(): Promise<void> {
  // Slack first, Twenty only when there is work: this runs every two minutes.
  const state = loadState();
  const bot = await botUserId();
  const limit = Number(argv('limit', '50'));
  const sinceArg = argv('since');
  const oldest = state.cursor ?? sinceArg ?? String(Math.floor(Date.now() / 1000) - 6 * 3600);
  const hist = await slackGet<{ messages: SlackMsg[] }>('conversations.history', { channel: CHANNEL, oldest, limit: String(limit) });
  const fresh = (hist.messages ?? []).filter((m) => m.ts !== state.cursor && !state.handled.includes(m.ts)).sort((a, b) => Number(a.ts) - Number(b.ts));
  const threadWork: { t: ThreadState; replies: SlackMsg[] }[] = [];
  for (const t of Object.values(state.threads)) {
    try {
      const r = await slackGet<{ messages: SlackMsg[] }>('conversations.replies', { channel: CHANNEL, ts: t.ts, oldest: t.lastReplyTs, limit: '50' });
      const replies = (r.messages ?? []).filter((m) => m.ts !== t.ts && Number(m.ts) > Number(t.lastReplyTs) && !state.handled.includes(m.ts)).sort((a, b) => Number(a.ts) - Number(b.ts));
      if (replies.length) threadWork.push({ t, replies });
    } catch (e) {
      console.warn(`  ! thread ${t.ts}: ${(e as Error).message}`);
    }
  }
  const humanFresh = fresh.filter((m) => isHuman(m, bot) && !(m.thread_ts && m.thread_ts !== m.ts));
  const humanReplies = threadWork.reduce((n, w) => n + w.replies.filter((m) => isHuman(m, bot)).length, 0);
  if (!humanFresh.length && !humanReplies) {
    // bookkeeping only: remember what was seen so the window keeps moving
    for (const m of fresh) {
      state.handled.push(m.ts);
      if (Number(m.ts) > Number(state.cursor ?? 0)) state.cursor = m.ts;
    }
    for (const w of threadWork) for (const m of w.replies) { state.handled.push(m.ts); w.t.lastReplyTs = m.ts; }
    saveState(state);
    console.log(`sweep #${CHANNEL} since ${oldest}${APPLY ? '' : ' (dry run)'} · nothing new from a human`);
    return;
  }
  const ctx = await loadCtx();
  ctx.state = state;
  console.log(`sweep #${CHANNEL} since ${oldest}${APPLY ? '' : ' (dry run)'} · ${ctx.homes.length} homes, ${ctx.hosts.length} hosts in Twenty`);
  let acted = 0;
  for (const m of fresh) {
    ctx.state.handled.push(m.ts);
    if (Number(m.ts) > Number(ctx.state.cursor ?? 0)) ctx.state.cursor = m.ts;
    if (!isHuman(m, bot)) continue;
    if (m.thread_ts && m.thread_ts !== m.ts) continue; // broadcast replies are handled from their thread
    try {
      await handleMessage(ctx, m);
      acted++;
    } catch (e) {
      console.error(`  ! ${m.ts}: ${(e as Error).message}`);
      await reply(m.ts, `⚠️ لم أستطع قراءة هذه الرسالة / I could not read this one: ${(e as Error).message.slice(0, 160)}`);
    }
    saveState(ctx.state);
  }
  for (const { t, replies } of threadWork) {
    for (const m of replies) {
      ctx.state.handled.push(m.ts);
      t.lastReplyTs = m.ts;
      if (!isHuman(m, bot)) continue;
      try {
        await handleReply(ctx, t, m);
        acted++;
      } catch (e) {
        console.error(`  ! reply ${m.ts}: ${(e as Error).message}`);
        await reply(t.ts, `⚠️ لم أفهم هذا الرد / I could not read this reply: ${(e as Error).message.slice(0, 160)}`);
      }
      saveState(ctx.state);
    }
  }
  saveState(ctx.state);
  console.log(`\ndone · ${fresh.length} new message(s), ${acted} acted on${APPLY ? '' : ' · dry run: nothing written, cursor not moved'}`);
}

async function extract(): Promise<void> {
  const ts = argv('ts');
  let text = argv('text');
  if (!text && ts) text = plainText((await messageByTs(ts))?.text);
  if (!text) throw new Error('give --text="…" or --ts=<slack ts>');
  const v = await vocab();
  const r = enforceVocab(runReader(buildIntakePrompt({ text, vocab: v, mode: (argv('mode', 'message') as ReadMode) })), v);
  console.log(JSON.stringify(r, null, 2));
}

async function intakeOne(): Promise<void> {
  const ts = argv('ts');
  if (!ts) throw new Error('give --ts=<slack ts> of the channel message');
  if (!acquireLock()) throw new Error('a sweep is running — try again in a minute');
  try {
    await intakeOneLocked(ts);
  } finally {
    releaseLock();
  }
}
async function intakeOneLocked(ts: string): Promise<void> {
  const ctx = await loadCtx();
  const m = await messageByTs(ts);
  if (!m) throw new Error(`no message at ts ${ts} in ${CHANNEL}`);
  await handleMessage(ctx, m);
  if (!ctx.state.handled.includes(ts)) ctx.state.handled.push(ts);
  saveState(ctx.state);
}

async function updateOne(): Promise<void> {
  const code = argv('code');
  const text = argv('text');
  if (!code || !text) throw new Error('give --code=NNNN-NN and --text="…"');
  if (!acquireLock()) throw new Error('a sweep is running — try again in a minute');
  try {
    await updateOneLocked(code, text);
  } finally {
    releaseLock();
  }
}
async function updateOneLocked(code: string, text: string): Promise<void> {
  const ctx = await loadCtx();
  const home = ctx.homes.find((h) => h.listingId === code);
  if (!home) throw new Error(`no home with listingId ${code}`);
  const thread = Object.values(ctx.state.threads).find((t) => t.codes.includes(code)) ?? { ts: '', codes: [code], homeIds: [home.id as string], hostId: null, account: null, lastReplyTs: '', createdAt: '' };
  await handleReply(ctx, { ...thread, homeIds: [home.id as string], codes: [code] }, { ts: String(Date.now() / 1000), text, user: 'cli' });
}

async function status(): Promise<void> {
  const ctx = await loadCtx();
  const mine = ctx.homes.filter((h) => h.source === 'FIELD_SCOUT');
  console.log(`cursor ${ctx.state.cursor ?? '—'} · ${Object.keys(ctx.state.threads).length} thread(s) · ${mine.length} Slack-born home(s)\n`);
  for (const h of mine.sort((a, b) => String(a.listingId).localeCompare(String(b.listingId)))) {
    const f = factsFromRow(h);
    console.log(`${h.listingId ?? '—'}  ${String(h.pipelineStage).padEnd(10)} ${String(h.publishState).padEnd(13)} ${String(h.dataCompletenessPct ?? '?').padStart(3)}%  missing: ${mustGaps(f).map((g) => g.en).join(', ') || '—'}  ${TWENTY_UI}/object/home/${h.id}`);
  }
}

async function answerOne(): Promise<void> {
  const ts = argv('ts');
  const text = argv('text');
  if (!ts || !text) throw new Error('give --ts=<thread ts> and --text="same 0004-02 0004-03" | "new" | any words');
  if (!acquireLock()) throw new Error('a sweep is running — try again in a minute');
  try {
    const ctx = await loadCtx();
    const thread = ctx.state.threads[ts];
    if (!thread) throw new Error(`no intake thread at ${ts}`);
    await handleReply(ctx, thread, { ts: String(Date.now() / 1000), text, user: 'cli' });
    saveState(ctx.state);
  } finally {
    releaseLock();
  }
}

const HELP = `home-intake — see the header of scripts/crm/home-intake.ts\n  sweep | extract | intake | update | answer | status   (--apply to write)`;
(async () => {
  switch (cmd) {
    case 'sweep': return sweep();
    case 'extract': return extract();
    case 'intake': return intakeOne();
    case 'update': return updateOne();
    case 'answer': return answerOne();
    case 'status': return status();
    default: console.log(HELP);
  }
})().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
