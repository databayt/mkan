/**
 * PDP enrichment, one locale per pass (Epic G1.2).
 *
 * Discovery finds listings; this fills them in. It is a separate stage from the
 * crawl on purpose — a three-hour quadtree run that also does a thousand PDP
 * fetches finishes neither, and the Arabic pass is a second traversal of the
 * same set anyway.
 *
 *   pnpm crm:pdp --locale=en --only-missing
 *   pnpm crm:pdp --locale=ar --only-missing
 *
 * ── What "both languages, exactly like Airbnb" means here ───────────────────
 *
 * Airbnb serves a listing in whichever language you ask for, translating the
 * host's text when it has to. So one of the two captures is the host's own
 * prose and the other is machine translation — and which is which matters,
 * because a host writing Arabic is a local, reachable, high-signal lead, while
 * Arabic that Airbnb generated tells us nothing about the host at all.
 *
 * `eventDataLogging.descriptionLanguage` answers that outright, so we do not
 * have to infer it: capture both locales, record which one Airbnb says the host
 * authored, and mark the other as translated. Nothing is guessed.
 *
 * Locale is passed explicitly on every fetch and the returned script is checked
 * against it. The probe showed locale is not sticky on the shared Chrome
 * profile, but the assertion costs nothing and the failure it catches — an
 * Arabic pass silently storing English — is invisible otherwise.
 *
 * Flags: --locale=en|ar --only-missing --refresh --limit=<N> --in=<file>
 *        --pdp-delay=<ms> --cdp=<url>
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { parsePdp, mapRoomType, mapPropertyType, type HomeRecord, type HostRecord } from './airbnb-parse';
import { checkPlace } from './sudan-places';

const arg = (name: string, def?: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const LOCALE = (arg('locale', 'en')! === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
const ONLY_MISSING = flag('only-missing');
const REFRESH = flag('refresh');
const LIMIT = parseInt(arg('limit', '0')!, 10);
const DELAY = parseInt(arg('pdp-delay', '1500')!, 10);
const CDP = arg('cdp', 'http://127.0.0.1:9222')!;
const IN = arg('in', 'scripts/crm/.data/airbnb-scrape.json')!;

/** Checkpoint cadence. The ledger bug in mkan-import.ts — one write after the
 *  whole loop — is the mistake this exists to avoid repeating. */
const CHECKPOINT_EVERY = 10;

const AR_CHARS = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;
const LATIN_CHARS = /[A-Za-z]/g;

/**
 * Which script a captured string is *predominantly* in.
 *
 * The app's own detectScript answers a different question — "does this need
 * translating for this viewer" — and any single Arabic character is enough to
 * say yes. That rule is wrong here. Hosts leave Arabic street names in English
 * copy ("شارع35" inside 751 characters of English) and Latin brand names in
 * Arabic copy, and a first-hit test reads those as a locale failure. Requiring
 * a majority asks the question this stage actually cares about: did Airbnb
 * serve the locale we asked for?
 */
const scriptOf = (s: string | null | undefined): 'ar' | 'latin' | 'none' => {
  if (!s || !s.trim()) return 'none';
  const arabic = (s.match(AR_CHARS) ?? []).length;
  const latin = (s.match(LATIN_CHARS) ?? []).length;
  if (arabic === 0 && latin === 0) return 'none';
  return arabic > latin ? 'ar' : 'latin';
};

export interface LocaleCapture {
  title: string | null;
  description: string | null;
  amenities: string[];
  houseRules: string[];
  hostAbout: string | null;
  capturedAt: string;
  /** 'ok' when the returned text matched the requested locale. */
  localeVerified: 'ok' | 'mismatch' | 'empty';
  /** True when Airbnb rendered a translation rather than the host's own words. */
  machineTranslated: boolean | null;
}

/** Fields the PDP adds to a HomeRecord. Declared here so the crawl output and
 *  this stage can share one file without either needing the other's types. */
export interface EnrichedHome extends HomeRecord {
  i18n?: Partial<Record<'ar' | 'en', LocaleCapture>>;
  /** ISO 639-1 language the host actually wrote in, per Airbnb. */
  authoredLocale?: string | null;
  hostSource?: string | null;
  coHostIds?: string[];
  locationSubtitle?: string | null;
  /** Sudanese state, derived alongside city so a wave can be planned by region. */
  homeState?: string;
  houseRules?: string[];
  pdpFetchedAt?: string;
  pdpError?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function writeAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

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
  if (!existsSync(IN)) throw new Error(`no scrape file at ${IN} — run pnpm crm:bbox first`);
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as {
    homes: EnrichedHome[];
    hosts: HostRecord[];
    [k: string]: unknown;
  };
  const homes = payload.homes ?? [];
  const hosts = new Map<string, HostRecord>((payload.hosts ?? []).map((h) => [h.airbnbHostId, h]));

