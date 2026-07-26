/**
 * Airbnb capability probe (Epic G1.2) — measures the facts the bbox crawler and
 * the bilingual PDP pass are built on, instead of guessing them.
 *
 * Answers four questions, all read-only, all against the logged-in vault Chrome:
 *
 *  1. session   — is this Chrome still logged into Airbnb?
 *  2. caps      — how deep does search pagination actually go before Airbnb cuts
 *                 it off?  That ceiling is what makes a bbox cell "saturated",
 *                 so it has to be a measured number, not folklore.
 *  3. locale    — does `?locale=ar` return Arabic, and is the locale STICKY on
 *                 the shared Chrome profile?  Sticky locale would silently
 *                 poison every later English fetch.
 *  4. ugc       — does `translate_ugc=false` return the host's ORIGINAL text?
 *                 That distinguishes "the host writes Arabic" (high signal —
 *                 local, reachable) from "Airbnb machine-translated it for us".
 *
 *   npx tsx scripts/crm/probe-caps.ts                    # all four
 *   npx tsx scripts/crm/probe-caps.ts --only=caps,locale
 *   npx tsx scripts/crm/probe-caps.ts --room=1475219497357463082
 *
 * Flags: --only=<session,caps,locale,ugc>  --room=<listingId>  --max-pages=<N>
 *        --cdp=<url>  --out=<path>
 */
import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { findSearchResults, parseSearchResult } from './airbnb-parse';

const arg = (name: string, def?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};

const CDP = arg('cdp', 'http://127.0.0.1:9222')!;
const MAX_PAGES = parseInt(arg('max-pages', '40')!, 10); // deliberately > any plausible cap
const OUT = arg('out', 'scripts/crm/.data/probe-caps.json')!;
const ONLY = (arg('only', 'session,caps,locale,ugc')!).split(',').map((s) => s.trim());
const SCRAPE_FILE = 'scripts/crm/.data/airbnb-scrape.json';

// Post-secession Sudan, the same box the bbox crawler will use.
const SUDAN = { swLat: 8.0, swLng: 21.5, neLat: 23.2, neLng: 39.0 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Arabic block + Arabic supplement + presentation forms. */
const AR_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const scriptOf = (s: string | null | undefined): 'ar' | 'latin' | 'none' => {
  if (!s || !s.trim()) return 'none';
  return AR_RE.test(s) ? 'ar' : 'latin';
};

async function readDeferredState(page: Page): Promise<any> {
  const text = await page.evaluate(() => {
    const s = [...document.querySelectorAll('script')].find((x) => (x.id || '').startsWith('data-deferred-state'));
    return s ? s.textContent : null;
  });
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Walk the deferred state for anything that looks like a declared result total
 * or a pagination descriptor. Airbnb moves these around between releases, so we
 * report every candidate path rather than hard-coding one.
 */
function findCountFields(json: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const seen = new Set<any>();
  const walk = (o: any, path: string) => {
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    for (const k of Object.keys(o)) {
      const v = o[k];
      const looksRelevant = /count|total|resultsCount|nbHits|paginationInfo/i.test(k);
      if (looksRelevant && (typeof v === 'number' || typeof v === 'string')) out[`${path}.${k}`] = v;
      if (looksRelevant && v && typeof v === 'object' && 'pageCursors' in v) {
        out[`${path}.${k}`] = {
          pageCursors: Array.isArray(v.pageCursors) ? v.pageCursors.length : null,
          previousPageCursor: v.previousPageCursor ?? null,
          nextPageCursor: v.nextPageCursor ?? null,
        };
      }
      if (v && typeof v === 'object') walk(v, `${path}.${k}`);
    }
  };
  walk(json, '$');
  return out;
}

// ── 1. session ───────────────────────────────────────────────────────────────

async function probeSession(page: Page) {
  await page.goto('https://www.airbnb.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(5000);
  const state = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    showsLogIn: /\bLog in\b/i.test(document.body.innerText),
    hasProfileButton: !!document.querySelector(
      '[aria-label*="profile" i],[data-testid="cypress-headernav-profile"],button[aria-label*="menu" i]',
    ),
    hasSessionCookie: document.cookie.includes('_aat') || document.cookie.includes('bev'),
  }));
  const loggedIn = state.hasProfileButton && !state.showsLogIn;
  console.log(`\n① session  → ${loggedIn ? 'LOGGED IN' : 'NOT logged in (or Airbnb changed its header)'}`);
  console.log(`   ${JSON.stringify(state)}`);
  return { ...state, loggedIn };
}

