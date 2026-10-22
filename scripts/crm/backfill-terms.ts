/**
 * Kigali zones and renting terms for the rows written before either existed.
 *
 *   pnpm crm:backfill-terms                  dry run: before/after counts + a sample
 *   pnpm crm:backfill-terms --write          apply to Prisma
 *   pnpm crm:backfill-terms --write --twenty also fill the Twenty homes' empty term fields
 *
 * Two passes, both "fill empty, never replace populated" for the terms:
 *
 * (a) zones — every Kigali Location gets `sector` / `neighbourhood` slugs from
 *     the zone tree (src/lib/geo/kigali-zones.ts). A lead (TikTok, Facebook,
 *     web) is placed by its address text and moved from the district centre to
 *     its zone's centre, as the mirror now does; any other row keeps its pin
 *     and may be placed by it. `state` is normalised to the district's name.
 *
 * (b) terms — the leads' stored ad text (TikTok caption + on-screen text, the
 *     Facebook post, the web ad; from the lanes' ledgers in scripts/crm/.data,
 *     plus the Listing's own title and description) re-read by the rules in
 *     terms-pure.ts: deposit, commission, visit fee, water, electricity,
 *     furnishing. Deterministic and free — no model, no API spend. A stored
 *     reader answer's `furnished` counts too.
 *
 * `--twenty` needs the `furnishing` / terms fields on the live `home` object
 * (scripts/crm/twenty-schema.ts → crm:seed); until then the PATCHes fail and
 * are reported, the Prisma writes stand.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LEAD_SOURCES, planListingTerms, planLocation, termsFromStoredRead, type ListingTermsPatch, type LocationPatch } from './lead-terms-pure';
import type { AdTerms } from './terms-pure';
import { statedFurnished } from './tiktok-pure';

const WRITE = process.argv.includes('--write');
const TWENTY = process.argv.includes('--twenty');
const DATA = join(process.cwd(), 'scripts/crm/.data');

type Row = Record<string, unknown>;
const readJson = <T>(path: string, fallback: T): T => {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** sourceListingId → the ad's own words and the reader's stored answer. */
function loadLedgers(): Map<string, { texts: string[]; read: unknown }> {
  const out = new Map<string, { texts: string[]; read: unknown }>();
  const videos = readJson<Record<string, Row>>(join(DATA, 'tiktok/videos.json'), {});
  for (const v of Object.values(videos)) {
    const read = v.read as Row | undefined;
    const meta = v.meta as Row | undefined;
    out.set(`tiktok:${v.videoId}`, { texts: [meta?.caption as string, read?.onScreenText as string], read: trusted(read, v.readVersion) });
  }
  const posts = readJson<Record<string, Row>>(join(DATA, 'fb-rentals/posts.json'), {});
  for (const p of Object.values(posts)) out.set(`facebook:${p.postId}`, { texts: [p.text as string], read: trusted(p.read as Row | undefined, p.readVersion) });
  for (const site of ['houseinrwanda', 'rwandahouseland', 'imali']) {
    const ads = readJson<Record<string, Row>>(join(DATA, `web-ads/${site}.json`), {});
    for (const [sourceId, r] of Object.entries(ads)) {
      const ad = (r.ad ?? {}) as Row;
      // The site's furnishing label is a stated fact, like the reader's.
      const read = { ...((r.read as Row | undefined) ?? {}), furnished: (ad.furnished as boolean | null) ?? (r.read as Row | undefined)?.furnished ?? null };
      out.set(sourceId, { texts: [ad.title as string, ad.text as string], read });
    }
  }
  return out;
}

/** A stored read with its pre-v4 "furnished: false" guesses taken out. */
const trusted = (read: Row | undefined, version: unknown) =>
  read && { ...read, furnished: statedFurnished({ furnished: (read.furnished as boolean | null | undefined) ?? null }, typeof version === 'string' ? version : null) };

