/**
 * The web lane — Kigali rental ads on Rwandan property websites → the mkan CRM.
 *
 *   pnpm crm:web-ads survey                       re-check every candidate site, print the table
 *   pnpm crm:web-ads run [--apply] [--notify]     list → ad pages → read → gate → Twenty
 *        [--site=houseinrwanda,imali] [--limit=N per site] [--max-age=90] [--read-limit=N] [--no-read]
 *   pnpm crm:web-ads status
 *
 * One adapter per site under scripts/crm/web-ads/<site>.ts turns its pages into
 * a raw ad; SURVEY.md says why these sites and not the others. Every fetch is
 * one request at a time, ≥2 s apart, under an honest user agent, on pages the
 * site's robots.txt allows. Nothing logs in.
 *
 * Property sites label their facts, so most ads need no model; the TikTok
 * reader (Anthropic, falling back to Groq, text only) runs only where the
 * labels leave a gap. Then the TikTok lane's gazetteer gate, its dupKey against
 * every home already in Twenty (a home also on TikTok or Facebook gets a note,
 * not a copy), and a Twenty `home` at VETTING with `source: WEB` and its
 * `host` matched by phone. Dedupe key: `web:<site>:<adId>`. Ledger per site in
 * scripts/crm/.data/web-ads/<site>.json.
 *
 * Only `run --apply` writes anywhere shared. A dry run reads the sites and the
 * CRM, and prints what it would file.
 */
import { config } from 'dotenv';
config({ override: true });

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicCap, anthropicKey, runAnthropic } from './anthropic-reader';
import { GroqLimit, groqKey, runGroq } from './groq-reader';
import { postToMkan, recordRun } from './notify';
import { dupKey, parseTikTokRead, skipReasonFor, type TikTokRead } from './tiktok-pure';
import { twentyClient, type TwentyClient } from './twenty-rest';
import { phonesFromTwenty } from '../../src/lib/phone';
import type { RawAd, SiteAdapter } from './web-ads/html';
import { houseinrwanda } from './web-ads/houseinrwanda';
import { imali } from './web-ads/imali';
import { rwandahouseland } from './web-ads/rwandahouseland';
import { buildWebPrompt, isStale, mergeReads, readFromAd, readerGaps, sourceIdFor, twentyHomeKey, webHomeBody, webHostBody, webPhones, WEB_PROMPT_VERSION } from './web-ads/pure';
import { SURVEY_SITES, robotsAllows, surveyPage, type SurveyRow } from './web-ads/survey';

// ── argv ─────────────────────────────────────────────────────────────────────
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const flag = (n: string): boolean => process.argv.includes(`--${n}`);
const APPLY = flag('apply');
const LIMIT = Number(argv('limit', '40')) || Infinity;
const READ_LIMIT = Number(argv('read-limit', '0')) || Infinity;
const MAX_AGE_DAYS = Number(argv('max-age', '90'));
const GAP_MS = Math.max(2000, Number(argv('gap-ms', '2500')));
const cmd = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? (flag('survey') ? 'survey' : 'help');

export const ADAPTERS: SiteAdapter[] = [houseinrwanda, rwandahouseland, imali];
export const UA = 'mkan-rentals/1.0 (+https://mkan.sd; Kigali rental listings research; contact via site)';

const DATA = join(process.cwd(), 'scripts/crm/.data/web-ads');
const PHOTOS = join(DATA, 'photos');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

