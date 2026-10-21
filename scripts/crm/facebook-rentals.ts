/**
 * The Facebook lane — Kigali rentals posted in Facebook groups and on Marketplace → the mkan CRM.
 *
 *   pnpm crm:fb-rentals seeds   [--add=<group or marketplace url>] [--remove=<url>]
 *   pnpm crm:fb-rentals capture [--limit=N] [--scrolls=6] [--probe]   seeds → ledger (scrape Chrome)
 *   pnpm crm:fb-rentals read    [--read-limit=N]                      the TikTok reader on post text + photos
 *   pnpm crm:fb-rentals upsert  [--apply]                             photos → S3, host + home (VETTING) → Twenty
 *   pnpm crm:fb-rentals run     [--apply] [--notify]                  all three
 *   pnpm crm:fb-rentals status
 *
 * It drives the DEDICATED scrape account only (FB_SCRAPE_PORT / FB_SCRAPE_PROFILE,
 * `bash ~/.claude/bin/chrome-scrape.sh`) — never the session vault on 9222, which
 * is Abdout's own browser and carries the social pipeline's Page tokens. The bot
 * never searches, joins or posts: a human curates the seed groups (the scrape
 * account must already see them) and Marketplace searches. One tab, a delay with
 * jitter between pages, and a checkpoint or login wall stops the run.
 *
 * Posts come from Facebook's own GraphQL responses (and the JSON it embeds in the
 * first page) rather than from screen text: the selectors move monthly, the
 * data shapes far less. Every read, gate, dedupe key and Twenty body is the
 * TikTok lane's, so a home posted on both lands once.
 *
 * Only `upsert --apply` writes anywhere shared. Nothing publishes: a home lands at
 * VETTING, as TikTok's do. Documented at kun.databayt.org/docs/scrape.
 */
import { config } from 'dotenv';
config({ override: true });

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AnthropicCap, anthropicKey, runAnthropic } from './anthropic-reader';
import { createCdpSession, requireScrapePort, type CdpSession } from './cdp-session';
import { GroqLimit, runGroq } from './groq-reader';
import { postToMkan } from './notify';
import { FACEBOOK_PROMPT_VERSION, buildFacebookPrompt } from './tiktok-read-prompt';
import { twentyClient } from './twenty-rest';
import { phonesFromTwenty, twentyPhones } from '../../src/lib/phone';
import { dupKey, homeBody, hostBody, looksLikeRental, parseTikTokRead, phonesFor, skipReasonFor, type TikTokRead, type VideoRow } from './tiktok-pure';

// ── argv ─────────────────────────────────────────────────────────────────────
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const flag = (n: string): boolean => process.argv.includes(`--${n}`);
const APPLY = flag('apply');
const LIMIT = Number(argv('limit', '0')) || Infinity;
const READ_LIMIT = Number(argv('read-limit', '0')) || Infinity;
const MAX_AGE_DAYS = Number(argv('max-age', '7'));
const SCROLLS = Number(argv('scrolls', '6'));
const cmd = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'help';

const DATA = join(process.cwd(), 'scripts/crm/.data/fb-rentals');
const POSTS = join(DATA, 'posts.json');
const SEEDS = join(DATA, 'seeds.json');
const PHOTOS = join(DATA, 'photos');
const PROBE = join(DATA, 'probe');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms + Math.floor(Math.random() * ms * 0.6);
const now = () => new Date().toISOString();

// ── the ledger ───────────────────────────────────────────────────────────────
type PostState = 'captured' | 'read' | 'upserted' | 'skipped' | 'failed';
interface PostRow {
  postId: string;
  kind: 'group' | 'marketplace';
  url: string;
  seed: string;
  author: string | null;
  authorId: string | null;
  text: string;
  createdAt: number | null;
  photoUrls: string[];
  capturedAt: string;
  state: PostState;
  skipReason?: string;
  photos?: string[];
  read?: TikTokRead;
  readVersion?: string;
  homeId?: string;
  hostId?: string;
  error?: string;
}
interface SeedRow {
  url: string;
  addedAt: string;
  lastCapturedAt?: string;
  lastFound?: number;
}

