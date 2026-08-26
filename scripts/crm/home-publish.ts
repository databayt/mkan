/**
 * `live 0005-01` — the human word that puts a Slack-born home on mkan.sd.
 *
 *   pnpm home:publish --code=0005-01            dry run: what would be written
 *   FORCE_SEED=1 pnpm home:publish --code=0005-01 --apply
 *
 * Order matters and is the design (kun docs/home → "Saying live"): the SITE is
 * written first — host account, location, the listing carrying the code — and
 * only then does Twenty mirror LIVE. State truth is mkan Prisma; Twenty is the
 * ops mirror. Twenty's own webhook then re-touches the row, which is harmless.
 *
 * Refuses unless the record is at CLAIMED with every must-have present (or
 * --force). Nothing is fabricated: no claimedAt, no invented guest count, and
 * a pin that is only the zone centre is said so in the address.
 */
import { config } from 'dotenv';
config({ override: true });

import { execSync } from 'node:child_process';
import { twentyClient, phoneOf, fromMicros, type Currency, type Phones } from './twenty-rest';
import { getPortSudanZone } from '../../src/lib/geo/portsudan-zones';
import { liveUrl, mustGaps, twentyEnumToPrisma, zoneSlug, type HomeFacts } from './home-intake-pure';

/** One password for every provisioned host account — the convention the CRM field records. */
const DEFAULT_PASSWORD = (process.env.MKAN_DEFAULT_PASSWORD ?? '').trim() || '1234';

type Row = Record<string, unknown>;
const trim = (v: string | null | undefined): string => (v ?? '').trim();

if (!trim(process.env.TWENTY_API_URL)) process.env.TWENTY_API_URL = 'http://localhost:3100';
if (!trim(process.env.TWENTY_API_KEY)) {
  try {
    process.env.TWENTY_API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    /* twentyClient() reports it */
  }
}

const linkOne = (url: string, label = '') => ({ primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] });

export interface PublishResult {
  ok: boolean;
  code: string;
  url: string | null;
  listingId: number | null;
  reason: string | null;
  pinNote: string | null;
}

function factsOf(h: Row): HomeFacts {
  const addr = (h.homeAddress as Row | null) ?? null;
  return {
    titleAr: (h.titleAr as string | null) || (h.name as string | null) || null,
    descriptionAr: (h.descriptionAr as string | null) || (h.description as string | null) || null,
    propertyType: (h.propertyType as string | null) ?? null,
    bedrooms: (h.bedrooms as number | null) ?? null,
    bathrooms: (h.bathrooms as number | null) ?? null,
    beds: (h.beds as number | null) ?? null,
    guestCapacity: (h.guestCapacity as number | null) ?? null,
    priceNightSdg: fromMicros(h.priceNightSdg as Currency | null),
    priceConfirmed: Boolean(h.priceConfirmedByHost),
    zone: (h.zone as string | null) ?? null,
    mapsUrl: ((h.googleMapsUrl as Row | null)?.primaryLinkUrl as string | null) ?? null,
    latitude: (addr?.addressLat as number | null) ?? null,
    longitude: (addr?.addressLng as number | null) ?? null,
    hostPhone: phoneOf(h.hostPhone as Phones | null),
    amenities: Array.isArray(h.amenities) ? (h.amenities as string[]) : [],
    rawWords: Array.isArray(h.amenitiesRaw) ? (h.amenitiesRaw as string[]) : [],
    photoCount: (h.photoCount as number | null) ?? 0,
  };
}