// ── polite fetch ─────────────────────────────────────────────────────────────
let lastFetch = 0;
/** One request at a time, ≥ GAP_MS apart, honest UA. Returns null on a non-200. */
export async function politeGet(url: string, gapMs = GAP_MS): Promise<{ status: number; url: string; html: string } | null> {
  const wait = lastFetch + gapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: ctrl.signal });
    const html = await res.text();
    return { status: res.status, url: res.url, html };
  } catch (e) {
    console.warn(`  ! ${url}: ${(e as Error).message.slice(0, 120)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── the ledger ───────────────────────────────────────────────────────────────
type AdState = 'listed' | 'fetched' | 'read' | 'upserted' | 'skipped' | 'failed';
interface AdRow {
  sourceId: string;
  site: string;
  adId: string;
  url: string;
  listedAt: string;
  state: AdState;
  ad?: RawAd;
  read?: TikTokRead;
  readVersion?: string;
  skipReason?: string;
  homeId?: string;
  hostId?: string;
  mergedInto?: string;
  photos?: string[];
  error?: string;
}
type Ledger = Record<string, AdRow>;
const ledgerFile = (site: string) => join(DATA, `${site}.json`);
function loadLedger(site: string): Ledger {
  const f = ledgerFile(site);
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Ledger) : {};
}
function saveLedger(site: string, l: Ledger): void {
  mkdirSync(DATA, { recursive: true });
  const f = ledgerFile(site);
  writeFileSync(`${f}.tmp`, JSON.stringify(l, null, 2));
  renameSync(`${f}.tmp`, f);
}

// ── survey ───────────────────────────────────────────────────────────────────
async function survey(): Promise<void> {
  console.log(`\nsurvey: ${SURVEY_SITES.length} candidate site(s), one request every ${GAP_MS / 1000}s\n`);
  const rows: SurveyRow[] = [];
  for (const s of SURVEY_SITES) {
    const origin = new URL(s.listUrl).origin;
    const robots = await politeGet(`${origin}/robots.txt`);
    const allowed = robots && robots.status === 200 ? robotsAllows(robots.html, new URL(s.listUrl).pathname) : true;
    const page = allowed ? await politeGet(s.listUrl) : null;
    const row = surveyPage(s, page, allowed);
    // An adapter proves the rest on one real ad: price, place, phone or agency.
    const adapter = ADAPTERS.find((a) => a.site === s.site);
    if (adapter && page && row.adLinks) {
      const link = adapter.parseList(page.html)[0];
      const ad = link ? await politeGet(link.url) : null;
      if (link && ad?.status === 200) {
        const raw = adapter.parseAd(ad.html, link);
        row.sample = `${raw.bedrooms ?? '?'}bd ${raw.price ?? '?'} ${raw.currency ?? ''}/${raw.period.toLowerCase()} · ${raw.place ?? raw.location ?? '?'} · ${raw.phones.length ? 'phone' : 'no phone'}${raw.agencyName ? ` · ${raw.agencyName}` : ''}`;
        row.contact = raw.phones.length > 0 || !!raw.agencyName;
      }
    }
    rows.push(row);
    console.log(`  ${row.site.padEnd(16)} ${row.verdict}`);
  }
  const pad = (s: string | number, n: number) => String(s).slice(0, n).padEnd(n);
  console.log(`\n${pad('site', 16)} ${pad('http', 5)} ${pad('robots', 6)} ${pad('render', 7)} ${pad('ads/pg', 6)} ${pad('~total', 6)} ${pad('priced', 6)} ${pad('kigali', 6)} ${pad('contact', 7)} verdict`);
  for (const r of rows) {
    console.log(
      `${pad(r.site, 16)} ${pad(r.http, 5)} ${pad(r.robots ? 'ok' : 'NO', 6)} ${pad(r.render, 7)} ${pad(r.adLinks, 6)} ${pad(r.estimate, 6)} ${pad(r.priced, 6)} ${pad(r.kigali, 6)} ${pad(r.contact == null ? '?' : r.contact ? 'yes' : 'no', 7)} ${r.verdict}`,
    );
    if (r.sample) console.log(`${' '.repeat(17)}sample: ${r.sample}`);
  }
  console.log(`\nadapters: ${ADAPTERS.map((a) => a.site).join(', ')} — notes and the reasons for the rest in scripts/crm/web-ads/SURVEY.md`);
}

// ── collect: list pages → ad pages → labels (→ reader) → gate ────────────────
async function readText(ad: RawAd, label: string): Promise<{ read: TikTokRead; via: string }> {
  const prompt = buildWebPrompt(ad, label);
  if (anthropicKey()) return { read: parseTikTokRead(await runAnthropic({ prompt, maxTokens: 2000 })), via: 'anthropic' };
  return { read: parseTikTokRead(await runGroq({ prompt, maxTokens: 900 })), via: 'groq' };
}

function hasReader(): boolean {
  if (anthropicKey()) return true;
  try {
    return !!groqKey();
  } catch {
    return false;
  }
}

interface CollectStats {
  listed: number;
  fetched: number;
  read: number;
  modelReads: number;
  skipped: number;
  stop?: string;
}

async function collect(adapter: SiteAdapter, readBudget: { left: number }): Promise<CollectStats> {
  const ledger = loadLedger(adapter.site);
  const stats: CollectStats = { listed: 0, fetched: 0, read: 0, modelReads: 0, skipped: 0 };
  console.log(`\n── ${adapter.label} (${adapter.site}) · up to ${LIMIT} new ad(s) ──`);
  // 1. List pages, newest first, until a page brings nothing new or the limit is met.
  const fresh: { adId: string; url: string }[] = [];
  for (let p = 0; fresh.length < LIMIT; p++) {
    const url = adapter.listUrl(p);
    if (!url) break;
    const page = await politeGet(url);
    if (!page || page.status !== 200) {
      console.warn(`  ! list ${url}: ${page?.status ?? 'no response'}`);
      break;
    }
    if (/\/(login|signin|user\/login)/i.test(new URL(page.url).pathname)) {
      stats.stop = `${adapter.site}: the list now asks for a login`;
      break;
    }
    const links = adapter.parseList(page.html);
    const unseen = links.filter((l) => !ledger[sourceIdFor(adapter.site, l.adId)]);
    console.log(`  list ${url.replace(adapter.origin, '')}: ${links.length} ad(s), ${unseen.length} new`);
    for (const l of unseen) if (fresh.length < LIMIT && !fresh.some((f) => f.adId === l.adId)) fresh.push(l);
    // A sorted list (newest first) that brought nothing new has no more news further back.
    if (!unseen.length && adapter.site !== 'imali') break;
  }
  for (const l of fresh) {
    const sourceId = sourceIdFor(adapter.site, l.adId);
    ledger[sourceId] = { sourceId, site: adapter.site, adId: l.adId, url: l.url, listedAt: now(), state: 'listed' };
    stats.listed++;
  }
  saveLedger(adapter.site, ledger);

  // 2. Ad pages for everything listed (this run's and any a crash left behind).
  for (const row of Object.values(ledger).filter((r) => r.state === 'listed')) {
    const page = await politeGet(row.url);
    if (!page || page.status !== 200) {
      Object.assign(row, page?.status === 404 || page?.status === 410 ? { state: 'skipped', skipReason: 'ad removed' } : { error: `fetch ${page?.status ?? 'failed'}` });
      saveLedger(adapter.site, ledger);
      continue;
    }
    try {
      row.ad = adapter.parseAd(page.html, { adId: row.adId, url: row.url });
      row.state = 'fetched';
      delete row.error;
      stats.fetched++;
    } catch (e) {
      Object.assign(row, { state: 'failed', error: `parse: ${(e as Error).message.slice(0, 160)}` });
    }
    saveLedger(adapter.site, ledger);
  }

  // 3. Labels → read; the model only on gaps; then the gate.
  const readerOk = !flag('no-read') && hasReader();
  for (const row of Object.values(ledger).filter((r) => r.state === 'fetched' && r.ad)) {
    const ad = row.ad!;
    if (isStale(ad.postedAt, MAX_AGE_DAYS)) {
      Object.assign(row, { state: 'skipped', skipReason: `older than ${MAX_AGE_DAYS}d (${ad.postedAt})` });
      stats.skipped++;
      continue;
    }
    let read = readFromAd(ad);
    let version = `${WEB_PROMPT_VERSION}/labels`;
    const gaps = read.isRental ? readerGaps(read) : [];
    if (gaps.length && readerOk && readBudget.left > 0 && (ad.text || ad.title)) {
      try {
        const m = await readText(ad, adapter.label);
        read = mergeReads(read, m.read);
        version = `${WEB_PROMPT_VERSION}/labels+${m.via}`;
        readBudget.left--;
        stats.modelReads++;
      } catch (e) {
        if (e instanceof AnthropicCap || e instanceof GroqLimit) {
          stats.stop ??= (e as Error).message.slice(0, 160);
          readBudget.left = 0;
        } else row.error = `read: ${(e as Error).message.slice(0, 160)}`;
      }
    }
    const skip = skipReasonFor(read, { caption: `${ad.title}\n${ad.location}\n${ad.text}` });
    Object.assign(row, { read, readVersion: version }, skip ? { state: 'skipped', skipReason: skip } : { state: 'read' });
    if (skip) stats.skipped++;
    else stats.read++;
    console.log(
      `  ${skip ? '·' : '✓'} ${row.sourceId} ${skip ?? `${read.bedrooms ?? '?'}bd ${read.propertyType ?? '?'} ${read.priceRwf ?? '?'} RWF/${read.period} · ${read.neighbourhood ?? read.district ?? '?'} (${read.district ?? '?'}) · ${webPhones(read, ad).length} phone(s)${ad.agencyName ? ` · ${ad.agencyName}` : ''}${gaps.length ? ` · gaps ${gaps.join('/')}${version.includes('+') ? ' (read)' : ''}` : ''}`}`,
    );
    saveLedger(adapter.site, ledger);
  }
  saveLedger(adapter.site, ledger);
  return stats;
}

// ── upsert ───────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
const createdId = (res: unknown): string => {
  const d = (res as { data?: Row })?.data ?? (res as Row);
  const rec = (d as Row)?.createHome ?? (d as Row)?.createHost ?? (d as Row)?.createOpportunity ?? (d as Row)?.createNote ?? d;
  return String((rec as Row)?.id ?? '');
};

async function downloadPhotos(row: AdRow): Promise<string[]> {
  const dir = join(PHOTOS, row.site, row.adId.replace(/[^\w-]/g, '_'));
  mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const [i, u] of (row.ad?.photos ?? []).slice(0, 6).entries()) {
    try {
      await sleep(800);
      const res = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const raw = join(dir, `${i + 1}.img`);
      writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      const jpg = join(dir, `${i + 1}.jpg`);
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-frames:v', '1', '-vf', "scale='min(1280,iw)':-2", '-q:v', '3', jpg]);
      rmSync(raw, { force: true });
      if (existsSync(jpg)) out.push(jpg);
    } catch {
      /* next photo */
    }
  }
  return out;
}

async function uploadPhotos(row: AdRow): Promise<string[]> {
  const s3 = await import('@/lib/s3');
  if (!s3.isS3Configured()) throw new Error('S3 is not configured (AWS_* in .env) — photos cannot be stored');
  const ns = process.env.NEXT_PUBLIC_CDN_NAMESPACE?.trim() || 'mkan';
  const urls: string[] = [];
  for (const [i, p] of (row.photos ?? []).entries()) {
    const url = await s3.putObject({
      key: `${ns}/uploads/web/${row.site}/${row.adId.replace(/[^\w-]/g, '_')}/${i + 1}.jpg`,
      body: readFileSync(p),
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    if (url) urls.push(url);
  }
  return urls;
}

interface Board {
  client: TwentyClient | null;
  homeBySource: Map<string, Row>;
  homeByFacts: Map<string, string>;
  hostByPhone: Map<string, Row>;
  /** Agencies that print no phone (HiR Ltd): one host per name, not one per ad. */
  hostByName: Map<string, Row>;
}

async function loadBoard(): Promise<Board> {
  const board: Board = { client: null, homeBySource: new Map(), homeByFacts: new Map(), hostByPhone: new Map(), hostByName: new Map() };
  try {
    const client = twentyClient();
    const [hosts, homes] = await Promise.all([client.all('hosts'), client.all('homes')]);
    board.client = client;
    for (const h of homes) {
      if (h.sourceId) board.homeBySource.set(String(h.sourceId), h);
      const k = twentyHomeKey(h);
      if (k && !board.homeByFacts.has(k)) board.homeByFacts.set(k, String(h.id));
    }
    for (const h of hosts) if (typeof h.name === 'string' && h.name.trim()) board.hostByName.set(h.name.trim().toLowerCase(), h);
    for (const h of hosts) for (const n of [...phonesFromTwenty(h.phone as never, 'RW'), ...phonesFromTwenty(h.whatsapp as never, 'RW')]) if (n.startsWith('+250')) board.hostByPhone.set(n, h);
    console.log(`\nboard: ${homes.length} home(s), ${hosts.length} host(s) in Twenty`);
  } catch (e) {
    if (APPLY) throw e;
    console.warn(`\n! Twenty unreadable (${(e as Error).message.slice(0, 120)}) — the dry run dedupes only within this run`);
  }
  return board;
}

async function upsert(adapter: SiteAdapter, board: Board): Promise<{ homes: number; hosts: number; joined: number }> {
  const ledger = loadLedger(adapter.site);
  const queue = Object.values(ledger).filter((r) => r.state === 'read' && r.read && r.ad);
  console.log(`\nupsert ${adapter.site}: ${queue.length} ad(s) → Twenty ${APPLY ? '(APPLY)' : '(dry run — pass --apply to write)'}`);
  let homes = 0;
  let hosts = 0;
  let joined = 0;
  for (const row of queue) {
    const ad = row.ad!;
    const read = row.read!;
    const existing = board.homeBySource.get(row.sourceId);
    if (existing) {
      Object.assign(row, { state: 'upserted', homeId: String(existing.id) });
      continue;
    }
    const phones = webPhones(read, ad);
    const phone = phones[0] ?? null;
    // The same home already on the board (TikTok, Facebook, another site): a note on it, not a copy.
    const key = dupKey('', read);
    const same = key ? board.homeByFacts.get(key) : undefined;
    if (same) {
      joined++;
      console.log(`  ≡ ${row.sourceId} — same facts as home ${same}${APPLY ? '; noted on it' : '; would note it there'}`);
      if (APPLY && board.client && !same.startsWith('(planned')) {
        try {
          const note = createdId(
            await board.client.rest('POST', 'notes', {
              title: `Also on ${adapter.label} — ${ad.agencyName ?? 'advertiser'}`,
              bodyV2: { markdown: `${ad.url}\n\n${ad.title}\n${ad.priceAsWritten ?? ''} · ${ad.location}\n\n${ad.text.slice(0, 1200)}${phone ? `\n\nPhone in the ad: ${phone}` : ''}` },
            }),
          );
          if (note) await board.client.rest('POST', 'noteTargets', { noteId: note, targetHomeId: same });
          Object.assign(row, { state: 'upserted', homeId: same, mergedInto: same });
        } catch (e) {
          row.error = (e as Error).message.slice(0, 200);
        }
      }
      continue;
    }
    const nameKey = ad.agencyName?.trim().toLowerCase();
    let host = (phone && board.hostByPhone.get(phone)) || (!phone && nameKey && board.hostByName.get(nameKey)) || null;
    const hBody = clean(webHostBody(ad, read, phones, adapter.label));
    const body = (photoUrls: string[]) =>
      clean(webHomeBody(ad, read, { siteLabel: adapter.label, photoUrls, phone, hostName: String(hBody.name), readVersion: row.readVersion ?? WEB_PROMPT_VERSION, discoveredAt: row.listedAt }));
    if (!APPLY) {
      const b = body(ad.photos.slice(0, 6));
      console.log(`  + ${row.sourceId} → home "${b.title}" ${b.zone ?? '(no zone)'} ${read.priceRwf ?? '?'} RWF · host ${host ? `existing ${host.id}` : `new "${hBody.name}"`} ${phone ?? '(no phone)'} · ${Math.min(6, ad.photos.length)} photo(s)`);
      homes++;
      if (!host) hosts++;
      if (key) board.homeByFacts.set(key, `(planned ${row.sourceId})`);
      if (!host && phone) board.hostByPhone.set(phone, { id: `(planned ${hBody.name})` });
      if (!host && nameKey) board.hostByName.set(nameKey, { id: `(planned ${hBody.name})` });
      continue;
    }
    try {
      const client = board.client!;
      if (!host) {
        const id = createdId(await client.rest('POST', 'hosts', hBody));
        host = { id, ...hBody };
        if (phone) board.hostByPhone.set(phone, host);
        if (nameKey) board.hostByName.set(nameKey, host);
        hosts++;
        try {
          await client.rest('POST', 'opportunities', clean({ name: `Onboard ${hBody.name} — ${adapter.label}`, onboardingStage: 'SCRAPED', homesCount: 1, hostId: id }));
        } catch (e) {
          console.warn(`  ! opportunity for ${hBody.name}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      row.photos = row.photos?.length ? row.photos : await downloadPhotos(row);
      const homeId = createdId(await client.rest('POST', 'homes', { ...body(await uploadPhotos(row)), hostId: host.id }));
      Object.assign(row, { state: 'upserted', homeId, hostId: String(host.id) });
      if (key) board.homeByFacts.set(key, homeId);
      board.homeBySource.set(row.sourceId, { id: homeId });
      homes++;
      console.log(`  ✓ ${row.sourceId} → home ${homeId}`);
    } catch (e) {
      row.error = (e as Error).message.slice(0, 200);
      console.warn(`  ! ${row.sourceId}: ${row.error}`);
      if (/source|enum|option/i.test(row.error)) console.warn('    (is WEB in Twenty\'s `source` select yet? pnpm crm:sync-options --apply)');
    }
    saveLedger(adapter.site, ledger);
  }
  saveLedger(adapter.site, ledger);
  console.log(`upsert ${adapter.site}: ${homes} new home(s), ${hosts} new host(s), ${joined} joined an existing home`);
  return { homes, hosts, joined };
}