function readJson<T>(file: string, empty: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : empty;
}
function writeJson(file: string, value: unknown): void {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${file}.tmp`, file);
}
const loadPosts = () => readJson<Record<string, PostRow>>(POSTS, {});
const savePosts = (p: Record<string, PostRow>) => writeJson(POSTS, p);
const loadSeeds = () => readJson<Record<string, SeedRow>>(SEEDS, {});
const tooOld = (ts: number | null) => ts != null && Date.now() / 1000 - ts > MAX_AGE_DAYS * 86400;

// ── capture ──────────────────────────────────────────────────────────────────
type Found = Omit<PostRow, 'seed' | 'capturedAt' | 'state'>;

/** The first value under `key` anywhere inside `node`, breadth-first, a few levels deep. */
function firstDeep<T>(node: unknown, pick: (o: Record<string, unknown>) => T | undefined, depth = 8): T | undefined {
  let level: unknown[] = [node];
  for (let d = 0; d < depth && level.length; d++) {
    const next: unknown[] = [];
    for (const n of level) {
      if (!n || typeof n !== 'object') continue;
      const hit = Array.isArray(n) ? undefined : pick(n as Record<string, unknown>);
      if (hit !== undefined) return hit;
      next.push(...(Array.isArray(n) ? n : Object.values(n)));
    }
    level = next;
  }
  return undefined;
}

/** Every Facebook CDN image inside `node`, largest-looking first, deduped. */
function imagesIn(node: unknown, max = 8): string[] {
  const out: string[] = [];
  const walk = (n: unknown, d: number) => {
    if (!n || typeof n !== 'object' || d > 14 || out.length >= max) return;
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (k === 'uri' && typeof v === 'string' && /scontent|fbcdn/.test(v) && !/\/[sp](?:32|40|50|60|80)x(?:32|40|50|60|80)\//.test(v) && !out.includes(v)) out.push(v);
      else if (typeof v === 'object') walk(v, d + 1);
    }
  };
  walk(node, 0);
  return out;
}

/**
 * Posts inside one GraphQL payload: a group `Story` (post_id + message), or a
 * Marketplace listing (marketplace_listing_title). Pure — the parser is the
 * part Facebook changes, so it is the part kept testable.
 */
export function postsIn(payload: unknown): Found[] {
  const out = new Map<string, Found>();
  const walk = (n: unknown, d: number) => {
    if (!n || typeof n !== 'object' || d > 40) return;
    if (Array.isArray(n)) {
      for (const x of n) walk(x, d + 1);
      return;
    }
    const o = n as Record<string, unknown>;
    if (o.__typename === 'Story' && typeof o.post_id === 'string' && !out.has(o.post_id)) {
      const text = firstDeep(o, (x) => (x.message && typeof (x.message as { text?: unknown }).text === 'string' ? ((x.message as { text: string }).text) : undefined)) ?? '';
      if (text) {
        const actor = firstDeep(o, (x) => (Array.isArray(x.actors) && x.actors[0] ? (x.actors[0] as { name?: string; id?: string }) : undefined));
        const url =
          (typeof o.permalink_url === 'string' ? o.permalink_url : undefined) ??
          firstDeep(o, (x) => (typeof x.url === 'string' && /facebook\.com\/(groups|permalink|story|.*\/posts)/.test(x.url) ? x.url : undefined));
        out.set(o.post_id, {
          postId: o.post_id,
          kind: 'group',
          url: url ?? `https://www.facebook.com/${o.post_id}`,
          author: actor?.name ?? null,
          authorId: actor?.id ?? null,
          text,
          createdAt: firstDeep(o, (x) => (typeof x.creation_time === 'number' ? x.creation_time : undefined)) ?? null,
          photoUrls: imagesIn(o),
        });
      }
    }
    if (typeof o.marketplace_listing_title === 'string' && typeof o.id === 'string' && !out.has(`mp:${o.id}`)) {
      const price = (o.listing_price as { formatted_amount?: string; amount?: string } | undefined) ?? undefined;
      const city = firstDeep(o.location ?? {}, (x) => (typeof x.display_name === 'string' ? x.display_name : typeof x.city === 'string' ? x.city : undefined));
      const seller = firstDeep(o, (x) => (x.marketplace_listing_seller && typeof x.marketplace_listing_seller === 'object' ? (x.marketplace_listing_seller as { name?: string; id?: string }) : undefined));
      const desc = firstDeep(o, (x) => (x.redacted_description && typeof (x.redacted_description as { text?: unknown }).text === 'string' ? (x.redacted_description as { text: string }).text : undefined)) ?? '';
      out.set(`mp:${o.id}`, {
        postId: `mp:${o.id}`,
        kind: 'marketplace',
        url: `https://www.facebook.com/marketplace/item/${o.id}/`,
        author: seller?.name ?? null,
        authorId: seller?.id ?? null,
        text: [o.marketplace_listing_title, price?.formatted_amount ?? price?.amount, city, desc].filter(Boolean).join(' · '),
        createdAt: typeof o.creation_time === 'number' ? o.creation_time : null,
        photoUrls: imagesIn(o, 6),
      });
    }
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, d + 1);
  };
  walk(payload, 0);
  return [...out.values()];
}

