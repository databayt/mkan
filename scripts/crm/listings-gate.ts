/**
 * pnpm listings:gate [--apply] [--source=AIRBNB|TIKTOK|WEB|…] — the trust gate run over every home
 * (src/lib/listing-gate-pure.ts; Abdout, 2026-11-15: "unpublish each listing that has no contact or
 * doesn't have the sufficient informations"). Dry by default: counts by source, what would be
 * published or hidden, and why — never a phone, a broker or a host name. `--apply` flips both ways in
 * one pass: the swap of the contact-less Airbnb homes for the broker homes that pass.
 *
 * Photos with a broker number on them: the TikTok intake's ledger (scripts/crm/.data/tiktok/videos.json)
 * holds each video's frame OCR; a home whose picked frames show a Rwandan number fails, unless it has its
 * enhanced video (`pnpm tt:web`), which its page plays instead of photos.
 */
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { gateMove, gateOf, type GateContact, type GateReason } from '../../src/lib/listing-gate-pure';
import { frameHasPhone } from './tiktok-pure';

config({ path: join(process.cwd(), '.env'), quiet: true });

const APPLY = process.argv.includes('--apply');
const only = process.argv.find((a) => a.startsWith('--source='))?.slice(9).toUpperCase() || null;
const LEDGER = join(process.cwd(), 'scripts/crm/.data/tiktok/videos.json');

type LedgerRow = { videoId?: string; ocr?: string[]; read?: { propertyFrames?: number[] } };

/** `tiktok:<video id>` (Listing.sourceListingId) → the video's picked photo frames show a broker's number. */
function phonePhotos(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  if (!existsSync(LEDGER)) return out;
  const raw = JSON.parse(readFileSync(LEDGER, 'utf8')) as LedgerRow[] | Record<string, LedgerRow>;
  for (const r of Array.isArray(raw) ? raw : Object.values(raw)) {
    if (!r.videoId || !r.ocr?.length) continue;
    const picks = r.read?.propertyFrames?.length ? r.read.propertyFrames : r.ocr.map((_, i) => i + 1);
    const phone = picks.some((p) => frameHasPhone(r.ocr, p));
    out.set(`tiktok:${r.videoId}`, phone);
  }
  return out;
}

async function main(): Promise<void> {
  const { db } = await import('../../src/lib/db');
  const phones = phonePhotos();
  const rows = await db.listing.findMany({
    where: only ? { source: only as never } : {},
    select: {
      id: true, sourceListingId: true, source: true, isPublished: true, draft: true, rentPeriod: true, priceMonth: true, pricePerNight: true,
      photoUrls: true, videoUrl: true, lostAt: true, claimedAt: true,
      host: { select: { phoneNumber: true } },
      location: { select: { state: true, sector: true, neighbourhood: true, address: true, latitude: true, longitude: true } },
      brokers: { select: { user: { select: { phoneNumber: true } }, broker: { select: { phones: true, whatsapp: true, optOut: true, mergedIntoId: true } } } },
    },
  });

  type Tally = { total: number; ok: number; shown: number; publish: number; hide: number; reasons: Partial<Record<GateReason, number>> };
  const by = new Map<string, Tally>();
  const publish: number[] = [];
  const hide: number[] = [];
  for (const r of rows) {
    const contacts: GateContact[] = r.brokers.map((b) => b.broker ?? { phones: b.user?.phoneNumber ? [b.user.phoneNumber] : [] });
    const loc = r.location;
    const g = gateOf({
      rentPeriod: r.rentPeriod,
      priceMonth: r.priceMonth,
      pricePerNight: r.pricePerNight,
      photoUrls: r.photoUrls,
      lostAt: r.lostAt,
      claimedAt: r.claimedAt,
      hostPhone: r.host?.phoneNumber ?? null,
      contacts,
      hasPlace: !!loc && (!!(loc.state || loc.sector || loc.neighbourhood || loc.address) || (loc.latitude != null && loc.longitude != null)),
      photosShowPhone: phones.get(r.sourceListingId ?? '') ?? false,
      hasVideo: !!r.videoUrl,
    });
    const key = r.source ?? 'HOST';
    const t = by.get(key) ?? { total: 0, ok: 0, shown: 0, publish: 0, hide: 0, reasons: {} };
    t.total++;
    if (g.ok) t.ok++;
    if (r.isPublished && !r.draft) t.shown++;
    for (const why of g.reasons) t.reasons[why] = (t.reasons[why] ?? 0) + 1;
    const move = gateMove(r.isPublished, r.draft, g.ok);
    if (move === 'publish') (t.publish++, publish.push(r.id));
    if (move === 'hide') (t.hide++, hide.push(r.id));
    by.set(key, t);
  }

  console.log(`trust gate — ${rows.length} homes${only ? ` (${only})` : ''}${APPLY ? '' : ' · dry run'}\n`);
  for (const [source, t] of [...by].sort((a, b) => b[1].total - a[1].total)) {
    const why = Object.entries(t.reasons).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—';
    console.log(`${source.padEnd(8)} ${String(t.total).padStart(5)} homes · public now ${t.shown} · pass ${t.ok} → publish ${t.publish}, hide ${t.hide}`);
    console.log(`         fails: ${why}`);
  }
  const publicAfter = [...by.values()].reduce((n, t) => n + t.shown - t.hide + t.publish, 0);
  console.log(`\npublic homes: ${[...by.values()].reduce((n, t) => n + t.shown, 0)} now → ${publicAfter} after`);

  if (!APPLY) {
    console.log('\nnothing changed (add --apply to publish and hide)');
    return;
  }
  const CHUNK = 500;
  for (let i = 0; i < publish.length; i += CHUNK) {
    await db.listing.updateMany({ where: { id: { in: publish.slice(i, i + CHUNK) } }, data: { isPublished: true, draft: false } });
  }
  for (let i = 0; i < hide.length; i += CHUNK) {
    await db.listing.updateMany({ where: { id: { in: hide.slice(i, i + CHUNK) } }, data: { isPublished: false } });
  }
  console.log(`\napplied: ${publish.length} published, ${hide.length} hidden`);
  try {
    const { recordRun } = await import('./notify');
    await recordRun('listings:gate', true, `${publish.length} published, ${hide.length} hidden, ${publicAfter} public`);
  } catch {
    /* the run record is a nicety */
  }
}

main()
  .then(async () => (await import('../../src/lib/db')).db.$disconnect())
  .catch((e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    process.exit(1);
  });
