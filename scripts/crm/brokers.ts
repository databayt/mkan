/**
 * The broker and agency directory — who rents homes out in Kigali, and where.
 *
 *   pnpm crm:brokers            dry run: merge every source, print counts by kind and source
 *   pnpm crm:brokers --apply    upsert Prisma `Broker`, link ListingBroker.brokerId, mirror to Twenty `broker`
 *   pnpm crm:brokers --list     dry run, and print every merged broker
 *
 * When /find has nothing to show, the agent's next move is to ask the people
 * who would know: brokers who post homes in that area at that price. Until now
 * a broker was a bare `User` behind a ListingBroker row, so there was no list
 * to ask. This builds one, daily, from everywhere a broker shows up:
 *
 *   (a) every ListingBroker user (the TikTok mirror's leads),
 *   (b) Twenty hosts that look like agencies (agencySuspected, or 3+ Airbnb listings) in Rwanda,
 *   (c) Twenty tiktokPost.brokerName + phonesSeen,
 *   (d) the TikTok seed accounts (scripts/crm/.data/tiktok/seeds.json),
 *   (e) Facebook posters (scripts/crm/.data/fb-rentals/posts.json, once that lane runs),
 *   (f) Maps agencies (scripts/crm/.data/agencies/agencies.json, `crm:agencies`).
 *
 * The merge and the coverage maths live in `brokers-pure.ts` (unit-tested).
 * Prisma is written first because the Worker reads it; Twenty second, for the
 * humans. Counters the agent owns (asks, answers, optOut) are never
 * overwritten here — they are read back and mirrored to Twenty as they are.
 *
 * The dry run never touches the `Broker` table, so it is safe to run before
 * the broker-directory migration reaches the database.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { twentyClient, fromMicros, type Currency } from './twenty-rest';
import { phonesFromTwenty, twentyPhones } from '../../src/lib/phone';
import { DISTRICTS } from '../../src/lib/geo/rwanda-places';
import {
  mergeCandidates,
  normaliseHandle,
  normaliseRwPhone,
  isAgencyName,
  summarise,
  type Candidate,
  type HomeFact,
  type MergedBroker,
  type SourceTag,
} from './brokers-pure';
import type { AgencyRow } from './agencies-discover';

type Row = Record<string, unknown>;

const APPLY = process.argv.includes('--apply');
const LIST = process.argv.includes('--list');
const DATA = join(process.cwd(), 'scripts/crm/.data');
const DISTRICT_CODES = new Set(DISTRICTS.map((d) => d.code));
const DEAD_STAGES = new Set(['DECLINED', 'DUPLICATE', 'REJECTED']);

if (!(process.env.TWENTY_API_URL ?? '').trim()) process.env.TWENTY_API_URL = 'http://localhost:3100';

function readJson<T>(file: string, empty: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : empty;
  } catch {
    return empty;
  }
}
const dateOf = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const linkOf = (v: unknown): string | null => {
  const u = (v as { primaryLinkUrl?: string | null } | null)?.primaryLinkUrl?.trim();
  return u && /^https?:\/\//.test(u) ? u : null;
};
const SOURCE_TAG: Record<string, SourceTag> = { AIRBNB: 'airbnb', TIKTOK: 'tiktok', FACEBOOK: 'facebook', MKAN_SITE: 'site', WEB: 'web', MANUAL: 'site' };
const tagOf = (src: unknown): SourceTag => SOURCE_TAG[String(src ?? '').toUpperCase()] ?? 'web';

// ── sources → candidates ─────────────────────────────────────────────────────

/** A Twenty home → coverage evidence (null when it is not a live Kigali home). */
export function homeFactFromTwenty(h: Row): HomeFact | null {
  const state = String(h.homeState ?? '').toUpperCase();
  const inRwanda = String(h.country ?? '').toUpperCase() === 'RWANDA' || String(h.city ?? '').toUpperCase() === 'KIGALI' || DISTRICT_CODES.has(state as never);
  if (!inRwanda) return null;
  if (DEAD_STAGES.has(String(h.pipelineStage)) || DEAD_STAGES.has(String(h.homeStatus))) return null;
  const addr = (h.homeAddress as Row | null) ?? null;
  const month = h.priceMonthLocal as Currency | null;
  const priceMonth = month?.currencyCode === 'RWF' ? fromMicros(month) : null;
  const lat = typeof addr?.addressLat === 'number' ? addr.addressLat : null;
  const lng = typeof addr?.addressLng === 'number' ? addr.addressLng : null;
  return {
    key: typeof h.mkanListingId === 'number' ? `listing:${h.mkanListingId}` : `home:${h.id}`,
    district: state || null,
    address: [addr?.addressStreet1, addr?.addressStreet2].filter(Boolean).join(', ') || null,
    lat,
    lng,
    pinIsReal: String(h.source) === 'AIRBNB' && lat != null,
    stay: h.rentPeriod === 'MONTH' ? 'month' : h.rentPeriod === 'NIGHT' || h.priceNightLocal ? 'night' : null,
    priceMonth,
    seenAt: dateOf(h.scrapedAt) ?? dateOf(h.createdAt),
  };
}