/** Facebook answers GraphQL as several JSON documents per body, sometimes behind `for (;;);`. */
function jsonDocs(body: string): unknown[] {
  const out: unknown[] = [];
  for (const line of body.replace(/^for \(;;\);/, '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* a partial chunk */
    }
  }
  return out;
}

async function pageState(s: CdpSession): Promise<'ok' | 'checkpoint' | 'login'> {
  const v = await s.evaluate<{ href: string; text: string }>(`({ href: location.href, text: (document.body?.innerText || '').slice(0, 4000) })`);
  if (/checkpoint|confirm your identity|we limit how often|temporarily blocked|suspicious/i.test(`${v.href} ${v.text}`)) return 'checkpoint';
  if (/\/login|log in to facebook|log into facebook/i.test(`${v.href} ${v.text.slice(0, 600)}`)) return 'login';
  return 'ok';
}

async function captureSeed(s: CdpSession, url: string, delayMs: number): Promise<{ found: Found[]; stop?: string }> {
  const bodies: string[] = [];
  const pending = new Set<string>();
  const onResponse = (p: { requestId: string; response: { url: string } }) => {
    if (p.response.url.includes('/api/graphql')) pending.add(p.requestId);
  };
  const onFinished = async (p: { requestId: string }) => {
    if (!pending.delete(p.requestId)) return;
    try {
      const r = await s.send<{ body: string; base64Encoded: boolean }>('Network.getResponseBody', { requestId: p.requestId });
      bodies.push(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body);
    } catch {
      /* evicted from the buffer */
    }
  };
  s.on('Network.responseReceived', onResponse);
  s.on('Network.loadingFinished', onFinished);
  try {
    await s.send('Network.enable', { maxResourceBufferSize: 20_000_000, maxTotalBufferSize: 100_000_000 });
    await s.navigate(url);
    await sleep(jitter(delayMs / 2));
    const state = await pageState(s);
    if (state !== 'ok') return { found: [], stop: state === 'checkpoint' ? 'CHECKPOINT' : 'login wall — the scrape session is signed out' };
    // The first page arrives as JSON embedded in the HTML, the rest as GraphQL while scrolling.
    const embedded = await s.evaluate<string[]>(`[...document.querySelectorAll('script[type="application/json"]')].map(x => x.textContent).filter(t => t && (t.includes('post_id') || t.includes('marketplace_listing_title')))`);
    bodies.push(...embedded);
    for (let i = 0; i < SCROLLS; i++) {
      await s.evaluate(`window.scrollBy(0, document.body.scrollHeight)`);
      await sleep(jitter(delayMs / 2));
    }
    await sleep(1500);
  } finally {
    s.off('Network.responseReceived', onResponse);
    s.off('Network.loadingFinished', onFinished);
  }
  if (flag('probe')) {
    mkdirSync(PROBE, { recursive: true });
    writeFileSync(join(PROBE, `${Date.now()}.txt`), bodies.join('\n\n=====\n\n'));
  }
  const found = new Map<string, Found>();
  for (const b of bodies) for (const doc of jsonDocs(b)) for (const p of postsIn(doc)) if (!found.has(p.postId)) found.set(p.postId, p);
  return { found: [...found.values()] };
}