/** A TikTok multi-unit lead (`tiktok:<id>#2`) shares its video's text. */
const ledgerKey = (sourceListingId: string) => sourceListingId.replace(/#\d+$/, '');

async function main() {
  const { db } = await import('../../src/lib/db');

  // ── (a) zones ──────────────────────────────────────────────────────────────
  const locations = await db.location.findMany({
    where: { city: { equals: 'Kigali', mode: 'insensitive' } },
    select: { id: true, address: true, state: true, latitude: true, longitude: true, sector: true, neighbourhood: true, listings: { select: { source: true, title: true } } },
  });
  const locPlans: { id: number; address: string; patch: LocationPatch }[] = [];
  for (const loc of locations) {
    const patch = planLocation(loc);
    if (Object.keys(patch).length) locPlans.push({ id: loc.id, address: loc.address, patch });
  }
  const after = (k: 'sector' | 'neighbourhood') =>
    locations.filter((l) => {
      const p = locPlans.find((x) => x.id === l.id)?.patch;
      return (p && k in p ? p[k] : l[k]) != null;
    }).length;
  const isLead = (l: (typeof locations)[number]) => l.listings.some((x) => (LEAD_SOURCES as readonly string[]).includes(x.source ?? ''));
  console.log(`\n(a) Kigali locations: ${locations.length} (${locations.filter(isLead).length} leads)`);
  console.log(`    with a sector:        ${locations.filter((l) => l.sector).length} → ${after('sector')}`);
  console.log(`    with a neighbourhood: ${locations.filter((l) => l.neighbourhood).length} → ${after('neighbourhood')}`);
  console.log(`    state renamed:        ${locPlans.filter((p) => 'state' in p.patch).length}`);
  console.log(`    leads re-pinned:      ${locPlans.filter((p) => 'latitude' in p.patch).length} (district centre → zone centre)`);
  for (const p of locPlans.slice(0, 8)) console.log(`      #${p.id} "${p.address}" → ${JSON.stringify(p.patch)}`);

  // ── (b) terms ──────────────────────────────────────────────────────────────
  const ledgers = loadLedgers();
  const leads = await db.listing.findMany({
    where: { source: { in: [...LEAD_SOURCES] } },
    select: {
      id: true, source: true, sourceListingId: true, title: true, description: true, priceMonth: true,
      furnished: true, depositMonths: true, commissionPct: true, noCommission: true, viewingFee: true, waterIncluded: true, electricityIncluded: true, termsSource: true,
    },
  });
  const termPlans: { id: number; sourceListingId: string | null; data: ListingTermsPatch; twenty: Row }[] = [];
  let fromLedger = 0;
  for (const l of leads) {
    const led = l.sourceListingId ? ledgers.get(ledgerKey(l.sourceListingId)) : undefined;
    if (led) fromLedger++;
    const stored = termsFromStoredRead(led?.read) as Partial<AdTerms> | null;
    const { data, twenty } = planListingTerms(l, [...(led?.texts ?? []), l.title, l.description], stored);
    if (Object.keys(data).length) termPlans.push({ id: l.id, sourceListingId: l.sourceListingId, data, twenty });
  }
  type L = (typeof leads)[number];
  const count = (pick: (l: L) => unknown) => {
    const before = leads.filter((l) => pick(l) != null).length;
    const now = leads.filter((l) => pick({ ...l, ...(termPlans.find((p) => p.id === l.id)?.data ?? {}) } as L) != null).length;
    return `${before} → ${now}`;
  };
  console.log(`\n(b) leads: ${leads.length} (${fromLedger} with their ad text in a local ledger; the rest read from title + description)`);
  console.log(`    furnished known:   ${count((l) => l.furnished)}`);
  console.log(`    any term (AD):     ${count((l) => l.termsSource)}`);
  console.log(`    deposit:           ${count((l) => l.depositMonths)}`);
  console.log(`    commission %:      ${count((l) => l.commissionPct)}`);
  console.log(`    no-commission set: ${count((l) => l.noCommission)} (true: ${leads.filter((l) => l.noCommission).length} → ${leads.filter((l) => (termPlans.find((p) => p.id === l.id)?.data.noCommission ?? l.noCommission) === true).length})`);
  console.log(`    visit fee:         ${count((l) => l.viewingFee)}`);
  console.log(`    water:             ${count((l) => l.waterIncluded)}`);
  console.log(`    electricity:       ${count((l) => l.electricityIncluded)}`);
  for (const p of termPlans.slice(0, 12)) console.log(`      #${p.id} ${p.sourceListingId} → ${JSON.stringify(p.data)}`);

  if (!WRITE) {
    console.log(`\nDRY RUN — ${locPlans.length} location(s) and ${termPlans.length} lead(s) would change. Pass --write to apply${TWENTY ? '' : ' (--twenty to also fill Twenty)'}.`);
    return;
  }

  for (const p of locPlans) await db.location.update({ where: { id: p.id }, data: p.patch });
  for (const p of termPlans) await db.listing.update({ where: { id: p.id }, data: p.data });
  console.log(`\n✅ ${locPlans.length} location(s) and ${termPlans.length} lead(s) updated in Prisma.`);

  if (!TWENTY) return;
  const { twentyClient } = await import('./twenty-rest');
  const client = twentyClient();
  const homes = await client.all('homes');
  const bySource = new Map(homes.map((h) => [String(h.sourceId ?? ''), h]));
  let patched = 0;
  let failed = 0;
  for (const p of termPlans) {
    const home = p.sourceListingId ? bySource.get(p.sourceListingId) : undefined;
    if (!home) continue;
    // Fill empty only: a value someone typed in Twenty stays. noCommission's default false counts as empty.
    const body = Object.fromEntries(Object.entries(p.twenty).filter(([k]) => home[k] == null || (k === 'noCommission' && home[k] === false)));
    if (!Object.keys(body).length) continue;
    try {
      await client.rest('PATCH', `homes/${home.id}`, body);
      patched++;
    } catch (e) {
      failed++;
      if (failed <= 3) console.warn(`  ! ${p.sourceListingId}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  console.log(`✅ ${patched} Twenty home(s) filled${failed ? ` · ${failed} failed (are the term fields on the live home object?)` : ''}.`);
}

main()
  .then(async () => (await import('../../src/lib/db')).db.$disconnect())
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