interface LbRow {
  userId: string;
  role: 'BROKER' | 'OWNER';
  user: { id: string; phoneNumber: string | null; sourceHostId: string | null; username: string | null };
  listing: {
    id: number;
    source: string | null;
    rentPeriod: 'NIGHTLY' | 'MONTHLY';
    priceMonth: number | null;
    currency: string;
    createdAt: Date;
    sourceCapturedAt: Date | null;
    location: { address: string; state: string; zoneKey: string | null; latitude: number; longitude: number } | null;
  };
}

/** (a) ListingBroker users, one candidate per user with all their homes. */
export function candidatesFromListingBrokers(rows: LbRow[]): Candidate[] {
  const byUser = new Map<string, Candidate>();
  for (const r of rows) {
    const handle = r.user.sourceHostId?.startsWith('tiktok:') ? r.user.sourceHostId.slice(7) : normaliseHandle(r.user.username);
    const c =
      byUser.get(r.userId) ??
      ({
        origin: 'listing',
        kind: 'LANDLORD',
        name: r.user.username?.startsWith('@') ? r.user.username : handle ? `@${handle}` : null,
        phones: [r.user.phoneNumber].filter((p): p is string => !!p),
        tiktokHandle: handle,
        userId: r.userId,
        sources: [],
        homes: [],
      } satisfies Candidate);
    if (r.role === 'BROKER') c.kind = 'BROKER';
    const tag = tagOf(r.listing.source);
    if (!c.sources.includes(tag)) c.sources.push(tag);
    const l = r.listing;
    c.homes.push({
      key: `listing:${l.id}`,
      district: l.location?.zoneKey ?? l.location?.state?.toUpperCase() ?? null,
      address: l.location?.address ?? null,
      lat: l.location?.latitude ?? null,
      lng: l.location?.longitude ?? null,
      pinIsReal: l.source === 'AIRBNB' || l.source === 'MANUAL',
      stay: l.rentPeriod === 'MONTHLY' ? 'month' : 'night',
      priceMonth: l.currency === 'RWF' && l.priceMonth ? l.priceMonth : null,
      seenAt: l.sourceCapturedAt ?? l.createdAt,
    });
    byUser.set(r.userId, c);
  }
  return [...byUser.values()];
}