async function capture(): Promise<{ added: number; stop?: string }> {
  const { port, delayMs } = requireScrapePort();
  const seeds = loadSeeds();
  const posts = loadPosts();
  const urls = Object.keys(seeds).slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(`\ncapture: ${urls.length} seed(s) on the scrape browser :${port}, delay ~${delayMs}ms`);
  if (!urls.length) {
    console.log('  no seeds — add a group or Marketplace search the scrape account can see: pnpm crm:fb-rentals seeds --add=<url>');
    return { added: 0 };
  }
  const s = await createCdpSession(port, 'about:blank');
  let added = 0;
  let stop: string | undefined;
  try {
    for (const url of urls) {
      const r = await captureSeed(s, url, delayMs);
      if (r.stop) {
        stop = r.stop;
        console.warn(`  ■ ${r.stop} — stopping; a human logs in once (bash ~/.claude/bin/chrome-scrape.sh). Nothing retries.`);
        break;
      }
      let fresh = 0;
      let stale = 0;
      let notRental = 0;
      for (const p of r.found) {
        if (posts[p.postId]) continue;
        if (tooOld(p.createdAt)) {
          stale++;
          continue;
        }
        const keep = looksLikeRental(p.text, true);
        posts[p.postId] = { ...p, seed: url, capturedAt: now(), state: keep ? 'captured' : 'skipped', skipReason: keep ? undefined : 'text does not read as a rental' };
        keep ? fresh++ : notRental++;
      }
      Object.assign(seeds[url]!, { lastCapturedAt: now(), lastFound: r.found.length });
      added += fresh;
      console.log(`  ${url.slice(0, 90)}: ${r.found.length} post(s) · +${fresh} new${stale ? ` · ${stale} older than ${MAX_AGE_DAYS}d` : ''}${notRental ? ` · ${notRental} not a rental` : ''}`);
      savePosts(posts);
      await sleep(jitter(delayMs));
    }
  } finally {
    await s.close();
    writeJson(SEEDS, seeds);
  }
  return { added, stop };
}

// ── read ─────────────────────────────────────────────────────────────────────
async function downloadPhotos(row: PostRow): Promise<string[]> {
  const dir = join(PHOTOS, row.postId.replace(/[^\w-]/g, '_'));
  mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const [i, u] of row.photoUrls.slice(0, 6).entries()) {
    try {
      const res = await fetch(u, { headers: { 'User-Agent': UA } });
      if (!res.ok) continue;
      const raw = join(dir, `${i + 1}.img`);
      writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      const jpg = join(dir, `${i + 1}.jpg`);
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, '-frames:v', '1', '-vf', "scale='min(720,iw)':-2", '-q:v', '3', jpg]);
      rmSync(raw, { force: true });
      if (existsSync(jpg)) out.push(jpg);
    } catch {
      /* next photo */
    }
  }
  return out;
}