// ── run + status ─────────────────────────────────────────────────────────────
function pickAdapters(): SiteAdapter[] {
  const want = argv('site')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!want.length) return ADAPTERS;
  const unknown = want.filter((w) => !ADAPTERS.some((a) => a.site === w));
  if (unknown.length) throw new Error(`unknown site(s): ${unknown.join(', ')} — have ${ADAPTERS.map((a) => a.site).join(', ')}`);
  return ADAPTERS.filter((a) => want.includes(a.site));
}

async function run(): Promise<void> {
  const adapters = pickAdapters();
  const readBudget = { left: READ_LIMIT };
  const totals: Record<string, { new: number; homes: number; joined: number; skipped: number }> = {};
  const stops: string[] = [];
  const collected: Record<string, CollectStats> = {};
  for (const a of adapters) {
    // A site that refuses us today is skipped, not retried in a loop.
    try {
      collected[a.site] = await collect(a, readBudget);
      if (collected[a.site]!.stop) stops.push(collected[a.site]!.stop!);
    } catch (e) {
      stops.push(`${a.site}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  const board = await loadBoard();
  for (const a of adapters) {
    const u = await upsert(a, board);
    const c = collected[a.site];
    totals[a.site] = { new: c?.listed ?? 0, homes: u.homes, joined: u.joined, skipped: c?.skipped ?? 0 };
  }
  const line = Object.entries(totals)
    .map(([s, t]) => `${s} +${t.new} ad(s) → ${t.homes} home(s)${t.joined ? `, ${t.joined} matched` : ''}`)
    .join(' · ');
  console.log(`\n${APPLY ? '' : '(dry run) '}${line}${stops.length ? `\nstopped: ${stops.join('; ')}` : ''}`);
  if (APPLY) await recordRun('web-ads', stops.length < adapters.length, stops.join('; '));
  if (APPLY && flag('notify')) {
    const homes = Object.values(totals).reduce((n, t) => n + t.homes, 0);
    const joined = Object.values(totals).reduce((n, t) => n + t.joined, 0);
    if (homes || joined || stops.length) await postToMkan(`🌐 Web ads: ${homes} new VETTING home(s), ${joined} matched a home already on the board — ${line}${stops.length ? `\n⚠️ ${stops.join('; ')}` : ''}`);
  }
}

function status(): void {
  for (const a of ADAPTERS) {
    const rows = Object.values(loadLedger(a.site));
    const by = (k: (r: AdRow) => string) => rows.reduce<Record<string, number>>((acc, r) => ((acc[k(r)] = (acc[k(r)] ?? 0) + 1), acc), {});
    console.log(`\n${a.label} (${a.site}): ${rows.length} ad(s)`);
    for (const [s, n] of Object.entries(by((r) => r.state))) console.log(`  ${s.padEnd(10)} ${n}`);
    const skips = by((r) => (r.state === 'skipped' ? (r.skipReason ?? '?') : ''));
    delete skips[''];
    for (const [r, n] of Object.entries(skips).sort((x, y) => y[1] - x[1]).slice(0, 8)) console.log(`    ${String(n).padStart(4)}  ${r}`);
  }
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'survey':
      return survey();
    case 'run':
      return run();
    case 'status':
      return status();
    default:
      console.log(readFileSync(__filename, 'utf8').split('*/')[0]);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    if (APPLY) void recordRun('web-ads', false, (e as Error).message).finally(() => process.exit(1));
    else process.exit(1);
  });
}