/** (b) Twenty hosts that look like an agency or a portfolio landlord, in Rwanda. */
export function candidatesFromHosts(hosts: Row[], homesByHost: Map<string, HomeFact[]>): Candidate[] {
  const out: Candidate[] = [];
  for (const h of hosts) {
    const id = String(h.id);
    const homes = homesByHost.get(id) ?? [];
    const phones = phonesFromTwenty(h.phone as never, 'RW').filter((p) => p.startsWith('+250'));
    const agency = h.agencySuspected === true;
    const portfolio = Number(h.airbnbListingsCount ?? 0) >= 3;
    if (!agency && !portfolio) continue;
    if (!homes.length && !phones.length) continue; // a Sudan host, or nobody to reach
    const name = (h.name as string | null)?.trim() || null;
    const src = String(h.source ?? '');
    out.push({
      origin: 'host',
      kind: src === 'AIRBNB' ? (agency || isAgencyName(name) ? 'AGENCY' : 'LANDLORD') : isAgencyName(name) ? 'AGENCY' : 'BROKER',
      name,
      phones,
      whatsapp: phonesFromTwenty(h.whatsapp as never, 'RW').find((p) => p.startsWith('+250')) ?? null,
      tiktokHandle: normaliseHandle(h.tiktokHandle as string | null),
      facebookUrl: linkOf(h.facebookUrl),
      email: ((h.email as Row | null)?.primaryEmail as string | null) || null,
      twentyHostIds: [id],
      sources: [tagOf(src)],
      homes,
    });
  }
  return out;
}

/** (c) TikTok posts: the name the ad shows, the numbers in it, and when it went up. */
export function candidatesFromPosts(posts: Row[], homeById: Map<string, HomeFact>): Candidate[] {
  const out: Candidate[] = [];
  for (const p of posts) {
    const handle = normaliseHandle(p.tiktokHandle as string | null);
    const phones = String(p.phonesSeen ?? '')
      .split(/[,;\s]+/)
      .map(normaliseRwPhone)
      .filter((n): n is string => !!n);
    if (!handle && !phones.length) continue;
    if (p.postStatus === 'SKIPPED' && !phones.length) continue; // not a rental, nothing gained
    const name = ((p.brokerName as string | null) || (p.accountName as string | null) || '').trim() || null;
    const home = p.homeId ? homeById.get(String(p.homeId)) : undefined;
    out.push({
      origin: 'post',
      kind: isAgencyName(name) ? 'AGENCY' : 'BROKER',
      name,
      phones,
      tiktokHandle: handle,
      twentyHostIds: p.hostId ? [String(p.hostId)] : [],
      sources: ['tiktok'],
      homes: home ? [home] : [],
      lastSeenAt: dateOf(p.publishedAt),
    });
  }
  return out;
}

/** (d) TikTok seed accounts the sweep vetted as rental posters (active or paused). */
export function candidatesFromSeeds(seeds: Record<string, { status?: string; lastListedAt?: string }>): Candidate[] {
  return Object.entries(seeds)
    .filter(([, s]) => s.status === 'active' || s.status === 'paused')
    .map(([handle]) => normaliseHandle(handle))
    .filter((h): h is string => !!h)
    .map((h) => ({ origin: 'seed', kind: isAgencyName(h.replace(/[._]/g, ' ')) ? 'AGENCY' : 'BROKER', name: null, phones: [], tiktokHandle: h, sources: ['tiktok'], homes: [] }) satisfies Candidate);
}

interface FbPost {
  author: string | null;
  authorId: string | null;
  text: string;
  createdAt: number | null;
  state: string;
  hostId?: string;
  read?: { phones?: string[]; inKigali?: boolean };
}
/** (e) Facebook group/Marketplace posters with a Rwandan number (the fb-rentals ledger). */
export function candidatesFromFacebook(posts: Record<string, FbPost>): Candidate[] {
  const out: Candidate[] = [];
  for (const p of Object.values(posts)) {
    if (p.state === 'skipped' || p.read?.inKigali === false) continue;
    const phones = (p.read?.phones ?? []).map(normaliseRwPhone).filter((n): n is string => !!n);
    if (!phones.length) continue;
    out.push({
      origin: 'facebook',
      kind: isAgencyName(p.author) ? 'AGENCY' : 'BROKER',
      name: p.author,
      phones,
      facebookUrl: p.authorId ? `https://www.facebook.com/${p.authorId}` : null,
      twentyHostIds: p.hostId ? [p.hostId] : [],
      sources: ['facebook'],
      homes: [],
      lastSeenAt: p.createdAt ? new Date(p.createdAt * 1000) : null,
    });
  }
  return out;
}