async function readStage(): Promise<{ read: number; stop?: string }> {
  const posts = loadPosts();
  const queue = Object.values(posts)
    .filter((p) => p.state === 'captured')
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, READ_LIMIT === Infinity ? undefined : READ_LIMIT);
  const reader = anthropicKey() ? 'anthropic' : 'groq';
  console.log(`\nread: ${queue.length} post(s) · ${FACEBOOK_PROMPT_VERSION}/${reader}`);
  let read = 0;
  let stop: string | undefined;
  for (const row of queue) {
    try {
      row.photos = row.photos?.length ? row.photos : await downloadPhotos(row);
      const prompt = buildFacebookPrompt({
        handle: row.author ?? 'unknown',
        channel: null,
        caption: row.text,
        uploadedAt: row.createdAt ? new Date(row.createdAt * 1000).toISOString().slice(0, 10) : null,
        frames: row.photos.map((_, i) => `photo ${i + 1}`),
      });
      const text = reader === 'anthropic' ? await runAnthropic({ prompt, images: row.photos }) : await runGroq({ prompt, images: row.photos.slice(0, 3) });
      const r = parseTikTokRead(text);
      row.read = r;
      row.readVersion = `${FACEBOOK_PROMPT_VERSION}/${reader}`;
      const skip = skipReasonFor(r, { caption: row.text });
      Object.assign(row, skip ? { state: 'skipped', skipReason: skip } : { state: 'read' });
      delete row.error;
      read++;
      console.log(`  ${skip ? '·' : '✓'} ${row.postId} ${row.author ?? ''} · ${skip ?? `${r.bedrooms ?? '?'}bd ${r.propertyType ?? '?'} ${r.priceRwf ?? '?'} RWF/${r.period} · ${r.neighbourhood ?? r.district ?? '?'} · ${r.phones.length} phone(s) · conf ${r.confidence}`}`);
    } catch (e) {
      if (e instanceof AnthropicCap || e instanceof GroqLimit) {
        stop = (e as Error).message.slice(0, 200);
        console.warn(`  ■ ${stop} — the rest wait for the next run`);
        break;
      }
      row.error = (e as Error).message.slice(0, 200);
      console.warn(`  ! ${row.postId}: ${row.error}`);
    }
    savePosts(posts);
  }
  savePosts(posts);
  return { read, stop };
}

// ── upsert ───────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>;
const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))) as Partial<T>;
const createdId = (res: unknown): string => {
  const d = (res as { data?: Row })?.data ?? (res as Row);
  const rec = (d as Row)?.createHome ?? (d as Row)?.createHost ?? (d as Row)?.createOpportunity ?? d;
  return String((rec as Row)?.id ?? '');
};

/** A post in the shape the TikTok bodies read; `handle` is the poster's display name. */
function asVideoRow(p: PostRow): VideoRow {
  return {
    videoId: p.postId,
    url: p.url,
    handle: p.author ?? 'facebook',
    via: 'seed',
    discoveredAt: p.capturedAt,
    state: 'read',
    meta: { caption: p.text, uploader: p.author ?? '', channel: p.author, timestamp: p.createdAt, duration: null, views: null },
  };
}

/** The dupKey of a home already in Twenty, from its own fields — so TikTok's homes count too. */
function homeKey(h: Row): string | null {
  const micros = (h.priceMonthLocal as { amountMicros?: number } | null)?.amountMicros;
  const place = (h.homeAddress as { addressStreet1?: string } | null)?.addressStreet1 ?? null;
  return dupKey('', { priceRwf: micros ? micros / 1e6 : null, bedrooms: (h.bedrooms as number | null) ?? null, neighbourhood: place });
}

