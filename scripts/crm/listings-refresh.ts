/**
 * Keeps the Airbnb-sourced listings (Listing.source='AIRBNB') current.
 *
 *   pnpm listings:refresh                      dry run: counts + up to 10 example diffs
 *   pnpm listings:refresh --apply              write the diffs, stamp sourceCapturedAt, retire gone homes
 *   pnpm listings:refresh --limit 5            only the first N of today's slice
 *   pnpm listings:refresh --ids a,b            only these Listing ids (or Airbnb room ids)
 *   pnpm listings:refresh --ceiling 700        daily request ceiling (or LISTINGS_REFRESH_CEILING)
 *
 * Every home is visited within 7 days: each run takes the oldest-checked
 * ceil(total/7) homes (listings-refresh-pure.ts). One request per home, 2–6 s
 * apart, in a private headless Chrome (or `--cdp=<url>` for a hand run), through the
 * same parsePdp the PDP stage uses. Three blocks /
 * captchas / 429s in a row stop the run — the rest waits for tomorrow.
 *
 * What it refreshes: rating + review count (always), title/description (only
 * when the listing's canonical locale is English, the locale fetched), photos
 * (only while the row still holds Airbnb-hosted URLs; rehosted photos are ours
 * and stay). Price is left alone: a PDP without dates carries no nightly price,
 * and the stored one is a converted local-currency figure.
 *
 * "Gone" = two consecutive not-available/404 results. The miss count lives in
 * scripts/crm/.data/refresh/misses.json (no schema change); gone homes get
 * lostAt, lostReason='SOURCE_GONE', isPublished=false. Blocks and network errors
 * never count as a miss.
 *
 * Hygiene (TikTok/WEB homes) is not invoked here: crm:hygiene runs on its own
 * at 07:00 and executes on import, so it is not a clean call from this file.
 */
import { config } from 'dotenv';
config({ override: true });