/** A Maps place that rents or sells homes — "rental agency Kigali" also finds car hire. */
export const isHousingAgency = (r: { name?: string | null; category?: string | null }) =>
  /real ?estate|property|properties|apartment|realtor|housing|homes?\b|immobili/i.test(`${r.category ?? ''} ${r.name ?? ''}`) &&
  !/\bcar\b|vehicle|self.?drive|\btours?\b|safari/i.test(`${r.category ?? ''} ${r.name ?? ''}`);

/** (f) Maps agencies in Kigali that the discovery pass finished. */
export function candidatesFromAgencies(rows: Record<string, AgencyRow>): Candidate[] {
  return Object.values(rows)
    .filter((r) => r.state === 'done' && r.inKigali !== false && isHousingAgency(r))
    .map((r) => ({
      origin: 'maps',
      kind: 'AGENCY',
      name: r.name,
      phones: r.phones ?? [],
      whatsapp: r.whatsapp ?? null,
      website: r.website ?? null,
      email: r.email ?? null,
      sources: ['maps'],
      homes: [],
      places: [{ address: r.address ?? null, lat: r.lat ?? null, lng: r.lng ?? null }],
    }) satisfies Candidate);
}

// ── gather ───────────────────────────────────────────────────────────────────

async function gather(): Promise<{ candidates: Candidate[]; counts: Record<string, number> }> {
  const client = twentyClient();
  const [hosts, homes, posts] = await Promise.all([client.all('hosts'), client.all('homes'), client.all('tiktokPosts')]);
  const homesByHost = new Map<string, HomeFact[]>();
  const homeById = new Map<string, HomeFact>();
  for (const h of homes) {
    const f = homeFactFromTwenty(h);
    if (!f) continue;
    homeById.set(String(h.id), f);
    if (h.hostId) homesByHost.set(String(h.hostId), [...(homesByHost.get(String(h.hostId)) ?? []), f]);
  }

  // Reads existing tables only — never `Broker`, which may not exist yet.
  const { db } = await import('../../src/lib/db');
  const lb = (await db.listingBroker.findMany({
    select: {
      userId: true,
      role: true,
      user: { select: { id: true, phoneNumber: true, sourceHostId: true, username: true } },
      listing: {
        select: {
          id: true,
          source: true,
          rentPeriod: true,
          priceMonth: true,
          currency: true,
          createdAt: true,
          sourceCapturedAt: true,
          location: { select: { address: true, state: true, zoneKey: true, latitude: true, longitude: true } },
        },
      },
    },
  })) as LbRow[];

  const seeds = readJson<Record<string, { status?: string }>>(join(DATA, 'tiktok/seeds.json'), {});
  const fb = readJson<Record<string, FbPost>>(join(DATA, 'fb-rentals/posts.json'), {});
  const agencies = readJson<Record<string, AgencyRow>>(join(DATA, 'agencies/agencies.json'), {});

  const parts = {
    listingBrokers: candidatesFromListingBrokers(lb),
    hosts: candidatesFromHosts(hosts, homesByHost),
    tiktokPosts: candidatesFromPosts(posts, homeById),
    seeds: candidatesFromSeeds(seeds),
    facebook: candidatesFromFacebook(fb),
    agencies: candidatesFromAgencies(agencies),
  };
  // A post's host's other homes count too: the post names the broker, the host holds the portfolio.
  for (const c of parts.tiktokPosts) for (const id of c.twentyHostIds ?? []) c.homes.push(...(homesByHost.get(id) ?? []));
  const counts = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.length]));
  counts.twentyHosts = hosts.length;
  counts.twentyHomesInRwanda = homeById.size;
  counts.twentyTiktokPosts = posts.length;
  counts.listingBrokerRows = lb.length;
  return { candidates: Object.values(parts).flat(), counts };
}

// ── writes ───────────────────────────────────────────────────────────────────

const STAY_OPTION = { month: 'MONTH', night: 'NIGHT' } as const;

