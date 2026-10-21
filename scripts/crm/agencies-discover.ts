/**
 * Kigali estate agencies from Google Maps → the broker directory.
 *
 *   pnpm crm:agencies                     search + detail up to 20 places
 *   pnpm crm:agencies --limit 5           cap the places detailed this run
 *   pnpm crm:agencies --refresh           search again even if searched this week
 *   pnpm crm:agencies --query "…"         one extra search on top of the defaults
 *   pnpm crm:agencies status              what the ledger holds
 *
 * Brokers on TikTok are one half of Kigali's monthly market; the other half is
 * agencies with an office, a Maps pin and a website. They never post on
 * TikTok, so the agent never knew to ask them. This finds them:
 *
 *   1. search Maps for each query and collect the place links,
 *   2. open each place for its phone, website, address and pin,
 *   3. fetch the website for a mobile and a WhatsApp link (Maps often lists a
 *      landline, which cannot take a WhatsApp ask).
 *
 * It drives the session-vault Chrome on :9222 (Google Maps, read-only, no
 * sign-in needed) — the same CDP client as `cdp-session.ts`. That port is
 * refused for Facebook scraping on purpose (`requireScrapePort`); Maps is a
 * public read and carries none of the Page tokens that rule protects.
 *
 * Resumable: every place lands in `.data/agencies/agencies.json` and moves
 * found → detailed → done, so a killed run picks up where it stopped.
 * `crm:brokers` reads this ledger as kind AGENCY, sources ["maps"].
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCdpSession, type CdpSession } from './cdp-session';
import { contactsInHtml, coordsFromMapsUrl, normaliseRwPhone, placeIdFromMapsUrl } from './brokers-pure';
import { isInKigali } from '../../src/lib/geo/rwanda-places';

const argv = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[i + 1]! : fallback;
};
const LIMIT = Number(argv('limit', '20')) || 20;
const PORT = Number(argv('port', process.env.MAPS_CDP_PORT ?? '9222'));
const SCROLLS = Number(argv('scrolls', '8'));
const REFRESH = process.argv.includes('--refresh');
const cmd = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--')) ?? 'run';

export const QUERIES = ['real estate agency Kigali', 'immobilier Kigali', 'property management Kigali', 'house rental agency Kigali'];
const extra = argv('query', '');
const queries = extra ? [...QUERIES, extra] : QUERIES;
const SEARCH_EVERY_MS = 7 * 86_400_000;

const DATA = join(process.cwd(), 'scripts/crm/.data/agencies');
export const AGENCIES_LEDGER = join(DATA, 'agencies.json');
const SEARCHES = join(DATA, 'searches.json');

export interface AgencyRow {
  placeId: string;
  name: string;
  mapsUrl: string;
  query: string;
  state: 'found' | 'detailed' | 'done' | 'failed';
  foundAt: string;
  category?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  inKigali?: boolean;
  /** The number Maps shows (often a landline — kept as written). */
  mapsPhone?: string | null;
  website?: string | null;
  /** Mobiles found on Maps and the website, normalised +250… */
  phones?: string[];
  whatsapp?: string | null;
  email?: string | null;
  detailedAt?: string;
  siteAt?: string;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => ms + Math.floor(Math.random() * ms * 0.5);
const now = () => new Date().toISOString();
function readJson<T>(file: string, empty: T): T {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : empty;
}
function writeJson(file: string, value: unknown): void {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
  renameSync(`${file}.tmp`, file);
}
export const loadAgencies = () => readJson<Record<string, AgencyRow>>(AGENCIES_LEDGER, {});

/** Wait until `expr` is truthy in the page, or give up after `ms`. */
async function waitFor(s: CdpSession, expr: string, ms = 15_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await s.evaluate<boolean>(`!!(${expr})`).catch(() => false)) return true;
    await sleep(500);
  }
  return false;
}

async function search(s: CdpSession, query: string): Promise<{ name: string; url: string }[]> {
  await s.navigate(`https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`);
  await waitFor(s, `document.querySelector('div[role=feed]') || document.querySelector('a[href*="/maps/place/"]')`);
  for (let i = 0; i < SCROLLS; i++) {
    const end = await s.evaluate<boolean>(`(() => {
      const f = document.querySelector('div[role=feed]');
      if (!f) return true;
      f.scrollBy(0, 2500);
      return /end of the list|reached the end/i.test(f.innerText.slice(-400));
    })()`);
    await sleep(jitter(1500));
    if (end) break;
  }
  return s.evaluate<{ name: string; url: string }[]>(`[...document.querySelectorAll('a[href*="/maps/place/"]')]
    .map((a) => ({ name: (a.getAttribute('aria-label') || a.textContent || '').trim(), url: a.href }))
    .filter((p) => p.name && p.url)`);
}

