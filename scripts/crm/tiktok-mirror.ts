/**
 * TikTok homes (and Facebook / web ads) → the rental agent's lead pool.
 *
 *   pnpm crm:tiktok-mirror            dry run: what would be written
 *   pnpm crm:tiktok-mirror --apply
 *
 * Kigali's monthly market lives on brokers' TikTok pages (`crm:tiktok` reads
 * them into Twenty `home` records at VETTING). The `/find` agent needs those
 * homes — and the broker's phone — in Prisma to rank them and ask the broker
 * whether they are still available. They enter as LEADS, never as listings:
 * `draft: true, isPublished: false`, so the public catalogue, search and
 * sitemap never show them. Publishing stays a human `live` decision; the agent
 * shows a lead with its source ("from @handle on TikTok") and the broker's
 * answer is what makes it "available".
 *
 * Idempotent: listing keyed by `sourceListingId` (= Twenty `sourceId`,
 * `tiktok:<videoId>`, `facebook:<postId>`, `web:<…>`), broker by `sourceHostId`
 * (`tiktok:<handle>`, else `<source>:<phone>`). When the broker directory
 * (`crm:brokers`) knows the broker, each ListingBroker row points at it. The one
 * thing written back to Twenty is the home's `mkanListingId`: without it
 * crm:sync-up could not tell the lead was already on the board and made a copy.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { twentyClient, phoneOf, fromMicros, type Currency, type Phones } from './twenty-rest';
import { twentyEnumToPrisma } from './home-intake-pure';
import { DISTRICTS, KIGALI } from '../../src/lib/geo/rwanda-places';
import { factsFromFeatures, type FeatureFacts } from '../../src/components/agent/amenities';
import { placeToken } from '../../src/lib/geo/place-token';
import { termsFromHome, zoneForLead, type LeadTerms } from './lead-terms-pure';

type Row = Record<string, unknown>;

if (!(process.env.TWENTY_API_URL ?? '').trim()) process.env.TWENTY_API_URL = 'http://localhost:3100';
if (!(process.env.TWENTY_API_KEY ?? '').trim()) {
  try {
    process.env.TWENTY_API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    /* twentyClient() reports it */
  }
}

const SKIP_STAGES = new Set(['DECLINED', 'DUPLICATE', 'REJECTED']);
const PROPERTY_TYPES = new Set(['Rooms', 'Tinyhouse', 'Apartment', 'Villa', 'Townhouse', 'Cottage']);

/** Lead sources the mirror accepts: TikTok, Facebook posts and web ads all land in Twenty as homes. */
export const MIRROR_SOURCES = ['TIKTOK', 'FACEBOOK', 'WEB'] as const;
export type MirrorSource = (typeof MIRROR_SOURCES)[number];

export interface MirrorPlan {
  sourceId: string;
  source: MirrorSource;
  /** The Twenty home, and the site row it already points at (if any). */
  crm: { homeId: string; mkanListingId: number | null };
  /**
   * `key` is the broker User's `sourceHostId`: `tiktok:<handle>` whenever the
   * host has a handle (every TikTok home does), else `<source>:<phone>`.
   */
  broker: { handle: string | null; key: string; name: string; phone: string; role: 'BROKER' | 'OWNER' };
  location: {
    address: string;
    state: string;
    zoneKey: string | null;
    latitude: number;
    longitude: number;
    /** Kigali zone slugs (src/lib/geo/kigali-zones.ts), from the place the ad names. */
    sector: string | null;
    neighbourhood: string | null;
  };
  listing: {
    sourceListingId: string;
    sourceUrl: string | null;
    sourceCapturedAt: Date | null;
    title: string;
    description: string | null;
    priceMonth: number;
    bedrooms: number | null;
    bathrooms: number | null;
    propertyType: string | null;
    photoUrls: string[];
    /** What the video showed (parking, a water tank, furnished…), for the agent's must-haves. */
    facts: FeatureFacts;
    /** The ad's furnishing (Twenty `furnishing`), else what the features said; null = not stated. */
    furnished: boolean | null;
    /** The renting terms as the ad states them; null when it states none (the agent then says "typical"). */
    terms: LeadTerms | null;
  };
}