/** The Twenty `broker` record body for a merged broker and its Prisma row. */
export function twentyBrokerBody(b: MergedBroker, row: { id: string; asks: number; answers: number; availableAnswers: number; lastAskedAt: Date | null; optOut: boolean; optOutAt: Date | null }) {
  const link = (url: string | null, label: string) => (url ? { primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] } : undefined);
  const body: Record<string, unknown> = {
    name: b.name,
    kind: b.kind,
    phone: twentyPhones(b.phones[0], b.phones.slice(1)),
    whatsapp: twentyPhones(b.whatsapp),
    tiktokHandle: b.tiktokHandle ?? '',
    facebookUrl: link(b.facebookUrl, 'Facebook'),
    website: link(b.website, 'Website'),
    email: b.email ? { primaryEmail: b.email, additionalEmails: [] } : undefined,
    districts: b.districts,
    neighbourhoods: b.neighbourhoods.join(', '),
    stays: b.stays.map((s) => STAY_OPTION[s]),
    priceMin: b.priceMin,
    priceMax: b.priceMax,
    listingsCount: b.listingsCount,
    lastSeenAt: b.lastSeenAt?.toISOString() ?? null,
    lastAskedAt: row.lastAskedAt?.toISOString() ?? null,
    asks: row.asks,
    answers: row.answers,
    availableAnswers: row.availableAnswers,
    optOut: row.optOut,
    optOutAt: row.optOutAt?.toISOString() ?? null,
    sources: b.sources.map((s) => s.toUpperCase()),
    mkanBrokerId: row.id,
  };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}

async function apply(brokers: MergedBroker[]): Promise<void> {
  const { db } = await import('../../src/lib/db');
  const client = twentyClient();
  let created = 0;
  let updated = 0;
  let linked = 0;
  const claimedUsers = new Set<string>();
  const claimedHandles = new Set<string>();
  const written: { b: MergedBroker; id: string }[] = [];

  for (const b of brokers) {
    // The existing row: same user, same handle, or a shared phone.
    const existing = await db.broker.findFirst({
      where: {
        OR: [
          ...(b.userIds.length ? [{ userId: { in: b.userIds } }] : []),
          ...(b.tiktokHandles.length ? [{ tiktokHandle: { in: b.tiktokHandles } }] : []),
          ...(b.phones.length ? [{ phones: { hasSome: b.phones } }] : []),
        ],
      },
      select: { id: true, userId: true, tiktokHandle: true, sources: true },
    });
    if (!existing && !b.userIds.length && !b.tiktokHandles.length && !b.phones.length && !b.website) continue;
    // Unique columns: only take a user / handle no other Broker row holds.
    const free = async (field: 'userId' | 'tiktokHandle', value: string | null, claimed: Set<string>) => {
      if (!value || claimed.has(value)) return null;
      const other = await db.broker.findFirst({ where: { [field]: value, ...(existing ? { NOT: { id: existing.id } } : {}) }, select: { id: true } });
      return other ? null : value;
    };
    const userId = existing?.userId ?? (await free('userId', b.userId, claimedUsers));
    const tiktokHandle = existing?.tiktokHandle ?? (await free('tiktokHandle', b.tiktokHandle, claimedHandles));
    if (userId) claimedUsers.add(userId);
    if (tiktokHandle) claimedHandles.add(tiktokHandle);
    const data = {
      kind: b.kind,
      name: b.name,
      userId,
      phones: b.phones,
      whatsapp: b.whatsapp,
      tiktokHandle,
      facebookUrl: b.facebookUrl,
      website: b.website,
      email: b.email,
      districts: b.districts,
      neighbourhoods: b.neighbourhoods,
      stays: b.stays,
      priceMin: b.priceMin,
      priceMax: b.priceMax,
      listingsCount: b.listingsCount,
      lastSeenAt: b.lastSeenAt,
      sources: [...new Set([...(existing?.sources ?? []), ...b.sources])],
    };
    const row = existing
      ? await db.broker.update({ where: { id: existing.id }, data, select: { id: true } })
      : await db.broker.create({ data, select: { id: true } });
    if (existing) updated += 1;
    else created += 1;
    if (b.userIds.length) {
      const r = await db.listingBroker.updateMany({ where: { userId: { in: b.userIds }, OR: [{ brokerId: null }, { brokerId: { not: row.id } }] }, data: { brokerId: row.id } });
      linked += r.count;
    }
    written.push({ b, id: row.id });
  }
  console.log(`\n✅ Prisma: ${created} broker(s) created · ${updated} updated · ${linked} ListingBroker row(s) linked`);

  // Twenty second. A missing `broker` object (crm:seed-objects not applied) stops here, loudly.
  let tCreated = 0;
  let tUpdated = 0;
  let hostsLinked = 0;
  const twentyHostBroker = new Map<string, string>();
  for (const { b, id } of written) {
    const row = await db.broker.findUniqueOrThrow({
      where: { id },
      select: { id: true, twentyId: true, asks: true, answers: true, availableAnswers: true, lastAskedAt: true, optOut: true, optOutAt: true },
    });
    const body = twentyBrokerBody(b, row);
    let twentyId = row.twentyId;
    if (twentyId) {
      await client.rest('PATCH', `brokers/${twentyId}`, body);
      tUpdated += 1;
    } else {
      const res = (await client.rest('POST', 'brokers', body)) as { data?: Record<string, { id?: string }> };
      twentyId = Object.values(res?.data ?? {})[0]?.id ?? null;
      if (twentyId) await db.broker.update({ where: { id }, data: { twentyId } });
      tCreated += 1;
    }
    if (twentyId) for (const h of b.twentyHostIds) twentyHostBroker.set(h, twentyId);
  }
  // Each host points at its directory entry (the reverse field lists a broker's hosts).
  const hosts = await client.all('hosts');
  for (const h of hosts) {
    const want = twentyHostBroker.get(String(h.id));
    if (want && h.brokerId !== want) {
      await client.rest('PATCH', `hosts/${h.id}`, { brokerId: want }).catch((e) => console.warn(`  ! host ${h.id}: ${(e as Error).message.slice(0, 120)}`));
      hostsLinked += 1;
    }
  }
  console.log(`✅ Twenty: ${tCreated} broker(s) created · ${tUpdated} updated · ${hostsLinked} host(s) linked`);
}