// ── 2. caps ──────────────────────────────────────────────────────────────────

/**
 * Paginate the whole-Sudan bbox until Airbnb stops handing out cursors, and
 * report where it stopped and why. Everything the quadtree needs — PAGE_CAP,
 * RESULT_CAP, and which cursor field is authoritative — falls out of this.
 */
async function probeCaps(page: Page) {
  const base =
    `https://www.airbnb.com/s/Sudan/homes?ne_lat=${SUDAN.neLat}&ne_lng=${SUDAN.neLng}` +
    `&sw_lat=${SUDAN.swLat}&sw_lng=${SUDAN.swLng}&zoom=5&search_by_map=true`;

  const unique = new Set<string>();
  const pages: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  let stopReason = 'max-pages guard';
  let firstPageCounts: Record<string, unknown> = {};

  for (let p = 0; p < MAX_PAGES; p++) {
    const url = cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(7000);
    const json = await readDeferredState(page);
    if (!json) {
      stopReason = `no deferred state on page ${p + 1}`;
      break;
    }
    if (p === 0) firstPageCounts = findCountFields(json);

    const found = findSearchResults(json);
    if (!found) {
      stopReason = `no searchResults object on page ${p + 1}`;
      break;
    }
    const before = unique.size;
    for (const el of found.searchResults) {
      const home = parseSearchResult(el, 'OTHER');
      if (home) unique.add(home.airbnbListingId);
    }
    const pi = found.paginationInfo ?? {};
    const cursors: unknown = pi.pageCursors;
    const cursorList = Array.isArray(cursors) ? (cursors as string[]) : [];
    pages.push({
      page: p + 1,
      results: found.searchResults.length,
      newUnique: unique.size - before,
      cumulativeUnique: unique.size,
      pageCursorsLength: cursorList.length,
      nextPageCursor: pi.nextPageCursor ?? null,
      previousPageCursor: pi.previousPageCursor ?? null,
    });
    console.log(
      `   · page ${String(p + 1).padStart(2)}  results=${String(found.searchResults.length).padStart(2)}` +
        `  +${String(unique.size - before).padStart(2)} new  Σ${String(unique.size).padStart(4)}` +
        `  cursors=${cursorList.length}  next=${pi.nextPageCursor ? 'yes' : 'no'}`,
    );

    if (found.searchResults.length === 0) {
      stopReason = 'empty page (natural exhaustion)';
      break;
    }
    // Authoritative next cursor: nextPageCursor if Airbnb gives one, else the
    // cursor that follows the current one in the windowed pageCursors list.
    const idx = cursor ? cursorList.indexOf(cursor) : 0;
    const next: string | undefined =
      (typeof pi.nextPageCursor === 'string' && pi.nextPageCursor) ||
      (idx >= 0 ? cursorList[idx + 1] : undefined);
    if (typeof next !== 'string' || next === cursor) {
      stopReason = 'no further cursor (natural exhaustion)';
      break;
    }
    cursor = next;
    await sleep(1200);
  }

  const result = {
    bbox: SUDAN,
    pagesFetched: pages.length,
    uniqueResults: unique.size,
    stopReason,
    perPage: pages,
    firstPageCountFields: firstPageCounts,
  };
  console.log(`\n② caps     → ${pages.length} pages, ${unique.size} unique listings, stopped: ${stopReason}`);
  console.log(`   ⇒ PAGE_CAP = ${pages.length}, RESULT_CAP = ${unique.size}  (pin these in airbnb-bbox.ts)`);
  const declared = Object.entries(firstPageCounts).filter(([k]) => /total|resultsCount|nbHits/i.test(k));
  if (declared.length) console.log(`   declared-total candidates: ${JSON.stringify(Object.fromEntries(declared))}`);
  return result;
}

// ── 3 + 4. locale stickiness and original-text access ────────────────────────

interface PdpText {
  title: string | null;
  description: string | null;
  descriptionScript: 'ar' | 'latin' | 'none';
  mtMarkers: string[];
}