/** Same terms as the plan, or the plan has none to write (a backfilled row is then left alone). */
function sameTerms(existing: Partial<Record<keyof LeadTerms, unknown>>, terms: LeadTerms | null): boolean {
  if (!terms) return true;
  return (Object.keys(terms) as (keyof LeadTerms)[]).every((k) => (existing[k] ?? null) === terms[k]);
}

const links = (v: unknown): string[] => {
  const l = v as { primaryLinkUrl?: string | null; secondaryLinks?: { url?: string | null }[] | null } | null;
  if (!l) return [];
  return [l.primaryLinkUrl, ...(l.secondaryLinks ?? []).map((s) => s.url)].filter((u): u is string => !!u && /^https?:\/\//.test(u));
};

/** One Twenty home + its host → what the lead pool should hold, or why not. */
export function planMirror(home: Row, host: Row | null): MirrorPlan | { skip: string } {
  const sourceId = (home.sourceId as string | null) ?? '';
  const source = MIRROR_SOURCES.find((s) => s === home.source);
  if (!source || !sourceId.startsWith(`${source.toLowerCase()}:`)) return { skip: 'not a TikTok, Facebook or web home' };
  if (SKIP_STAGES.has(String(home.pipelineStage)) || SKIP_STAGES.has(String(home.homeStatus))) return { skip: `stage ${home.pipelineStage}` };
  if (home.rentPeriod !== 'MONTH') return { skip: 'not a monthly rent' };
  const priceMonth = fromMicros(home.priceMonthLocal as Currency | null);
  if (!priceMonth || priceMonth < 10_000) return { skip: 'no monthly price' };
  const phone = phoneOf((host?.phone as Phones | null) ?? null) ?? phoneOf(home.hostPhone as Phones | null);
  if (!phone) return { skip: 'no broker phone' };
  const handle = ((host?.tiktokHandle as string | null) ?? '').replace(/^@/, '').trim().toLowerCase() || null;
  if (!handle && source === 'TIKTOK') return { skip: 'no TikTok handle' };

  const neighbourhood = ((home.homeAddress as Row | null)?.addressStreet1 as string | null) ?? null;
  const title = ((home.titleEn as string | null) || (home.title as string | null) || 'Home in Kigali').replace(/\s+/g, ' ').trim();
  const filed = DISTRICTS.find((d) => d.code === String(home.homeState ?? '').toUpperCase())?.code ?? null;
  const zone = zoneForLead({ neighbourhood, title, districtCode: filed });
  const district = DISTRICTS.find((d) => d.code === (filed ?? zone?.district));
  // Pinned at the most specific zone the ad names (neighbourhood > sector), else
  // the district centre. Still approximate: the ad gives a place, not a gate.
  const pin = zone && zone.zone.level !== 'district' ? zone.zone : district;
  const furnishing = home.furnishing === 'FURNISHED' ? true : home.furnishing === 'UNFURNISHED' ? false : null;
  const facts = factsFromFeatures(Array.isArray(home.amenitiesRaw) ? (home.amenitiesRaw as unknown[]).map(String) : []);
  const type = home.propertyType ? twentyEnumToPrisma(String(home.propertyType)) : null;
  const scrapedAt = home.scrapedAt ? new Date(String(home.scrapedAt)) : null;

  return {
    sourceId,
    source,
    crm: { homeId: String(home.id), mkanListingId: typeof home.mkanListingId === 'number' ? home.mkanListingId : null },
    broker: {
      handle,
      key: handle ? `tiktok:${handle}` : `${source.toLowerCase()}:${phone.replace(/^\+/, '')}`,
      name: ((host?.name as string | null) ?? (home.hostName as string | null) ?? handle ?? phone).trim(),
      phone,
      role: host?.agencySuspected === false ? 'OWNER' : 'BROKER',
    },
    location: {
      address: neighbourhood?.trim() || district?.nameEn || "Kigali",
      state: district?.nameEn ?? '',
      zoneKey: district ? `KIGALI_${district.code}` : null,
      // No pin from a video: the district centre, said so by the address.
      latitude: pin?.lat ?? KIGALI.lat,
      longitude: pin?.lng ?? KIGALI.lng,
      sector: zone?.sector ?? null,
      neighbourhood: zone?.neighbourhood ?? null,
    },
    listing: {
      sourceListingId: sourceId,
      sourceUrl: links(home.sourceUrl)[0] ?? null,
      sourceCapturedAt: scrapedAt && !Number.isNaN(scrapedAt.getTime()) ? scrapedAt : null,
      title,
      description: (home.descriptionEn as string | null) || (home.description as string | null) || null,
      priceMonth,
      bedrooms: (home.bedrooms as number | null) ?? null,
      bathrooms: (home.bathrooms as number | null) ?? null,
      propertyType: type && PROPERTY_TYPES.has(type) ? type : null,
      photoUrls: links(home.photoUrls),
      facts,
      furnished: furnishing ?? facts.furnished,
      terms: termsFromHome(home),
    },
  };
}

/**
 * The directory entry (scripts/crm/brokers.ts) for a broker, by handle or phone.
 * Until the broker_directory migration reaches the database the table does not
 * exist; the first failure turns the lookup off so the daily mirror keeps running.
 */
type Db = (typeof import('../../src/lib/db'))['db'];
let directoryLive = true;
async function directoryBrokerId(db: Db, handle: string | null, phone: string): Promise<string | null> {
  if (!directoryLive) return null;
  try {
    const b = await db.broker.findFirst({
      where: { OR: [...(handle ? [{ tiktokHandle: handle }] : []), { phones: { has: phone } }] },
      orderBy: { listingsCount: 'desc' },
      select: { id: true },
    });
    return b?.id ?? null;
  } catch (e) {
    directoryLive = false;
    console.warn(`  (broker directory not readable — ListingBroker.brokerId left unset: ${(e as Error).message.split('\n').pop()?.slice(0, 120)})`);
    return null;
  }
}

/** Mirror every eligible TikTok / Facebook / web home into the lead pool. Also run by `crm:tiktok run --apply`. */
export async function mirrorLeads(apply: boolean): Promise<{ planned: number; written: number; created: number; unchanged: number; linked: number }> {
  const client = twentyClient();
  const [homes, hosts] = await Promise.all([client.all('homes'), client.all('hosts')]);
  const hostById = new Map(hosts.map((h) => [String(h.id), h]));
  const plans: MirrorPlan[] = [];
  const skipped = new Map<string, number>();
  for (const home of homes) {
    if (!MIRROR_SOURCES.includes(home.source as MirrorSource)) continue;
    const plan = planMirror(home, hostById.get(String(home.hostId)) ?? null);
    if ('skip' in plan) skipped.set(plan.skip, (skipped.get(plan.skip) ?? 0) + 1);
    else plans.push(plan);
  }
  console.log(`TikTok / Facebook / web homes → leads: ${plans.length} to mirror; skipped ${[...skipped].map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`);
  if (!apply) {
    for (const p of plans) console.log(`  ${p.sourceId}  ${p.broker.handle ? `@${p.broker.handle}` : p.broker.key} (${p.broker.role})  ${p.listing.bedrooms ?? '?'}bd  RWF ${p.listing.priceMonth}/mo  ${p.location.address}${p.location.neighbourhood ?? p.location.sector ? ` → ${p.location.neighbourhood ?? p.location.sector}` : ''}${p.listing.terms ? '  +terms' : ''}`);
    console.log('\nDRY RUN — pass --apply to write the leads.');
    return { planned: plans.length, written: 0, created: 0, unchanged: 0, linked: 0 };
  }

  const { db } = await import('../../src/lib/db');
  const { default: bcrypt } = await import('bcryptjs');
  // One house, several brokers: a lead with the same facts posted by someone
  // else gets this broker added to it instead of a second listing. The board
  // then holds two homes pointing at one lead, which crm:hygiene marks.
  const factKey = (beds: number | null, price: number | null, place: string | null) =>
    beds != null && price ? `${beds}|${Math.round(Math.log(price) / Math.log(1.05))}|${placeToken(place)}` : null;
  const leads = await db.listing.findMany({
    where: { source: { in: [...MIRROR_SOURCES] } },
    select: { id: true, sourceListingId: true, bedrooms: true, priceMonth: true, hostId: true, location: { select: { address: true } } },
  });
  const leadByFacts = new Map<string, (typeof leads)[number]>();
  for (const l of leads) {
    const k = factKey(l.bedrooms, l.priceMonth, l.location?.address ?? null);
    if (k && placeToken(l.location?.address) && !leadByFacts.has(k)) leadByFacts.set(k, l);
  }

  let written = 0;
  let created = 0;
  let unchanged = 0;
  let linked = 0;
  let shared = 0;
  for (const p of plans) {
    const sourceHostId = p.broker.key;
    let broker = await db.user.findUnique({ where: { sourceHostId }, select: { id: true } });
    // No handle (a Facebook or web poster): the same number already brokering a lead is the same broker.
    if (!broker && !p.broker.handle) {
      broker = await db.user.findFirst({ where: { phoneNumber: p.broker.phone, brokerListings: { some: {} } }, select: { id: true } });
    }
    if (!broker) {
      const usernameFree = p.broker.handle ? !(await db.user.findUnique({ where: { username: `@${p.broker.handle}` }, select: { id: true } })) : false;
      broker = await db.user.create({
        data: {
          email: sourceHostId,
          sourceHostId,
          username: usernameFree ? `@${p.broker.handle}` : null,
          phoneNumber: p.broker.phone,
          // Nobody signs in as a lead's broker; the answer page needs no account.
          password: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
          role: 'MANAGER',
        },
        select: { id: true },
      });
    } else {
      await db.user.update({ where: { id: broker.id }, data: { phoneNumber: p.broker.phone } });
    }

    const brokerId = await directoryBrokerId(db, p.broker.handle, p.broker.phone);
    const linkBroker = brokerId ? { brokerId } : {};

    const existing = await db.listing.findUnique({
      where: { sourceListingId: p.sourceId },
      select: {
        id: true, locationId: true, isPublished: true, title: true, description: true, priceMonth: true, bedrooms: true, bathrooms: true, propertyType: true, photoUrls: true, sourceUrl: true, hostId: true,
        furnished: true, depositMonths: true, commissionPct: true, noCommission: true, viewingFee: true, waterIncluded: true, electricityIncluded: true, termsSource: true,
        location: { select: { address: true, zoneKey: true, sector: true, neighbourhood: true, latitude: true, longitude: true } },
      },
    });
    // Every lead was rewritten every day ("written" 104 → 126 with nothing new).
    // Same facts as last time: leave the row — and any hand edits — alone.
    if (
      existing &&
      p.crm.mkanListingId === existing.id &&
      existing.hostId === broker.id &&
      existing.title === p.listing.title &&
      existing.description === p.listing.description &&
      existing.priceMonth === p.listing.priceMonth &&
      existing.bedrooms === p.listing.bedrooms &&
      existing.bathrooms === p.listing.bathrooms &&
      (existing.propertyType ?? null) === p.listing.propertyType &&
      existing.sourceUrl === p.listing.sourceUrl &&
      JSON.stringify(existing.photoUrls) === JSON.stringify(p.listing.photoUrls) &&
      existing.location?.address === p.location.address &&
      (existing.location?.zoneKey ?? null) === p.location.zoneKey &&
      (existing.location?.sector ?? null) === p.location.sector &&
      (existing.location?.neighbourhood ?? null) === p.location.neighbourhood &&
      existing.location?.latitude === p.location.latitude &&
      existing.location?.longitude === p.location.longitude &&
      (p.listing.furnished == null || existing.furnished === p.listing.furnished) &&
      sameTerms(existing, p.listing.terms)
    ) {
      unchanged += 1;
      if (brokerId) {
        await db.listingBroker.updateMany({
          where: { listingId: existing.id, userId: broker.id, OR: [{ brokerId: null }, { brokerId: { not: brokerId } }] },
          data: { brokerId },
        });
      }
      continue;
    }
    const k = factKey(p.listing.bedrooms, p.listing.priceMonth, p.location.address);
    const same = !existing && k && placeToken(p.location.address) ? leadByFacts.get(k) : undefined;
    if (same && same.hostId !== broker.id) {
      await db.listingBroker.upsert({
        where: { listingId_userId: { listingId: same.id, userId: broker.id } },
        update: { role: p.broker.role, sourceUrl: p.listing.sourceUrl, ...linkBroker },
        create: { listingId: same.id, userId: broker.id, role: p.broker.role, sourceUrl: p.listing.sourceUrl, ...linkBroker },
        select: { id: true },
      });
      if (p.crm.mkanListingId !== same.id) {
        await client.rest('PATCH', `homes/${p.crm.homeId}`, { mkanListingId: same.id, duplicateCheck: 'SUSPECTED' }).catch((e) => console.warn(`  ! link ${p.sourceId}: ${(e as Error).message.slice(0, 120)}`));
      }
      console.log(`  ≡ ${p.sourceId} @${p.broker.handle} — same home as lead #${same.id} (${same.sourceListingId}); broker added`);
      shared += 1;
      continue;
    }
    const locationData = {
      address: p.location.address,
      city: 'Kigali',
      state: p.location.state,
      country: 'Rwanda',
      postalCode: '',
      latitude: p.location.latitude,
      longitude: p.location.longitude,
      zoneKey: p.location.zoneKey,
      sector: p.location.sector,
      neighbourhood: p.location.neighbourhood,
    };
    let locationId = existing?.locationId ?? null;
    if (locationId) await db.location.update({ where: { id: locationId }, data: locationData });
    else locationId = (await db.location.create({ data: locationData, select: { id: true } })).id;

    const listingData = {
      source: p.source,
      sourceUrl: p.listing.sourceUrl,
      sourceCapturedAt: p.listing.sourceCapturedAt,
      canonicalLocale: 'en',
      title: p.listing.title,
      description: p.listing.description,
      rentPeriod: 'MONTHLY' as const,
      priceMonth: p.listing.priceMonth,
      currency: 'RWF',
      bedrooms: p.listing.bedrooms,
      bathrooms: p.listing.bathrooms,
      propertyType: p.listing.propertyType as never,
      photoUrls: p.listing.photoUrls,
      amenities: p.listing.facts.amenities as never,
      // Unstated furnishing / terms are left as they are: crm:backfill-terms may have read them from the caption.
      ...(p.listing.furnished != null ? { furnished: p.listing.furnished } : {}),
      ...(p.listing.terms ?? {}),
      isParkingIncluded: p.listing.facts.isParkingIncluded,
      isPetsAllowed: p.listing.facts.isPetsAllowed,
      hostId: broker.id,
      locationId,
    };
    const listing = existing
      ? // A lead someone already took `live` keeps its publish state.
        await db.listing.update({ where: { id: existing.id }, data: listingData, select: { id: true } })
      : await db.listing.create({ data: { ...listingData, sourceListingId: p.sourceId, draft: true, isPublished: false }, select: { id: true } });
    if (!existing) created += 1;
    if (!existing && k && placeToken(p.location.address) && !leadByFacts.has(k)) {
      leadByFacts.set(k, { id: listing.id, sourceListingId: p.sourceId, bedrooms: p.listing.bedrooms, priceMonth: p.listing.priceMonth, hostId: broker.id, location: { address: p.location.address } });
    }
    await db.listingBroker.upsert({
      where: { listingId_userId: { listingId: listing.id, userId: broker.id } },
      update: { role: p.broker.role, sourceUrl: p.listing.sourceUrl, ...linkBroker },
      create: { listingId: listing.id, userId: broker.id, role: p.broker.role, sourceUrl: p.listing.sourceUrl, ...linkBroker },
      select: { id: true },
    });
    if (p.crm.mkanListingId !== listing.id) {
      try {
        await client.rest('PATCH', `homes/${p.crm.homeId}`, {
          mkanListingId: listing.id,
          mkanListingUrl: { primaryLinkUrl: `https://www.mkan.sd/en/listings/${listing.id}`, primaryLinkLabel: '', secondaryLinks: [] },
        });
        linked += 1;
      } catch (e) {
        console.warn(`  ! link ${p.sourceId} → #${listing.id}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    written += 1;
  }
  console.log(`✅ ${created} new lead(s) · ${written - created} updated · ${unchanged} unchanged · ${linked} CRM homes linked to their lead · ${shared} added as a second broker`);
  return { planned: plans.length, written, created, unchanged, linked };
}

if (process.argv[1] && /tiktok-mirror\.ts$/.test(process.argv[1])) {
  mirrorLeads(process.argv.includes('--apply'))
    .then(async () => (await import('../../src/lib/db')).db.$disconnect())
    .catch((e) => {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    });
}
