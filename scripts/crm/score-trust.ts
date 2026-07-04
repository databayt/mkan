/**
 * Trust-scoring worker (Epic G1.3).
 *
 * Default (local): scores the scraped file (`.data/airbnb-scrape.json`), prints a
 * band distribution, and writes the scored records to `.data/airbnb-scored.json`.
 * No backend needed — this is the testable path and reflects the *scrape-only*
 * ceiling (hosts stay LOW until contacted).
 *
 * `--apply`: reads Home/Host/Opportunity from Twenty, re-scores against live CRM
 * state (outreach replies etc.), and PATCHes back the score/band/derived-check
 * fields + the denormalized copies (overallTrustScore on Home, hostTrustBand on
 * Opportunity). Needs the backend up + G1.1/G1.2 done.
 *
 *   npx tsx scripts/crm/score-trust.ts                 # local, dry
 *   TWENTY_API_URL=… TWENTY_API_KEY=… \
 *     npx tsx scripts/crm/score-trust.ts --apply
 *
 * Flags: --in=<path>  --out=<path>  --limit=<N>  --apply
 */
import { config } from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  scoreOne, hostScore, hostBand, priceMedians, priceBucketKey, duplicateSuspects,
  RUBRIC_VERSION, type HomeLike, type HostLike, type Engagement,
} from './trust-score';

config({ override: true }); // load central .env (TWENTY_API_URL / TWENTY_API_KEY)

const APPLY = process.argv.includes('--apply');
const arg = (n: string, d?: string) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const IN = arg('in', 'scripts/crm/.data/airbnb-scrape.json')!;
const OUT = arg('out', 'scripts/crm/.data/airbnb-scored.json')!;
const LIMIT = parseInt(arg('limit', '0')!, 10);
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;
const now = () => new Date().toISOString();

const distribution = (bands: string[]) => {
  const c: Record<string, number> = {};
  for (const b of bands) c[b] = (c[b] ?? 0) + 1;
  return Object.entries(c).map(([k, v]) => `${k}:${v}`).join('  ');
};

function marketFor(homes: (HomeLike & { airbnbListingId?: string })[]) {
  const medians = priceMedians(homes);
  const dups = duplicateSuspects(homes);
  return (h: HomeLike & { airbnbListingId?: string }) => ({
    medianPrice: medians.get(priceBucketKey(h)) ?? null,
    isDuplicate: h.airbnbListingId ? dups.has(h.airbnbListingId) : false,
  });
}

// ── local mode ───────────────────────────────────────────────────────────────
function runLocal() {
  const d = JSON.parse(readFileSync(IN, 'utf8')) as { homes: any[]; hosts: any[] };
  let homes = d.homes ?? [];
  if (LIMIT) homes = homes.slice(0, LIMIT);
  const hostById = new Map((d.hosts ?? []).map((h) => [h.airbnbHostId, h]));
  const market = marketFor(homes);

  const scoredHomes = homes.map((h) => {
    const host = h.hostAirbnbId ? hostById.get(h.hostAirbnbId) : undefined;
    const r = scoreOne(h, host, market(h));
    return {
      ...h,
      homeStatus: 'SCORED',
      homeTrustScore: r.homeScore,
      overallTrustScore: r.overallTrustScore,
      trustBand: r.trustBand,
      publishReady: r.publishReady,
      ...r.checks,
      scoredAt: now(),
      rubricVersion: RUBRIC_VERSION,
      gateNote: r.gateNote,
    };
  });
  const scoredHosts = (d.hosts ?? []).map((h) => {
    const s = hostScore(h);
    return { ...h, hostTrustScore: s, hostTrustBand: hostBand(s) };
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ scoredAt: now(), rubricVersion: RUBRIC_VERSION, homes: scoredHomes, hosts: scoredHosts }, null, 2));

  console.log(`\n⚖️  Trust scoring (local, scrape-only) — ${scoredHomes.length} homes, ${scoredHosts.length} hosts\n`);
  for (const h of scoredHomes) {
    console.log(`  ${String(h.overallTrustScore).padStart(3)}  ${h.trustBand.padEnd(13)} ${(h.gateNote ? `[${h.gateNote}] ` : '').padEnd(18)}${(h.title ?? '').slice(0, 34)}`);
  }
  console.log(`\n  homes: ${distribution(scoredHomes.map((h) => h.trustBand))}`);
  console.log(`  hosts: ${distribution(scoredHosts.map((h) => h.hostTrustBand))}`);
  console.log(`\n→ ${OUT}\n  (scores are scrape-only; re-run --apply after outreach to lift host engagement)\n`);
}

