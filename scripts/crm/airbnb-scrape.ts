/**
 * Airbnb Sudan scraper (Epic G1.2).
 *
 * Sweeps the Airbnb search (all Sudan by default, tagged by city) → for each
 * listing opens the PDP for ALL photos + full data → normalizes to Home/Host
 * records (matching `twenty-schema.ts`) → writes a JSON file. The next step
 * (upsert into Twenty) consumes that file once the CRM backend + objects exist.
 *
 * Reuses the logged-in **vault Chrome** over CDP (:9222) — read-only, low-rate,
 * respectful (see docs/growth.md §4.6 for the ToS/consent posture). Nothing is
 * sent anywhere; it only reads public listing pages and writes a local file.
 *
 *   npx tsx scripts/crm/airbnb-scrape.ts --query=Port-Sudan--Sudan --max=3
 *   npx tsx scripts/crm/airbnb-scrape.ts                 # all Sudan, PDP-enriched
 *   npx tsx scripts/crm/airbnb-scrape.ts --no-pdp        # search-only (fast)
 *
 * Flags: --query=<Airbnb location slug>  --max=<N homes>  --no-pdp
 *        --out=<path>  --pdp-delay=<ms>  --max-pages=<N>  --cdp=<url>
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  parseSearchResult,
  parsePdp,
  findSearchResults,
  deriveCity,
  mapRoomType,
  mapPropertyType,
  type HomeRecord,
  type HostRecord,
} from './airbnb-parse';

const arg = (name: string, def?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const QUERY = arg('query', 'Sudan')!;
const MAX = parseInt(arg('max', '0')!, 10); // 0 = no cap
const MAX_PAGES = parseInt(arg('max-pages', '10')!, 10);
const NO_PDP = flag('no-pdp');
const PDP_DELAY = parseInt(arg('pdp-delay', '1500')!, 10);
const CDP = arg('cdp', 'http://127.0.0.1:9222')!;
const OUT = arg('out', 'scripts/crm/.data/airbnb-scrape.json')!;
const SEARCH_BASE = `https://www.airbnb.com/s/${QUERY}/homes`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Return the parsed `data-deferred-state` JSON of the current page (or null). */
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

async function main() {
  console.log(`\n🔎 Airbnb scrape — "${QUERY}"  (PDP ${NO_PDP ? 'off' : 'on'}${MAX ? `, max ${MAX}` : ''})`);
  const browser = await chromium.connectOverCDP(CDP).catch((e) => {
    throw new Error(`can't reach vault Chrome at ${CDP} — is chrome-debug.sh running? (${(e as Error).message})`);
  });
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = await ctx.newPage();

  // 1) Search pages (paginate via pageCursors) → partial Homes, deduped by id.
  const homes = new Map<string, HomeRecord>();
  let cursor: string | undefined;
  for (let p = 0; p < MAX_PAGES; p++) {
    const url = cursor ? `${SEARCH_BASE}?cursor=${encodeURIComponent(cursor)}` : SEARCH_BASE;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(7000);
    const json = await readDeferredState(page);
    const found = json && findSearchResults(json);
    if (!found) {
      console.warn(`  ! page ${p + 1}: no search results parsed`);
      break;
    }
    let added = 0;
    for (const el of found.searchResults) {
      const home = parseSearchResult(el, deriveCity(el?.title));
      if (home && !homes.has(home.airbnbListingId)) {
        homes.set(home.airbnbListingId, home);
        added++;
      }
    }
    console.log(`  · page ${p + 1}: +${added} (total ${homes.size})`);
    const cursors: unknown = found.paginationInfo?.pageCursors;
    const next = Array.isArray(cursors) ? cursors[p + 1] : undefined;
    if (added === 0 || typeof next !== 'string' || (MAX && homes.size >= MAX)) break;
    cursor = next;
    await sleep(1200);
  }

  let homeList = [...homes.values()];
  if (MAX) homeList = homeList.slice(0, MAX);
  console.log(`\n  ${homeList.length} listings from search.${NO_PDP ? '' : ' Enriching via PDP…'}`);

  // 2) PDP enrichment (all photos + description + amenities + host).
  const hosts = new Map<string, HostRecord>();
  if (!NO_PDP) {
    for (let i = 0; i < homeList.length; i++) {
      const home = homeList[i];
      try {
        await page.goto(home.airbnbUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(6000);
        const json = await readDeferredState(page);
        if (json) {
          const pdp = parsePdp(json, JSON.stringify(json), home.airbnbListingId);
          if (pdp.description) home.description = pdp.description;
          if (pdp.roomType) {
            home.roomType = mapRoomType(pdp.roomType, home.airbnbCategory);
            home.mkanPropertyType = mapPropertyType(home.airbnbCategory, home.roomType);
          }
          if (pdp.amenities.length) home.amenitiesRaw = pdp.amenities;
          if (pdp.guestCapacity != null) home.guestCapacity = pdp.guestCapacity;
          if (pdp.photos.length) {
            home.photoUrls = pdp.photos;
            home.photoCount = pdp.photos.length;
            home.coverPhotoUrl = pdp.photos[0];
          }
          if (pdp.host?.airbnbHostId) {
            home.hostAirbnbId = pdp.host.airbnbHostId;
            if (!hosts.has(pdp.host.airbnbHostId)) {
              hosts.set(pdp.host.airbnbHostId, {
                source: 'AIRBNB',
                airbnbHostId: pdp.host.airbnbHostId,
                airbnbProfileUrl: `https://www.airbnb.com/users/show/${pdp.host.airbnbHostId}`,
                avatarUrl: pdp.host.avatarUrl ?? null,
                name: pdp.host.name ?? null,
                superhost: !!pdp.host.superhost,
                hostSince: pdp.host.hostSince ?? null,
                responseRate: pdp.host.responseRate ?? null,
                airbnbListingsCount: null,
                portfolioReviewsTotal: pdp.host.portfolioReviewsTotal ?? null,
                portfolioAvgRating: pdp.host.portfolioAvgRating ?? null,
              });
            }
          }
        }
        console.log(`  ✓ ${i + 1}/${homeList.length}  ${home.city.padEnd(11)} ${home.photoCount} photos  ${(home.title ?? '').slice(0, 34)}`);
      } catch (e) {
        console.warn(`  ! ${i + 1}/${homeList.length} PDP failed for ${home.airbnbListingId}: ${(e as Error).message}`);
      }
      await sleep(PDP_DELAY);
    }
    // Tally each host's scraped listing count.
    for (const h of homeList) if (h.hostAirbnbId && hosts.has(h.hostAirbnbId)) {
      const host = hosts.get(h.hostAirbnbId)!;
      host.airbnbListingsCount = (host.airbnbListingsCount ?? 0) + 1;
    }
  }

  await page.close().catch(() => {});

  // 3) Write normalized records.
  const payload = {
    scrapedAt: new Date().toISOString(),
    query: QUERY,
    counts: { homes: homeList.length, hosts: hosts.size },
    homes: homeList,
    hosts: [...hosts.values()],
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2));

  const withPhotos = homeList.filter((h) => h.photoCount > 0).length;
  const withPrice = homeList.filter((h) => h.priceNightSar != null).length;
  console.log(`\n✅ ${homeList.length} homes, ${hosts.size} hosts → ${OUT}`);
  console.log(`   ${withPhotos}/${homeList.length} with photos · ${withPrice}/${homeList.length} with price`);
  console.log('   Next: upsert into Twenty (needs the backend up + G1.1 objects applied).\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