/** Put one Twenty home on the site. `apply=false` prints the plan and writes nothing. */
export async function publishHome(code: string, opts: { apply: boolean; force?: boolean }): Promise<PublishResult> {
  const client = twentyClient();
  const res = (await client.rest('GET', `homes?filter=listingId[eq]:"${encodeURIComponent(code)}"&limit=1`)) as { data?: { homes?: Row[] } };
  const home = res.data?.homes?.[0];
  if (!home) return { ok: false, code, url: null, listingId: null, reason: `no home with code ${code} in Twenty`, pinNote: null };
  const f = factsOf(home);
  const gaps = mustGaps(f);
  const stage = home.pipelineStage as string | null;
  if ((stage === 'LIVE' || home.publishState === 'LIVE' || home.mkanPublishState === 'LIVE') && home.mkanListingId) {
    return { ok: true, code, url: liveUrl(code), listingId: Number(home.mkanListingId), reason: 'already live — the site row is kept in step by crm:sync-down, not re-created', pinNote: null };
  }
  if (!opts.force) {
    if (gaps.length) return { ok: false, code, url: null, listingId: null, reason: `missing: ${gaps.map((g) => g.en).join(', ')} / ناقص: ${gaps.map((g) => g.ar).join('، ')}`, pinNote: null };
    if (stage !== 'CLAIMED') return { ok: false, code, url: null, listingId: null, reason: `stage is ${stage ?? '—'}, not CLAIMED — confirm the price with the host first (السعر مؤكد)`, pinNote: null };
  }
  const account = (home.account as string | null) ?? code.slice(0, 4);

  // the pin: map link → address lat/lng → zone centre (said so)
  const slug = zoneSlug(f.zone);
  const zone = getPortSudanZone(slug);
  let lat = f.latitude, lng = f.longitude, pinNote: string | null = null;
  if ((lat == null || lng == null) && zone?.lat != null && zone?.lng != null) {
    lat = zone.lat; lng = zone.lng;
    pinNote = `pin = zone centre (${zone.nameAr}) until a map link arrives`;
  }
  if (lat == null || lng == null) return { ok: false, code, url: null, listingId: null, reason: 'no pin: send a map link or a known zone', pinNote: null };
  const addressText = ((home.homeAddress as Row | null)?.addressStreet1 as string | null) || zone?.nameAr || 'بورتسودان';

  const { Amenity, Highlight, PropertyType } = await import('@prisma/client');
  const amenities = f.amenities.map(twentyEnumToPrisma).filter((a): a is keyof typeof Amenity => a in Amenity);
  const highlights = (Array.isArray(home.highlights) ? (home.highlights as string[]) : []).map(twentyEnumToPrisma).filter((h): h is keyof typeof Highlight => h in Highlight);
  const propertyType = f.propertyType ? twentyEnumToPrisma(f.propertyType) : null;
  if (!propertyType || !(propertyType in PropertyType)) return { ok: false, code, url: null, listingId: null, reason: `property type ${f.propertyType ?? '—'} is not one the site knows`, pinNote };
  const now = new Date();
  const listingData = {
    code,
    source: 'MANUAL' as const,
    canonicalLocale: 'ar',
    title: f.titleAr!,
    description: f.descriptionAr!,
    pricePerNight: f.priceNightSdg!,
    propertyType: propertyType as keyof typeof PropertyType,
    bedrooms: f.bedrooms!,
    bathrooms: f.bathrooms!,
    ...(f.guestCapacity != null ? { guestCount: f.guestCapacity } : {}),
    amenities,
    highlights,
    isPetsAllowed: f.amenities.includes('PETS_ALLOWED'),
    isParkingIncluded: f.amenities.includes('PARKING'),
    draft: false,
    isPublished: true,
    postedDate: now,
    lastAvailabilityConfirmedAt: now,
  };
  const plan = { account, location: { addressText, lat, lng, zoneKey: slug }, listing: listingData, pinNote };
  if (!opts.apply) {
    console.log('DRY RUN — would write to the site:\n' + JSON.stringify(plan, null, 2));
    return { ok: true, code, url: liveUrl(code), listingId: null, reason: 'dry run', pinNote };
  }
  if (process.env.FORCE_SEED !== '1') return { ok: false, code, url: null, listingId: null, reason: 'refusing to write the site without FORCE_SEED=1 (the mkan-import guard)', pinNote };

  const { db } = await import('../../src/lib/db');
  const { default: bcrypt } = await import('bcryptjs');
  // The account number IS the address. `User.email` is a required unique column, so it
  // holds the number itself rather than a domain nobody was ever told about; the host
  // types `0006` and the shared password, and that is the whole of what they know.
  // `username` is what a guest reads under "Hosted by", so it is the host's name when
  // that name is still free, and the number only as a fallback.
  const email = account;
  const hostName = ((home.hostName as string | null) ?? '').trim();
  const nameFree = hostName ? !(await db.user.findUnique({ where: { username: hostName }, select: { id: true } })) : false;
  const user = await db.user.upsert({
    where: { email },
    update: { role: 'MANAGER', emailVerified: now },
    create: { email, username: nameFree ? hostName : account, password: await bcrypt.hash(DEFAULT_PASSWORD, 10), role: 'MANAGER', emailVerified: now },
  });
  const existing = await db.listing.findUnique({ where: { code }, select: { id: true, locationId: true } });
  let locationId = existing?.locationId ?? null;
  if (!locationId) {
    const loc = await db.location.create({ data: { address: addressText, city: 'Port Sudan', state: 'Red Sea', country: 'Sudan', postalCode: '', latitude: lat, longitude: lng, zoneKey: slug } });
    locationId = loc.id;
  } else {
    await db.location.update({ where: { id: locationId }, data: { address: addressText, latitude: lat, longitude: lng, zoneKey: slug } });
  }
  const listing = existing
    ? await db.listing.update({ where: { id: existing.id }, data: { ...listingData, hostId: user.id, locationId } })
    : await db.listing.create({ data: { ...listingData, hostId: user.id, locationId } });
  const url = liveUrl(code);
  if (home.hostId) {
    // `mkan account` (an EMAILS field) is left alone — it was the address, and there is
    // no address any more. `mkan username` is the account.
    await client.rest('PATCH', `hosts/${home.hostId}`, {
      mkanUsername: account,
      accountProvisionedAt: now.toISOString(),
    });
  }
  await client.rest('PATCH', `homes/${home.id}`, {
    publishState: 'LIVE',
    mkanPublishState: 'LIVE',
    pipelineStage: 'LIVE',
    publishedAt: now.toISOString(),
    importedAt: (home.importedAt as string | null) ?? now.toISOString(),
    mkanListingId: listing.id,
    mkanListingUrl: linkOne(url, 'mkan.sd'),
    listingUrl: linkOne(url, 'mkan.sd'),
  });
  await db.$disconnect();
  return { ok: true, code, url, listingId: listing.id, reason: null, pinNote };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
if (process.argv[1] && /home-publish\.ts$/.test(process.argv[1])) {
  const argv = (n: string, d = ''): string => {
    const h = process.argv.find((a) => a.startsWith(`--${n}=`));
    return h ? h.split('=').slice(1).join('=') : d;
  };
  const code = argv('code');
  if (!code) {
    console.error('usage: home:publish --code=NNNN-NN [--apply] [--force]');
    process.exit(1);
  }
  publishHome(code, { apply: process.argv.includes('--apply'), force: process.argv.includes('--force') })
    .then((r) => {
      console.log(r.ok ? `✅ ${r.code} → ${r.url ?? ''} ${r.reason ? `(${r.reason})` : ''} ${r.pinNote ? `· ${r.pinNote}` : ''}` : `❌ ${r.code}: ${r.reason}`);
      process.exit(r.ok ? 0 : 2);
    })
    .catch((e) => {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    });
}
