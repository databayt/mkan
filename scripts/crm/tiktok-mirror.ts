/**
 * TikTok homes → the rental agent's lead pool.
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
 * `tiktok:<videoId>`), broker by `sourceHostId` (`tiktok:<handle>`). The one
 * thing written back to Twenty is the home's `mkanListingId`: without it
 * crm:sync-up could not tell the lead was already on the board and made a copy.
 */
import { config } from 'dotenv';
config({ override: true });

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { twentyClient, phoneOf, fromMicros, type Currency, type Phones } from './twenty-rest';
import { twentyEnumToPrisma } from './home-intake-pure';
import { DISTRICTS, KIGALI } from '../../src/lib/geo/rwanda-places';

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

export interface MirrorPlan {
  sourceId: string;
  /** The Twenty home, and the site row it already points at (if any). */
  crm: { homeId: string; mkanListingId: number | null };
  broker: { handle: string; name: string; phone: string; role: 'BROKER' | 'OWNER' };
  location: { address: string; state: string; zoneKey: string | null; latitude: number; longitude: number };
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
  };
}

const links = (v: unknown): string[] => {
  const l = v as { primaryLinkUrl?: string | null; secondaryLinks?: { url?: string | null }[] | null } | null;
  if (!l) return [];
  return [l.primaryLinkUrl, ...(l.secondaryLinks ?? []).map((s) => s.url)].filter((u): u is string => !!u && /^https?:\/\//.test(u));
};

/** One Twenty home + its host → what the lead pool should hold, or why not. */
export function planMirror(home: Row, host: Row | null): MirrorPlan | { skip: string } {
  const sourceId = (home.sourceId as string | null) ?? '';
  if (home.source !== 'TIKTOK' || !sourceId.startsWith('tiktok:')) return { skip: 'not a TikTok home' };
  if (SKIP_STAGES.has(String(home.pipelineStage)) || SKIP_STAGES.has(String(home.homeStatus))) return { skip: `stage ${home.pipelineStage}` };
  if (home.rentPeriod !== 'MONTH') return { skip: 'not a monthly rent' };
  const priceMonth = fromMicros(home.priceMonthLocal as Currency | null);
  if (!priceMonth || priceMonth < 10_000) return { skip: 'no monthly price' };
  const phone = phoneOf((host?.phone as Phones | null) ?? null) ?? phoneOf(home.hostPhone as Phones | null);
  if (!phone) return { skip: 'no broker phone' };
  const handle = ((host?.tiktokHandle as string | null) ?? '').replace(/^@/, '').trim().toLowerCase();
  if (!handle) return { skip: 'no TikTok handle' };

  const districtCode = String(home.homeState ?? '').toUpperCase();
  const district = DISTRICTS.find((d) => d.code === districtCode);
  const neighbourhood = ((home.homeAddress as Row | null)?.addressStreet1 as string | null) ?? null;
  const type = home.propertyType ? twentyEnumToPrisma(String(home.propertyType)) : null;
  const scrapedAt = home.scrapedAt ? new Date(String(home.scrapedAt)) : null;

  return {
    sourceId,
    crm: { homeId: String(home.id), mkanListingId: typeof home.mkanListingId === 'number' ? home.mkanListingId : null },
    broker: {
      handle,
      name: ((host?.name as string | null) ?? (home.hostName as string | null) ?? handle).trim(),
      phone,
      role: host?.agencySuspected === false ? 'OWNER' : 'BROKER',
    },
    location: {
      address: neighbourhood?.trim() || district?.nameEn || "Kigali",
      state: district?.nameEn ?? '',
      zoneKey: district ? `KIGALI_${district.code}` : null,
      // No pin from a video: the district centre, said so by the address.
      latitude: district?.lat ?? KIGALI.lat,
      longitude: district?.lng ?? KIGALI.lng,
    },
    listing: {
      sourceListingId: sourceId,
      sourceUrl: links(home.sourceUrl)[0] ?? null,
      sourceCapturedAt: scrapedAt && !Number.isNaN(scrapedAt.getTime()) ? scrapedAt : null,
      title: ((home.titleEn as string | null) || (home.title as string | null) || 'Home in Kigali').replace(/\s+/g, ' ').trim(),
      description: (home.descriptionEn as string | null) || (home.description as string | null) || null,
      priceMonth,
      bedrooms: (home.bedrooms as number | null) ?? null,
      bathrooms: (home.bathrooms as number | null) ?? null,
      propertyType: type && PROPERTY_TYPES.has(type) ? type : null,
      photoUrls: links(home.photoUrls),
    },
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const client = twentyClient();
  const [homes, hosts] = await Promise.all([client.all('homes'), client.all('hosts')]);
  const hostById = new Map(hosts.map((h) => [String(h.id), h]));
  const plans: MirrorPlan[] = [];
  const skipped = new Map<string, number>();
  for (const home of homes) {
    if (home.source !== 'TIKTOK') continue;
    const plan = planMirror(home, hostById.get(String(home.hostId)) ?? null);
    if ('skip' in plan) skipped.set(plan.skip, (skipped.get(plan.skip) ?? 0) + 1);
    else plans.push(plan);
  }
  console.log(`TikTok homes → leads: ${plans.length} to mirror; skipped ${[...skipped].map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}`);
  if (!apply) {
    for (const p of plans) console.log(`  ${p.sourceId}  @${p.broker.handle} (${p.broker.role})  ${p.listing.bedrooms ?? '?'}bd  RWF ${p.listing.priceMonth}/mo  ${p.location.address}`);
    console.log('\nDRY RUN — pass --apply to write the leads.');
    return;
  }

  const { db } = await import('../../src/lib/db');
  const { default: bcrypt } = await import('bcryptjs');
  let written = 0;
  let linked = 0;
  for (const p of plans) {
    const sourceHostId = `tiktok:${p.broker.handle}`;
    let broker = await db.user.findUnique({ where: { sourceHostId }, select: { id: true } });
    if (!broker) {
      const usernameFree = !(await db.user.findUnique({ where: { username: `@${p.broker.handle}` }, select: { id: true } }));
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

    const existing = await db.listing.findUnique({ where: { sourceListingId: p.sourceId }, select: { id: true, locationId: true, isPublished: true } });
    const locationData = { address: p.location.address, city: 'Kigali', state: p.location.state, country: 'Rwanda', postalCode: '', latitude: p.location.latitude, longitude: p.location.longitude, zoneKey: p.location.zoneKey };
    let locationId = existing?.locationId ?? null;
    if (locationId) await db.location.update({ where: { id: locationId }, data: locationData });
    else locationId = (await db.location.create({ data: locationData, select: { id: true } })).id;

    const listingData = {
      source: 'TIKTOK' as const,
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
      hostId: broker.id,
      locationId,
    };
    const listing = existing
      ? // A lead someone already took `live` keeps its publish state.
        await db.listing.update({ where: { id: existing.id }, data: listingData, select: { id: true } })
      : await db.listing.create({ data: { ...listingData, sourceListingId: p.sourceId, draft: true, isPublished: false }, select: { id: true } });
    await db.listingBroker.upsert({
      where: { listingId_userId: { listingId: listing.id, userId: broker.id } },
      update: { role: p.broker.role, sourceUrl: p.listing.sourceUrl },
      create: { listingId: listing.id, userId: broker.id, role: p.broker.role, sourceUrl: p.listing.sourceUrl },
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
  console.log(`✅ ${written} leads mirrored · ${linked} CRM homes linked to their lead`);
  await db.$disconnect();
}

if (process.argv[1] && /tiktok-mirror\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
}