import { chromium, type Browser, type Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePdp, parsePdpRating, readDeferredState } from './airbnb-parse';
import { recordRun } from './notify';
import {
  diffFields, goneVerdict, isAirbnbPhoto, pickSlice,
  type FetchResult, type Fields,
} from './listings-refresh-pure';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const val = (n: string): string | undefined => {
  const i = argv.findIndex((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
};

const APPLY = flag('apply');
const LIMIT = parseInt(val('limit') ?? '0', 10);
const IDS = (val('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CEILING = parseInt(val('ceiling') ?? process.env.LISTINGS_REFRESH_CEILING ?? '700', 10);
const CDP = val('cdp') ?? 'http://127.0.0.1:9222';
const MAX_BLOCKS = 3;
const DATA = join(__dirname, '.data', 'refresh');
const MISSES = join(DATA, 'misses.json');

type Misses = Record<string, { misses: number; at: string }>;
const readMisses = (): Misses => (existsSync(MISSES) ? JSON.parse(readFileSync(MISSES, 'utf8')) : {});
function writeMisses(m: Misses): void {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(`${MISSES}.tmp`, JSON.stringify(m, null, 2));
  renameSync(`${MISSES}.tmp`, MISSES);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 2000 + Math.random() * 4000;

interface Fetched { result: FetchResult; fresh?: Partial<Fields> }

async function fetchHome(page: Page, roomId: string, locale: 'en'): Promise<Fetched> {
  let status = 0;
  try {
    const res = await page.goto(`https://www.airbnb.com/rooms/${roomId}?locale=${locale}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    status = res?.status() ?? 0;
    if (status === 429 || status === 403) return { result: { kind: 'blocked' } };
    if (status === 404 || status === 410) return { result: { kind: 'not-found' } };
    await page.waitForTimeout(5000);
    const body = ((await page.evaluate(() => document.body?.innerText ?? '')) as string).slice(0, 4000);
    if (/captcha|verify you are human|unusual traffic/i.test(body)) return { result: { kind: 'blocked' } };
    const json = await readDeferredState(page);
    if (!json) {
      if (/no longer available|isn.t available|not available|can.t be found|page you.re looking for/i.test(body)) return { result: { kind: 'unavailable' } };
      return { result: { kind: 'error', message: `no deferred state (HTTP ${status})` } };
    }
    const pdp = parsePdp(json, JSON.stringify(json), roomId);
    if (!pdp.title && !pdp.description && !pdp.photos.length) return { result: { kind: 'unavailable' } };
    const { rating, reviews } = parsePdpRating(json);
    return {
      result: { kind: 'ok' },
      fresh: {
        averageRating: rating,
        numberOfReviews: reviews,
        title: pdp.title ? pdp.title.replace(/\s+/g, ' ').trim() : null,
        description: pdp.description,
        photoUrls: pdp.photos,
      },
    };
  } catch (e) {
    return { result: { kind: 'error', message: (e as Error).message.slice(0, 120) } };
  }
}

// A private headless Chrome by default: the 06:30 job must never open tabs in the Chrome Abdout works in
// (~/.claude/rules/browser.md). `--cdp=<url>` opts into a CDP browser for a hand run.
async function openBrowser(): Promise<{ browser: Browser; page: Page; own: boolean }> {
  if (!val('cdp')) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    return { browser, page: await (await browser.newContext({ locale: 'en-US' })).newPage(), own: true };
  }
  try {
    const browser = await chromium.connectOverCDP(CDP, { timeout: 15000 });
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    return { browser, page: await ctx.newPage(), own: false };
  } catch {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    return { browser, page: await (await browser.newContext({ locale: 'en-US' })).newPage(), own: true };
  }
}

async function main(): Promise<void> {
  const { db } = await import('../../src/lib/db');
  const now = new Date();
  console.log(`\n🔄 listings refresh  (${APPLY ? 'APPLY' : 'dry run'})\n`);

  const all = await db.listing.findMany({
    where: { source: 'AIRBNB', lostAt: null },
    select: {
      id: true, code: true, sourceListingId: true, sourceCapturedAt: true, canonicalLocale: true,
      pricePerNight: true, photoUrls: true, averageRating: true, numberOfReviews: true, title: true, description: true,
    },
  });
  let slice = IDS.length
    ? all.filter((l) => IDS.includes(String(l.id)) || (l.sourceListingId != null && IDS.includes(l.sourceListingId)))
    : pickSlice(all, now, { days: 7, cap: CEILING });
  slice = slice.filter((l) => l.sourceListingId);
  if (LIMIT) slice = slice.slice(0, LIMIT);
  slice = slice.slice(0, CEILING);
  console.log(`   ${all.length} live Airbnb listings · ${slice.length} to check today (ceiling ${CEILING})\n`);
  if (!slice.length) { await db.$disconnect(); return; }

  const { browser, page, own } = await openBrowser();
  const misses = readMisses();
  const tally = { checked: 0, changed: 0, missedOnce: 0, gone: 0, errors: 0, blocked: 0 };
  const perField: Record<string, number> = {};
  const examples: string[] = [];
  let blockStreak = 0;

  for (const l of slice) {
    const key = String(l.id);
    const prev = misses[key] ?? { misses: 0, at: '' };
    const { result, fresh } = await fetchHome(page, l.sourceListingId!, 'en');
    const label = l.code ?? String(l.id);

    if (result.kind === 'blocked') {
      tally.blocked++;
      if (++blockStreak >= MAX_BLOCKS) {
        console.error(`\n🛑 ${MAX_BLOCKS} blocks in a row at ${label} — stopping; the rest waits for tomorrow.`);
        break;
      }
      await sleep(jitter());
      continue;
    }
    blockStreak = 0;
    if (result.kind === 'error') {
      tally.errors++;
      console.warn(`  ! ${label}: ${result.message ?? 'error'}`);
      await sleep(jitter());
      continue;
    }

    const verdict = goneVerdict(prev, result);
    tally.checked++;
    if (result.kind === 'ok') {
      if (prev.misses) delete misses[key];
      // Never overwrite our own rehosted photos or a non-English text with the English fetch.
      const f = { ...fresh };
      if (!l.photoUrls.length || !l.photoUrls.every(isAirbnbPhoto)) delete f.photoUrls;
      if (l.canonicalLocale !== 'en') { delete f.title; delete f.description; }
      const diff = diffFields(l, f);
      const keys = Object.keys(diff);
      if (keys.length) {
        tally.changed++;
        for (const k of keys) perField[k] = (perField[k] ?? 0) + 1;
        if (examples.length < 10) examples.push(`${label}: ${keys.join(', ')}${diff.averageRating != null || diff.numberOfReviews != null ? ` (rating ${l.averageRating}→${diff.averageRating ?? l.averageRating}, reviews ${l.numberOfReviews}→${diff.numberOfReviews ?? l.numberOfReviews})` : ''}`);
      }
      if (APPLY) await db.listing.update({ where: { id: l.id }, data: { ...diff, sourceCapturedAt: now } });
    } else if (verdict.gone) {
      tally.gone++;
      if (examples.length < 10) examples.push(`${label}: GONE (2 misses)`);
      if (APPLY) {
        await db.listing.update({ where: { id: l.id }, data: { lostAt: now, lostReason: 'SOURCE_GONE', isPublished: false } });
        delete misses[key];
      }
    } else {
      tally.missedOnce++;
      if (APPLY) misses[key] = { misses: verdict.misses, at: now.toISOString() };
    }
    if (APPLY && tally.checked % 10 === 0) writeMisses(misses);
    await sleep(jitter());
  }

  if (APPLY) writeMisses(misses);
  await page.close().catch(() => {});
  if (own) await browser.close().catch(() => {});

  console.log('\n── refresh ─────────────────────────────');
  console.log(`  checked      ${tally.checked}`);
  console.log(`  changed      ${tally.changed}  ${JSON.stringify(perField)}`);
  console.log(`  missed once  ${tally.missedOnce}`);
  console.log(`  gone         ${tally.gone}`);
  console.log(`  errors       ${tally.errors}   blocked ${tally.blocked}`);
  if (examples.length) { console.log('\n  examples:'); for (const e of examples) console.log(`    ${e}`); }
  if (!APPLY) console.log('\nDRY RUN — re-run with --apply.');
  await db.$disconnect();
}

main()
  .then(() => (APPLY ? recordRun('listings:refresh', true) : undefined))
  .then(() => process.exit(0))
  .catch(async (e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    if (APPLY) await recordRun('listings:refresh', false, (e as Error).message);
    process.exit(1);
  });