async function detail(s: CdpSession, row: AgencyRow): Promise<void> {
  await s.navigate(row.mapsUrl.includes('hl=') ? row.mapsUrl : `${row.mapsUrl}${row.mapsUrl.includes('?') ? '&' : '?'}hl=en`);
  await waitFor(s, `document.querySelector('h1')`);
  await sleep(jitter(1500));
  const d = await s.evaluate<{ name: string | null; category: string | null; address: string | null; phone: string | null; website: string | null; url: string }>(`(() => {
    const q = (sel) => document.querySelector(sel);
    const label = (el) => el ? (el.getAttribute('aria-label') || el.textContent || '').replace(/^[^:]*:\\s*/, '').trim() : null;
    const phoneEl = q('button[data-item-id^="phone:tel:"]');
    return {
      name: q('h1') ? q('h1').textContent.trim() : null,
      category: label(q('button[jsaction*="category"]')),
      address: label(q('button[data-item-id="address"]')),
      phone: phoneEl ? phoneEl.getAttribute('data-item-id').replace('phone:tel:', '') : null,
      website: q('a[data-item-id="authority"]') ? q('a[data-item-id="authority"]').href : null,
      url: location.href,
    };
  })()`);
  const at = coordsFromMapsUrl(d.url) ?? coordsFromMapsUrl(row.mapsUrl);
  Object.assign(row, {
    name: d.name || row.name,
    category: d.category,
    address: d.address,
    lat: at?.lat ?? null,
    lng: at?.lng ?? null,
    inKigali: at ? isInKigali(at.lat, at.lng) : /kigali/i.test(d.address ?? ''),
    mapsPhone: d.phone,
    website: d.website,
    phones: [normaliseRwPhone(d.phone)].filter((p): p is string => !!p),
    state: 'detailed',
    detailedAt: now(),
  } satisfies Partial<AgencyRow>);
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' },
  }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.text().catch(() => '')).slice(0, 2_000_000);
}

/** The agency's own site: home page, then a contact page if the home page has no mobile. */
async function site(row: AgencyRow): Promise<void> {
  if (row.website) {
    const found = { phones: [...(row.phones ?? [])], whatsapp: null as string | null, email: null as string | null };
    const base = row.website;
    const pages = [base];
    for (const p of pages) {
      const html = await fetchText(p);
      if (html) {
        const c = contactsInHtml(html);
        for (const n of c.phones) if (!found.phones.includes(n)) found.phones.push(n);
        found.whatsapp ??= c.whatsapp;
        found.email ??= c.email;
        if (p === base && !c.phones.length) {
          const contact = html.match(/href=["']([^"']*contact[^"']*)["']/i)?.[1];
          if (contact) {
            try {
              pages.push(new URL(contact, base).toString());
            } catch {
              /* a broken href is not worth a failure */
            }
          }
        }
      }
      if (pages.length > 2) break;
    }
    Object.assign(row, found);
  }
  Object.assign(row, { state: 'done', siteAt: now() } satisfies Partial<AgencyRow>);
}

async function run(): Promise<void> {
  const rows = loadAgencies();
  const searches = readJson<Record<string, { at: string; found: number }>>(SEARCHES, {});
  const s = await createCdpSession(PORT);
  try {
    for (const q of queries) {
      const last = searches[q]?.at ? Date.parse(searches[q]!.at) : 0;
      if (!REFRESH && Date.now() - last < SEARCH_EVERY_MS) {
        console.log(`= "${q}" searched ${searches[q]!.at.slice(0, 10)} — skip (--refresh to redo)`);
        continue;
      }
      const places = await search(s, q).catch((e) => {
        console.warn(`  ! search "${q}": ${(e as Error).message.slice(0, 160)}`);
        return [];
      });
      let fresh = 0;
      for (const p of places) {
        const id = placeIdFromMapsUrl(p.url);
        if (!id || rows[id]) continue;
        rows[id] = { placeId: id, name: p.name, mapsUrl: p.url, query: q, state: 'found', foundAt: now() };
        fresh += 1;
      }
      searches[q] = { at: now(), found: places.length };
      writeJson(AGENCIES_LEDGER, rows);
      writeJson(SEARCHES, searches);
      console.log(`🔎 "${q}": ${places.length} place(s), ${fresh} new`);
      await sleep(jitter(2500));
    }

    const todo = Object.values(rows).filter((r) => r.state === 'found' || r.state === 'detailed').slice(0, LIMIT);
    console.log(`\n${todo.length} place(s) to detail (limit ${LIMIT})`);
    for (const row of todo) {
      try {
        if (row.state === 'found') {
          await detail(s, row);
          await sleep(jitter(2000));
        }
        await site(row);
        delete row.error;
        console.log(`  ✓ ${row.name.slice(0, 48).padEnd(48)} ${row.inKigali ? 'Kigali' : 'outside?'}  ${(row.phones ?? []).join(', ') || '(no mobile)'}${row.whatsapp ? `  wa ${row.whatsapp}` : ''}${row.website ? `  ${row.website}` : ''}`);
      } catch (e) {
        Object.assign(row, { state: 'failed', error: (e as Error).message.slice(0, 200) });
        console.warn(`  ! ${row.name}: ${row.error}`);
      }
      writeJson(AGENCIES_LEDGER, rows);
    }
  } finally {
    await s.close();
  }
  status();
}

function status(): void {
  const rows = Object.values(loadAgencies());
  const by = (k: AgencyRow['state']) => rows.filter((r) => r.state === k).length;
  const done = rows.filter((r) => r.state === 'done');
  console.log(
    `\n📒 agencies ledger: ${rows.length} place(s) — ${by('found')} found · ${by('detailed')} detailed · ${done.length} done · ${by('failed')} failed\n` +
      `   done: ${done.filter((r) => r.inKigali).length} in Kigali · ${done.filter((r) => r.phones?.length).length} with a mobile · ${done.filter((r) => r.whatsapp).length} with WhatsApp · ${done.filter((r) => r.website).length} with a website`,
  );
}

if (process.argv[1] && /agencies-discover\.ts$/.test(process.argv[1])) {
  (cmd === 'status' ? Promise.resolve(status()) : run()).catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
}