async function readPdpText(page: Page, url: string): Promise<PdpText> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  const json = await readDeferredState(page);
  const raw = json ? JSON.stringify(json) : '';

  let description: string | null = null;
  let title: string | null = null;
  const walk = (o: any) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (!description && typeof o?.htmlDescription?.htmlText === 'string') description = o.htmlDescription.htmlText;
    if (!title && typeof o?.sharingConfig?.title === 'string') title = o.sharingConfig.title;
    for (const k in o) walk(o[k]);
  };
  walk(json);

  // Airbnb has used several markers over the years; report whichever are present
  // so the PDP stage knows which one to trust.
  const mtMarkers = [
    'localizedStringWithTranslationPreference',
    'isTranslated',
    'TRANSLATION_DISCLAIMER',
    'Translated automatically',
    'translate_ugc',
    'showTranslationDisclaimer',
  ].filter((m) => raw.includes(m));

  return { title, description, descriptionScript: scriptOf(description), mtMarkers };
}

async function probeLocale(page: Page, roomId: string) {
  const room = `https://www.airbnb.com/rooms/${roomId}`;
  console.log(`\n③ locale   → probing room ${roomId}`);

  const ar = await readPdpText(page, `${room}?locale=ar`);
  console.log(`   ?locale=ar     script=${ar.descriptionScript}  markers=[${ar.mtMarkers.join(', ')}]`);

  // The one that matters: same room, NO param. If it is still Arabic, the locale
  // is sticky on this shared Chrome profile and every later EN fetch is poisoned.
  const bare = await readPdpText(page, room);
  console.log(`   (no param)     script=${bare.descriptionScript}`);

  const en = await readPdpText(page, `${room}?locale=en`);
  console.log(`   ?locale=en     script=${en.descriptionScript}`);

  const sticky = bare.descriptionScript === 'ar' && ar.descriptionScript === 'ar';
  console.log(
    `   ⇒ locale param ${ar.descriptionScript === 'ar' ? 'WORKS' : 'DID NOT return Arabic'}; ` +
      `sticky=${sticky ? 'YES — always pass an explicit ?locale= and assert the script' : 'no'}`,
  );
  return { roomId, ar, bare, en, sticky };
}

async function probeUgc(page: Page, roomId: string) {
  const room = `https://www.airbnb.com/rooms/${roomId}`;
  console.log(`\n④ ugc      → probing translate_ugc on room ${roomId}`);
  const translated = await readPdpText(page, `${room}?locale=ar`);
  const original = await readPdpText(page, `${room}?locale=ar&translate_ugc=false`);
  const differs = (translated.description ?? '') !== (original.description ?? '');
  console.log(`   locale=ar                    script=${translated.descriptionScript}`);
  console.log(`   locale=ar&translate_ugc=false script=${original.descriptionScript}`);
  console.log(
    `   ⇒ translate_ugc=false ${differs ? 'IS honoured — original host text is reachable' : 'made no difference'}`,
  );
  if (differs) {
    console.log(`   translated: ${(translated.description ?? '').slice(0, 90)}`);
    console.log(`   original  : ${(original.description ?? '').slice(0, 90)}`);
  }
  return { roomId, translated, original, honoured: differs };
}

/** A listing id to probe: --room, else the first one we already scraped. */
function pickRoomId(): string | null {
  const explicit = arg('room');
  if (explicit) return explicit;
  if (!existsSync(SCRAPE_FILE)) return null;
  try {
    const homes = JSON.parse(readFileSync(SCRAPE_FILE, 'utf8')).homes ?? [];
    return homes[0]?.airbnbListingId ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n🔬 Airbnb probe — ${ONLY.join(', ')}`);
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(CDP);
  } catch (e) {
    throw new Error(`can't reach vault Chrome at ${CDP} — is chrome-debug.sh running? (${(e as Error).message})`);
  }
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = await ctx.newPage();

  const report: Record<string, unknown> = { probedAt: new Date().toISOString(), cdp: CDP };

  if (ONLY.includes('session')) report.session = await probeSession(page);

  if (ONLY.includes('caps')) report.caps = await probeCaps(page);

  const roomId = pickRoomId();
  if (ONLY.includes('locale') || ONLY.includes('ugc')) {
    if (!roomId) {
      console.warn('\n! locale/ugc skipped — pass --room=<listingId> (no scrape file to borrow one from)');
    } else {
      if (ONLY.includes('locale')) report.locale = await probeLocale(page, roomId);
      if (ONLY.includes('ugc')) report.ugc = await probeUgc(page, roomId);
    }
  }

  await page.close().catch(() => {});
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`\n✅ report → ${OUT}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
