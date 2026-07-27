/**
 * Visit each host's Airbnb profile once (Epic G1.3).
 *
 *   pnpm crm:host-profile                  # dry run over hosts with no profile yet
 *   pnpm crm:host-profile --apply
 *
 * ── Why the PDP is not enough ──────────────────────────────────────────────
 *
 * `airbnbListingsCount` on a HostRecord is tallied across *our* scrape, so an
 * agency with forty listings that happens to have three inside our dataset
 * reads as a three-listing individual. That is the difference between messaging
 * a person and messaging a company, and provisioning `1000@mkan.org` for a
 * letting agency and telling them "your account is ready" is the worst outreach
 * outcome available. The profile page carries the real number.
 *
 * It also carries the "about" blurb and the languages the host speaks — the
 * first is the last unchecked contact surface Airbnb publishes, the second
 * decides whether outreach goes out in Arabic or English rather than guessing
 * from the listing text.
 *
 * Resumable and checkpointed like the other browser stages: one host at a time,
 * atomic write every few, SIGINT costs at most the host in flight.
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HostRecord } from './airbnb-parse';

const APPLY = process.argv.includes('--apply');
const REFRESH = process.argv.includes('--refresh');
const arg = (name: string, def: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const IN = arg('in', 'scripts/crm/.data/airbnb-scrape.json');
const LIMIT = parseInt(arg('limit', '0'), 10);
const DELAY = parseInt(arg('delay', '2000'), 10);
const CDP = arg('cdp', 'http://127.0.0.1:9222');
const CHECKPOINT_EVERY = 5;

/**
 * Names that mean a company rather than a person. Sudanese letting agencies and
 * serviced-apartment operators name themselves plainly, in both languages, so
 * this catches most of them — but it is a flag for a human, never a decision.
 */
const AGENCY_NAME =
  /شرك[ةه]|للعقارات|العقاري|للاستثمار|للسياحة|مجموعة|apartments?\b|suites?\b|hotel|hostel|residence|rentals?\b|property|properties|management|lettings?\b|group\b|co\.|ltd/i;
/** Portfolio size at which "individual host" stops being a safe assumption. */
const AGENCY_LISTING_COUNT = 5;

export interface HostProfile {
  /** True portfolio size from the profile page, not from our scrape. */
  profileListingsCount: number | null;
  about: string | null;
  languages: string[];
  verifications: string[];
  agencySuspected: boolean;
  agencyReason: string | null;
  profileFetchedAt: string;
  profileError?: string | null;
}

type EnrichedHost = HostRecord &
  Partial<HostProfile> & {
    /** Set from Airbnb's own "speaks" list rather than guessed from listing text. */
    preferredLanguage?: 'AR' | 'EN' | null;
  };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function writeAtomic(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}

async function readDeferredState(page: Page): Promise<unknown> {
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

const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * First value stored under any of `keys`, anywhere in the payload.
 *
 * airbnb-parse has its own walker, but it searches for an *object* matching a
 * predicate; this wants the value at a key, which is the shape every field on
 * this page needs. Breadth-first, so a top-level `about` wins over one buried
 * in an embedded "other listings by this host" card.
 */
function valueByKey(root: unknown, keys: string[]): unknown {
  const wanted = new Set(keys);
  const queue: unknown[] = [root];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (wanted.has(k) && v != null && v !== '') return v;
    }
    queue.push(...Object.values(node as Record<string, unknown>));
  }
  return null;
}

/**
 * Airbnb has reshaped the profile payload repeatedly, so every field is read by
 * searching for its key rather than by walking a fixed path, and anything not
 * found stays null instead of guessing.
 */
function parseProfile(json: unknown, pageText: string): Omit<HostProfile, 'agencySuspected' | 'agencyReason' | 'profileFetchedAt'> {
  const about = asString(valueByKey(json, ['about', 'userProfileDescription', 'aboutText']));

  // "12 listings" / "قائمة 12" on the profile header. The JSON key moves; the
  // rendered string is the more stable of the two.
  let count: number | null = null;
  const fromJson = valueByKey(json, ['listingsCount', 'totalListingsCount']);
  if (typeof fromJson === 'number') count = fromJson;
  if (count == null) {
    const m = pageText.match(/(\d{1,4})\s+listings?\b/i) ?? pageText.match(/(\d{1,4})\s+(?:إعلان|عقار)/);
    if (m) count = parseInt(m[1], 10);
  }

  const langsRaw = valueByKey(json, ['languages', 'spokenLanguages']);
  const languages = Array.isArray(langsRaw) ? langsRaw.filter((x): x is string => typeof x === 'string') : [];

  const verRaw = valueByKey(json, ['verifications', 'identityVerifications']);
  const verifications = Array.isArray(verRaw) ? verRaw.filter((x): x is string => typeof x === 'string') : [];

  return { profileListingsCount: count, about, languages, verifications };
}