// ── apply mode (against Twenty) ──────────────────────────────────────────────
async function rest(method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const listOf = (res: any, plural: string): any[] => {
  const v = (res?.data ?? res)?.[plural] ?? res?.data ?? res;
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.edges)) return v.edges.map((e: any) => e.node);
  return [];
};

async function runApply() {
  if (!API_URL || !API_KEY) throw new Error('APPLY needs TWENTY_API_URL + TWENTY_API_KEY (backend up).');
  console.log(`\n⚖️  Trust scoring (apply) → ${REST}\n`);

  const homes = listOf(await rest('GET', 'homes?limit=200&depth=1'), 'homes');
  // Twenty returns CURRENCY fields as { amountMicros, currencyCode } composites,
  // but the scorer's HomeLike reads priceNightSar/Sdg as plain numbers. Without
  // this, market medians + priceSanityRatio go NaN/null and silently drag every
  // score toward REJECT. Normalize the composite back to a number at the boundary.
  // A CURRENCY composite always collapses to number-or-null — note an unset price
  // comes back as { amountMicros: null }, which must become null (NOT the object),
  // else `priceNightSdg ?? priceNightSar` picks the truthy {} and medians go NaN.
  const toAmount = (v: any) =>
    v && typeof v === 'object'
      ? (v.amountMicros != null ? v.amountMicros / 1_000_000 : null)
      : (v ?? null);
  for (const h of homes) {
    h.priceNightSar = toAmount(h.priceNightSar);
    h.priceNightSdg = toAmount(h.priceNightSdg);
    // Coords round-trip inside the ADDRESS composite (homeAddress.addressLat/Lng),
    // but the scorer reads flat latitude/longitude — lift them back or locationCheck
    // is stuck UNCHECKED and every home silently loses its location points.
    h.latitude = h.latitude ?? h.homeAddress?.addressLat ?? null;
    h.longitude = h.longitude ?? h.homeAddress?.addressLng ?? null;
  }
  const hosts = listOf(await rest('GET', 'hosts?limit=200'), 'hosts');
  const opps = listOf(await rest('GET', 'opportunities?limit=200&depth=1'), 'opportunities');
  const hostById = new Map(hosts.map((h: any) => [h.id, h]));
  const engByHostId = new Map<string, Engagement>();
  const oppByHostId = new Map<string, any>();
  for (const o of opps) {
    const hid = o.hostId ?? o.host?.id;
    if (hid) { engByHostId.set(hid, { repliedAt: o.repliedAt, onboardingStage: o.onboardingStage }); oppByHostId.set(hid, o); }
  }
  const market = marketFor(homes);

  let hp = 0, sp = 0, op = 0;
  for (const home of homes) {
    const host = (home.host ?? (home.hostId ? hostById.get(home.hostId) : undefined)) as HostLike | undefined;
    const eng = home.hostId ? engByHostId.get(home.hostId) : undefined;
    const r = scoreOne(home as HomeLike, host, market(home), eng);
    try {
      await rest('PATCH', `homes/${home.id}`, {
        homeStatus: home.homeStatus === 'SCRAPED' ? 'SCORED' : home.homeStatus,
        homeTrustScore: r.homeScore, overallTrustScore: r.overallTrustScore, trustBand: r.trustBand,
        publishReady: r.publishReady, scoredAt: now(), rubricVersion: RUBRIC_VERSION, ...r.checks,
      });
      hp++;
    } catch (e) { console.warn(`! home ${home.id}: ${(e as Error).message}`); }
  }
  for (const host of hosts) {
    const s = hostScore(host as HostLike, engByHostId.get(host.id));
    try {
      await rest('PATCH', `hosts/${host.id}`, { hostTrustScore: s, hostTrustBand: hostBand(s), hostScoredAt: now() });
      sp++;
      const opp = oppByHostId.get(host.id);
      if (opp) { await rest('PATCH', `opportunities/${opp.id}`, { hostTrustBand: hostBand(s) }); op++; }
    } catch (e) { console.warn(`! host ${host.id}: ${(e as Error).message}`); }
  }
  console.log(`\n✅ scored ${hp} homes, ${sp} hosts, ${op} opportunities.\n`);
}

(APPLY ? runApply() : Promise.resolve(runLocal())).catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