async function main(): Promise<void> {
  const { candidates, counts } = await gather();
  const brokers = mergeCandidates(candidates);
  const s = summarise(brokers);
  console.log(`\n📇 Broker directory — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  console.log(`   inputs: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`   ${candidates.length} candidate(s) → ${s.total} broker(s) · ${s.withPhone} with a phone · ${s.withCoverage} with coverage · ${s.withHomes} with homes`);
  console.log(`   by kind:   ${Object.entries(s.byKind).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`   by source: ${Object.entries(s.bySource).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`   by origin: ${Object.entries(s.byOrigin).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  const shown = LIST ? brokers : brokers.slice(0, 15);
  console.log(`\n   ${LIST ? 'every broker' : 'top 15 by homes'}:`);
  for (const b of shown) {
    const band = b.priceMin != null ? ` RWF ${b.priceMin.toLocaleString('en')}–${(b.priceMax ?? b.priceMin).toLocaleString('en')}/mo` : '';
    console.log(`   ${b.kind.padEnd(8)} ${b.name.slice(0, 32).padEnd(32)} ${String(b.listingsCount).padStart(3)} home(s)  ${b.phones[0] ?? '(no phone)'}  ${b.tiktokHandle ? `@${b.tiktokHandle}` : ''}  ${b.districts.join('/')}${band}  [${b.sources.join(',')}]`);
  }
  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Pass --apply (after the broker_directory migration and crm:seed-objects --apply).');
    return;
  }
  await apply(brokers);
}

if (process.argv[1] && /brokers\.ts$/.test(process.argv[1])) {
  main()
    .then(async () => (await import('../../src/lib/db')).db.$disconnect())
    .catch((e) => {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    });
}