function judgeAgency(name: string | null, count: number | null): { suspected: boolean; reason: string | null } {
  if (name && AGENCY_NAME.test(name)) return { suspected: true, reason: `name matches "${name}"` };
  if (count != null && count >= AGENCY_LISTING_COUNT) return { suspected: true, reason: `${count} listings on Airbnb` };
  return { suspected: false, reason: null };
}

async function main() {
  if (!existsSync(IN)) throw new Error(`no scrape file at ${IN} — run pnpm crm:bbox first`);
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { hosts: EnrichedHost[]; [k: string]: unknown };
  const hosts = payload.hosts ?? [];

  let queue = hosts.filter((h) => REFRESH || !h.profileFetchedAt);
  if (LIMIT) queue = queue.slice(0, LIMIT);

  console.log(`\n👤 Host profiles — ${hosts.length} hosts, ${queue.length} to fetch`);
  if (!APPLY) {
    console.log('   DRY RUN — no browser, no writes.\n');
    for (const h of queue.slice(0, 10)) {
      console.log(`   · ${(h.name ?? '?').padEnd(22)} ${h.airbnbHostId}  (scrape says ${h.airbnbListingsCount ?? '?'} listing(s))`);
    }
    console.log(`\n   Re-run with --apply to visit ${queue.length} profile(s).\n`);
    return;
  }
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
  let failures = 0;
  let interrupted = false;
  const flush = () => writeAtomic(IN, { ...payload, hosts });
  process.on('SIGINT', () => {
    interrupted = true;
    console.log('\n  ⏸  interrupted — flushing progress…');
  });

  for (const host of queue) {
    if (interrupted) break;
    try {
      await page.goto(`https://www.airbnb.com/users/show/${host.airbnbHostId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
      });
      await page.waitForTimeout(5000);
      const json = await readDeferredState(page);
      const pageText = await page.evaluate(() => document.body?.innerText ?? '');
      if (!json && !pageText) throw new Error('empty profile page');

      const parsed = parseProfile(json, pageText);
      const judged = judgeAgency(host.name, parsed.profileListingsCount);
      Object.assign(host, {
        ...parsed,
        agencySuspected: judged.suspected,
        agencyReason: judged.reason,
        profileFetchedAt: new Date().toISOString(),
        profileError: null,
      } satisfies HostProfile);

      // Airbnb's own answer beats guessing the language from listing text.
      if (parsed.languages.length && !host.preferredLanguage) {
        host.preferredLanguage = parsed.languages.some((l) => /arabic|العربية|^ar$/i.test(l)) ? 'AR' : 'EN';
      }

      done++;
      const flag = judged.suspected ? '⚑ agency?' : '         ';
      console.log(
        `  ✓ ${String(done).padStart(3)}/${queue.length} ${flag} ${(host.name ?? '?').padEnd(20)} ` +
          `${String(parsed.profileListingsCount ?? '?').padStart(3)} listings (we saw ${host.airbnbListingsCount ?? '?'})` +
          `${parsed.about ? `  about ${parsed.about.length}ch` : ''}`,
      );
    } catch (e) {
      failures++;
      host.profileError = (e as Error).message;
      console.warn(`  ! ${host.airbnbHostId}: ${(e as Error).message}`);
    }
    if (done % CHECKPOINT_EVERY === 0) flush();
    await sleep(DELAY);
  }

  flush();
  await page.close().catch(() => {});

  const agencies = hosts.filter((h) => h.agencySuspected);
  const undercounted = hosts.filter(
    (h) => h.profileListingsCount != null && h.airbnbListingsCount != null && h.profileListingsCount > h.airbnbListingsCount,
  );
  const withAbout = hosts.filter((h) => h.about);

  console.log(`\n── host profiles ────────────────────────────────────`);
  console.log(`  fetched            ${done}${interrupted ? ' (interrupted)' : ''}, ${failures} failed`);
  console.log(`  agency suspected   ${agencies.length}${agencies.length ? ` ← review before any "your account is ready" message` : ''}`);
  for (const a of agencies.slice(0, 10)) console.log(`     ${(a.name ?? '?').padEnd(24)} ${a.agencyReason}`);
  console.log(`  bigger than we knew ${undercounted.length} host(s) have more listings than our scrape saw`);
  console.log(`  with an about blurb ${withAbout.length}  ← re-run pnpm crm:contact-hunt to mine them`);
  console.log(`\n✅ ${IN}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