  let queue = homes.filter((h) => {
    if (REFRESH) return true;
    if (ONLY_MISSING) return !h.i18n?.[LOCALE]?.capturedAt;
    return true;
  });
  if (LIMIT) queue = queue.slice(0, LIMIT);

  console.log(`\n📄 PDP enrichment — locale ${LOCALE}`);
  console.log(`   ${homes.length} homes in ${IN}, ${queue.length} to fetch\n`);
  if (!queue.length) {
    console.log('   Nothing to do.\n');
    return;
  }

  const browser = await chromium.connectOverCDP(CDP).catch((e) => {
    throw new Error(`can't reach vault Chrome at ${CDP} — is chrome-debug.sh running? (${(e as Error).message})`);
  });
  const ctx = browser.contexts()[0] ?? (await browser.newContext());
  const page = await ctx.newPage();

  let done = 0;
  let mismatches = 0;
  let failures = 0;
  let interrupted = false;
  const flush = () => writeAtomic(IN, { ...payload, homes, hosts: [...hosts.values()] });

  // Ctrl-C must not cost more than the current listing.
  process.on('SIGINT', () => {
    interrupted = true;
    console.log('\n  ⏸  interrupted — flushing progress…');
  });

  for (const home of queue) {
    if (interrupted) break;
    try {
      const url = `https://www.airbnb.com/rooms/${home.airbnbListingId}?locale=${LOCALE}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(6000);
      const json = await readDeferredState(page);
      if (!json) throw new Error('no deferred state');

      const pdp = parsePdp(json, JSON.stringify(json), home.airbnbListingId);

      // Did Airbnb actually give us the locale we asked for?
      const got = scriptOf(pdp.description);
      const want = LOCALE === 'ar' ? 'ar' : 'latin';
      const verified: LocaleCapture['localeVerified'] =
        got === 'none' ? 'empty' : got === want ? 'ok' : 'mismatch';
      if (verified === 'mismatch') mismatches++;

      const capture: LocaleCapture = {
        title: pdp.title ?? home.title,
        description: pdp.description,
        amenities: pdp.amenities,
        houseRules: pdp.houseRules,
        hostAbout: pdp.hostAbout,
        capturedAt: new Date().toISOString(),
        localeVerified: verified,
        machineTranslated:
          pdp.descriptionLanguage != null ? pdp.descriptionLanguage !== LOCALE : pdp.machineTranslated,
      };

      // A mismatched capture is recorded but never allowed to overwrite the
      // other locale's text — storing English under `ar` is the one failure
      // that would be invisible downstream.
      home.i18n = { ...(home.i18n ?? {}), [LOCALE]: capture };
      if (pdp.descriptionLanguage) home.authoredLocale = pdp.descriptionLanguage;

      // Locale-independent fields: take them from whichever pass runs.
      if (pdp.roomType) {
        home.roomType = mapRoomType(pdp.roomType, home.airbnbCategory);
        home.mkanPropertyType = mapPropertyType(home.airbnbCategory, home.roomType);
      }
      if (pdp.guestCapacity != null) home.guestCapacity = pdp.guestCapacity;
      if (pdp.photos.length) {
        home.photoUrls = pdp.photos;
        home.photoCount = pdp.photos.length;
        home.coverPhotoUrl = pdp.photos[0];
      }
      if (pdp.latitude != null && pdp.longitude != null) {
        home.latitude = pdp.latitude;
        home.longitude = pdp.longitude;
      }
      // Classify every home, not only the ones Airbnb gave a subtitle for —
      // otherwise a listing with coordinates but no subtitle keeps whatever
      // coarse city the search page guessed and never gets a state at all.
      // The English subtitle is the one worth keeping. Airbnb's ar locale
      // localizes the country field wrongly — a Sri Lankan and a South Dakotan
      // listing both come back as "…، السودان" — so letting the ar pass
      // overwrite it replaces a checkable string with a false one.
      if (pdp.locationSubtitle && (LOCALE === 'en' || !home.locationSubtitle)) {
        home.locationSubtitle = pdp.locationSubtitle;
      }
      const place = checkPlace(home.latitude, home.longitude, home.airbnbCategory, home.locationSubtitle);
      home.city = place.city;
      home.homeState = place.state;
      home.pdpError = place.agreement === 'SUSPECT_FOREIGN' ? `not Sudan: ${place.note}` : null;
      // Flat fields hold ONE language, and the rule everywhere else is "the
      // language the host authored in". House rules were being overwritten by
      // whichever pass ran last, so the whole set ended up Arabic while
      // amenitiesRaw beside it stayed English — the per-locale copies live in
      // `i18n`, which is where anything needing a specific language should read.
      if (verified === 'ok' && (!home.authoredLocale || home.authoredLocale === LOCALE)) {
        home.houseRules = pdp.houseRules;
      } else if (!home.houseRules?.length) {
        home.houseRules = pdp.houseRules;
      }
      home.hostSource = pdp.hostSource;
      home.coHostIds = pdp.coHostIds;
      home.pdpFetchedAt = new Date().toISOString();

      // Only the canonical locale's text goes in the flat fields, so a
      // mismatched or translated capture cannot quietly become the listing.
      if (verified === 'ok' && (!home.authoredLocale || home.authoredLocale === LOCALE)) {
        if (capture.title) home.title = capture.title;
        if (capture.description) home.description = capture.description;
      }

      if (pdp.host?.airbnbHostId) {
        home.hostAirbnbId = pdp.host.airbnbHostId;
        const existing = hosts.get(pdp.host.airbnbHostId);
        hosts.set(pdp.host.airbnbHostId, {
          source: 'AIRBNB',
          airbnbHostId: pdp.host.airbnbHostId,
          airbnbProfileUrl: `https://www.airbnb.com/users/show/${pdp.host.airbnbHostId}`,
          avatarUrl: pdp.host.avatarUrl ?? existing?.avatarUrl ?? null,
          name: pdp.host.name ?? existing?.name ?? null,
          superhost: pdp.host.superhost ?? existing?.superhost ?? false,
          hostSince: pdp.host.hostSince ?? existing?.hostSince ?? null,
          responseRate: pdp.host.responseRate ?? existing?.responseRate ?? null,
          airbnbListingsCount: existing?.airbnbListingsCount ?? null,
          portfolioReviewsTotal: pdp.host.portfolioReviewsTotal ?? existing?.portfolioReviewsTotal ?? null,
          portfolioAvgRating: pdp.host.portfolioAvgRating ?? existing?.portfolioAvgRating ?? null,
        });
      }

      done++;
      const flagStr =
        verified === 'ok' ? (capture.machineTranslated ? 'translated' : 'original  ') : verified.padEnd(10);
      console.log(
        `  ✓ ${String(done).padStart(4)}/${queue.length}  ${flagStr}  ${String(home.city).padEnd(11)} ` +
          `${home.photoCount} photos  ${pdp.hostSource ?? 'no-host'}  ${(capture.title ?? '').slice(0, 32)}`,
      );
    } catch (e) {
      failures++;
      home.pdpError = (e as Error).message;
      console.warn(`  ! ${home.airbnbListingId}: ${(e as Error).message}`);
    }

    if (done % CHECKPOINT_EVERY === 0) flush();
    await sleep(DELAY);
  }

  // Re-tally each host's listing count over the whole file, not just this run.
  for (const h of hosts.values()) h.airbnbListingsCount = 0;
  for (const h of homes) {
    if (h.hostAirbnbId && hosts.has(h.hostAirbnbId)) {
      const host = hosts.get(h.hostAirbnbId)!;
      host.airbnbListingsCount = (host.airbnbListingsCount ?? 0) + 1;
    }
  }

  flush();
  await page.close().catch(() => {});

  const withLocale = homes.filter((h) => h.i18n?.[LOCALE]?.localeVerified === 'ok').length;
  const authored = homes.reduce<Record<string, number>>((a, h) => {
    const k = h.authoredLocale ?? 'unknown';
    a[k] = (a[k] ?? 0) + 1;
    return a;
  }, {});
  const heuristic = homes.filter((h) => h.hostSource === 'HEURISTIC').length;
  const noHost = homes.filter((h) => h.pdpFetchedAt && !h.hostAirbnbId).length;

  console.log(`\n── ${LOCALE} pass ─────────────────────────────────────────`);
  console.log(`  fetched          ${done}${interrupted ? ' (interrupted)' : ''}`);
  console.log(`  failures         ${failures}`);
  console.log(`  locale verified  ${withLocale}/${homes.length}`);
  console.log(`  locale mismatch  ${mismatches}${mismatches ? '  ← locale may be sticky; rerun probe-caps' : ''}`);
  console.log(`  authored in      ${JSON.stringify(authored)}`);
  console.log(`  host resolution  ${heuristic} heuristic${heuristic ? '  ← not safe to import' : ''}, ${noHost} with no host`);
  console.log(`\n✅ ${IN}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