async function uploadPhotos(row: PostRow): Promise<string[]> {
  const s3 = await import('@/lib/s3');
  if (!s3.isS3Configured()) throw new Error('S3 is not configured (AWS_* in .env) — photos cannot be stored');
  const ns = process.env.NEXT_PUBLIC_CDN_NAMESPACE?.trim() || 'mkan';
  const urls: string[] = [];
  for (const [i, p] of (row.photos ?? []).entries()) {
    const url = await s3.putObject({
      key: `${ns}/uploads/facebook/${row.postId.replace(/[^\w-]/g, '_')}/${i + 1}.jpg`,
      body: readFileSync(p),
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    if (url) urls.push(url);
  }
  return urls;
}

async function upsert(): Promise<{ homes: number; hosts: number; joined: number }> {
  const posts = loadPosts();
  const queue = Object.values(posts).filter((p) => p.state === 'read' && p.read);
  console.log(`\nupsert: ${queue.length} read post(s) → Twenty ${APPLY ? '(APPLY)' : '(dry run — pass --apply to write)'}`);
  if (!queue.length) return { homes: 0, hosts: 0, joined: 0 };
  const client = twentyClient();
  const [hosts, homes] = await Promise.all([client.all('hosts'), client.all('homes')]);
  const homeBySource = new Map(homes.filter((h) => h.sourceId).map((h) => [String(h.sourceId), h]));
  const homeByFacts = new Map<string, string>();
  for (const h of homes) {
    const k = homeKey(h);
    if (k && !homeByFacts.has(k)) homeByFacts.set(k, String(h.id));
  }
  const hostByPhone = new Map<string, Row>();
  for (const h of hosts) for (const n of [...phonesFromTwenty(h.phone as never, 'RW'), ...phonesFromTwenty(h.whatsapp as never, 'RW')]) if (n.startsWith('+250')) hostByPhone.set(n, h);

  let newHomes = 0;
  let newHosts = 0;
  let joined = 0;
  for (const row of queue) {
    const read = row.read!;
    const sourceId = `facebook:${row.postId}`;
    if (homeBySource.has(sourceId)) {
      Object.assign(row, { state: 'upserted', homeId: String(homeBySource.get(sourceId)!.id) });
      continue;
    }
    const v = asVideoRow(row);
    const phones = phonesFor(read, row.text);
    const phone = phones[0] ?? null;
    // The same home, already on the board from TikTok or another post: a note on it, not a copy.
    const key = dupKey('', read);
    const same = key ? homeByFacts.get(key) : undefined;
    if (same) {
      joined++;
      console.log(`  ≡ ${row.postId} — same facts as home ${same}${APPLY ? '; noted on it' : '; would note it there'}`);
      if (APPLY) {
        try {
          const note = createdId(await client.rest('POST', 'notes', { title: `Also on Facebook — ${row.author ?? 'unknown poster'}`, bodyV2: { markdown: `${row.url}\n\n${row.text.slice(0, 1500)}${phone ? `\n\nPhone in the post: ${phone}` : ''}` } }));
          if (note) await client.rest('POST', 'noteTargets', { noteId: note, targetHomeId: same });
          Object.assign(row, { state: 'upserted', homeId: same });
        } catch (e) {
          row.error = (e as Error).message.slice(0, 200);
        }
      }
      continue;
    }
    let host = (phone && hostByPhone.get(phone)) || null;
    const hBody = clean({
      ...hostBody(v, read, phone),
      tiktokHandle: undefined,
      phone: twentyPhones(phone, phones.slice(1)),
      source: 'FACEBOOK',
      contactFoundVia: 'FACEBOOK',
      facebookUrl: row.authorId ? { primaryLinkUrl: `https://www.facebook.com/${row.authorId}`, primaryLinkLabel: 'Facebook' } : undefined,
      notes: `Facebook ${row.kind === 'marketplace' ? 'Marketplace' : 'group'} poster — ${row.url}`,
    });
    const body = (frameUrls: string[]) =>
      clean({
        ...homeBody(v, read, { frameUrls, phone, hostName: String(hBody.name), promptVersion: row.readVersion ?? FACEBOOK_PROMPT_VERSION, duplicate: false, sourceId }),
        source: 'FACEBOOK',
        sourceUrl: { primaryLinkUrl: row.url, primaryLinkLabel: 'Facebook' },
      });
    if (!APPLY) {
      const b = body((row.photos ?? []).map((_, i) => `s3://…/${i + 1}.jpg`));
      console.log(`  + ${sourceId} → home "${b.title}" ${b.zone ?? '(no zone)'} · host ${host ? `existing ${host.id}` : `new ${hBody.name}`} ${phone ?? '(no phone)'} · ${(row.photos ?? []).length} photo(s)`);
      newHomes++;
      if (!host) newHosts++;
      if (key) homeByFacts.set(key, `(planned ${sourceId})`);
      continue;
    }
    try {
      if (!host) {
        const id = createdId(await client.rest('POST', 'hosts', hBody));
        host = { id, ...hBody };
        if (phone) hostByPhone.set(phone, host);
        newHosts++;
        try {
          await client.rest('POST', 'opportunities', clean({ name: `Onboard ${hBody.name} — Facebook`, onboardingStage: 'SCRAPED', homesCount: 1, hostId: id }));
        } catch (e) {
          console.warn(`  ! opportunity for ${hBody.name}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      const homeId = createdId(await client.rest('POST', 'homes', { ...body(await uploadPhotos(row)), hostId: host.id }));
      Object.assign(row, { state: 'upserted', homeId, hostId: String(host.id) });
      if (key) homeByFacts.set(key, homeId);
      newHomes++;
      console.log(`  ✓ ${sourceId} → home ${homeId}`);
    } catch (e) {
      row.error = (e as Error).message.slice(0, 200);
      console.warn(`  ! ${row.postId}: ${row.error}`);
    }
    savePosts(posts);
  }
  savePosts(posts);
  console.log(`upsert: ${newHomes} new home(s), ${newHosts} new host(s), ${joined} joined an existing home`);
  return { homes: newHomes, hosts: newHosts, joined };
}

// ── seeds + status ───────────────────────────────────────────────────────────
function seedsCmd(): void {
  const seeds = loadSeeds();
  const add = argv('add');
  const remove = argv('remove');
  if (add) {
    for (const u of add.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (!/^https:\/\/(www|web|m)\.facebook\.com\/(groups\/|marketplace\/)/.test(u)) {
        console.warn(`  ! not a group or Marketplace URL: ${u}`);
        continue;
      }
      seeds[u] ??= { url: u, addedAt: now() };
      console.log(`  + ${u}`);
    }
    writeJson(SEEDS, seeds);
  }
  if (remove && seeds[remove]) {
    delete seeds[remove];
    writeJson(SEEDS, seeds);
    console.log(`  - ${remove}`);
  }
  for (const s of Object.values(seeds)) console.log(`  ${s.url}${s.lastCapturedAt ? ` · last ${s.lastCapturedAt.slice(0, 10)}, ${s.lastFound} post(s)` : ' · never captured'}`);
  if (!Object.keys(seeds).length) console.log('  no seeds yet');
}

function status(): void {
  const posts = Object.values(loadPosts());
  const by = (k: (p: PostRow) => string) => posts.reduce<Record<string, number>>((a, p) => ((a[k(p)] = (a[k(p)] ?? 0) + 1), a), {});
  console.log(`\nFacebook rentals ledger: ${posts.length} post(s)`);
  for (const [s, n] of Object.entries(by((p) => p.state))) console.log(`  ${s.padEnd(10)} ${n}`);
  const skips = by((p) => (p.state === 'skipped' ? (p.skipReason ?? '?') : ''));
  delete skips[''];
  if (Object.keys(skips).length) console.log('skipped because:');
  for (const [r, n] of Object.entries(skips).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${r}`);
  console.log(`seeds: ${Object.keys(loadSeeds()).length}`);
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'seeds':
      return seedsCmd();
    case 'status':
      return status();
    case 'capture':
      return void (await capture());
    case 'read':
      return void (await readStage());
    case 'upsert':
      return void (await upsert());
    case 'run': {
      const c = await capture();
      const r = c.stop ? { read: 0 } : await readStage();
      const u = await upsert();
      if (APPLY && flag('notify') && (u.homes || u.joined || c.stop)) {
        await postToMkan(
          c.stop
            ? `⛔ Facebook rentals stopped: ${c.stop}. A human logs in once on the scrape account.`
            : `🏠 Facebook rentals: +${c.added} post(s), ${r.read} read, ${u.homes} new VETTING home(s), ${u.joined} matched a home already on the board.`,
        );
      }
      return;
    }
    default:
      console.log(readFileSync(__filename, 'utf8').split('*/')[0]);
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
}
