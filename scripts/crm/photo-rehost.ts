/**
 * Photo re-host + SR→SDG conversion (Epic G1.4).
 *
 * Airbnb's muscache photo URLs can't be hot-linked (they rot/block, and mkan's
 * next.config only allows cdn.databayt.org / S3 / CloudFront), so before a home
 * can carry real images this worker downloads every scraped photo and re-uploads
 * it to mkan's S3 → CloudFront (`mkan/uploads/<listingId>/<uuid>.<ext>`), and
 * converts the nightly price from the scraped SR to SDG at a per-home stored rate.
 *
 * Enriches the scored file in place-ish → `.data/airbnb-rehosted.json` with
 * `photosRehosted:true`, CDN `photoUrls`, `priceNightSdg` + `fxRateSarSdg` +
 * `fxRateDate`. The import step (G1.5) then carries real photos + price.
 *
 *   npx tsx scripts/crm/photo-rehost.ts --fx-rate=160                 # dry plan
 *   npx tsx scripts/crm/photo-rehost.ts --fx-rate=160 --apply         # re-host + convert
 *   npx tsx scripts/crm/photo-rehost.ts --fx-rate=160 --apply --limit=1
 *
 * Flags: --in=<scored> --out=<enriched> --merge=<previous enriched>
 *        --fx-rate=<SAR→SDG> --limit=<N> --apply
 *
 * ── `--merge` ──────────────────────────────────────────────────────────────
 *
 * The scored file is regenerated from scratch whenever the scrape is re-scored,
 * and it carries no `photosRehosted` flag — so without this, a re-run would
 * re-download and re-upload every photo of every home that was already done,
 * for no change in the result. `--merge` reads a previous enriched file and
 * carries its photo results forward, leaving only genuinely new homes to
 * upload. The FX conversion still runs for anything missing a SDG price, so a
 * fresh rate reaches the homes that need one.
 *
 * `--apply` uploads to S3 (needs AWS creds in .env — already live) and writes the
 * enriched file. FX rate is required to convert (never hardcoded); it's stamped
 * per home with the date. Idempotent: homes already `photosRehosted` are skipped.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { regionFromArgv } from './regions';

const APPLY = process.argv.includes('--apply');
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
// `--region=rwanda`: the scraped price is in the session's display currency
// (USD on 2026-10-07) and converts to RWF at `--fx-rate` (USD→RWF), checked
// against `--fx-from` so a stray SR price can never be multiplied by a USD rate.
const REGION = regionFromArgv();
const LOCAL = REGION.key !== 'sudan';
const FX_FROM = argv('fx-from', 'USD').toUpperCase();
const IN = argv('in', REGION.files.scored);
const OUT = argv('out', REGION.files.rehosted);
const MERGE = argv('merge', '');
const FX = parseFloat(argv('fx-rate', LOCAL ? '0' : (process.env.MKAN_SAR_SDG ?? '0'))) || 0;
const LIMIT = parseInt(argv('limit', '0'), 10) || 0;
const TODAY = new Date().toISOString().slice(0, 10);

// Clean local price points: SDG to 500, RWF to 1,000.
const roundClean = (n: number): number => (LOCAL ? Math.round(n / 1000) * 1000 : Math.round(n / 500) * 500);
const ctFor = (ext: string): string => (ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');

interface Home {
  airbnbListingId: string;
  photoUrls: string[];
  photoCount?: number;
  coverPhotoUrl?: string | null;
  photosRehosted?: boolean;
  priceNightSar: number | null;
  priceNightSdg?: number | null;
  fxRateSarSdg?: number | null;
  fxRateDate?: string | null;
  priceNight?: number | null;
  priceCurrency?: string | null;
  priceNightLocal?: number | null;
  fxRateToLocal?: number | null;
  title?: string | null;
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[]; hosts: unknown[] };
  let homes = payload.homes ?? [];

  // Carry forward photos already on the CDN, so a re-scored file does not mean
  // re-uploading everything. Only the photo result is merged: the price is left
  // to the conversion below, so a fresh --fx-rate still reaches every home that
  // has no SDG price yet.
  if (MERGE) {
    if (!existsSync(MERGE)) throw new Error(`--merge file not found: ${MERGE}`);
    const prev = (JSON.parse(readFileSync(MERGE, 'utf8')) as { homes: Home[] }).homes ?? [];
    const done = new Map(prev.filter((h) => h.photosRehosted).map((h) => [h.airbnbListingId, h]));
    let carried = 0;
    for (const h of homes) {
      const was = done.get(h.airbnbListingId);
      if (!was || h.photosRehosted) continue;
      h.photoUrls = was.photoUrls;
      h.coverPhotoUrl = was.coverPhotoUrl;
      h.photoCount = was.photoCount;
      h.photosRehosted = true;
      carried++;
    }
    console.log(`\n♻️  merged ${carried} already re-hosted homes from ${MERGE}`);
  }

  if (LIMIT) homes = homes.slice(0, LIMIT);

  const s3 = APPLY ? await import('@/lib/s3') : null;
  const s3Ready = s3?.isS3Configured() ?? false;

  console.log(`\n🖼  Photo re-host + SR→SDG — ${homes.length} homes  (FX ${FX || 'none'}${APPLY ? `, S3 ${s3Ready ? 'live' : 'UNCONFIGURED'}` : ', dry'})`);
  if (APPLY && !s3Ready) console.log('   ⚠️  S3 not configured — will convert price only, skip photo re-host.');
  if (!FX) console.log(`   ⚠️  no --fx-rate — ${REGION.currency} price left null (conversion needs a rate; never hardcoded).`);

  let photosDone = 0, homesRehosted = 0, converted = 0;
  let skippedFx = 0;
  let since = 0;
  const checkpoint = () => {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ ...payload, homes, rehostedAt: new Date().toISOString() }, null, 2));
  };
  for (const h of homes) {
    // scraped currency → listing currency (non-Sudan regions)
    if (LOCAL && FX && h.priceNight != null && h.priceNightLocal == null) {
      if ((h.priceCurrency ?? '').toUpperCase() === FX_FROM) {
        h.priceNightLocal = roundClean(h.priceNight * FX);
        h.fxRateToLocal = FX;
        h.fxRateDate = TODAY;
        converted++;
      } else skippedFx++;
    }
    // SR → SDG
    if (!LOCAL && FX && h.priceNightSar != null && h.priceNightSdg == null) {
      h.priceNightSdg = roundClean(h.priceNightSar * FX);
      h.fxRateSarSdg = FX;
      h.fxRateDate = TODAY;
      converted++;
    }
    // photos
    const need = (h.photoUrls?.length ?? 0) > 0 && !h.photosRehosted;
    if (!APPLY) {
      console.log(`  · ${(h.title ?? '').slice(0, 30).padEnd(30)} ${need ? `${h.photoUrls.length} photos → re-host` : 'photos ok/none'}${h.priceNightSdg != null ? ` · ${h.priceNightSdg} SDG` : ''}`);
      continue;
    }
    if (need && s3Ready) {
      // Six at a time, order kept: the first photo is the cover.
      const slots: (string | null)[] = new Array(h.photoUrls.length).fill(null);
      const one = async (url: string, i: number) => {
        try {
          const res = await fetch(url);
          if (!res.ok) { console.warn(`    ! fetch ${res.status} ${url.slice(0, 60)}`); return; }
          const body = new Uint8Array(await res.arrayBuffer());
          const ext = (url.match(/\.(jpe?g|png|webp)/i)?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg');
          const cdnUrl = await s3!.putObject({ key: s3!.buildUploadKey(h.airbnbListingId, ext), body, contentType: ctFor(ext) });
          if (cdnUrl) { slots[i] = cdnUrl; photosDone++; }
        } catch (e) {
          console.warn(`    ! ${url.slice(0, 60)}: ${(e as Error).message}`);
        }
      };
      for (let i = 0; i < h.photoUrls.length; i += 6) {
        await Promise.all(h.photoUrls.slice(i, i + 6).map((u, j) => one(u, i + j)));
      }
      const cdn = slots.filter((u): u is string => !!u);
      if (cdn.length) {
        h.photoUrls = cdn;
        h.coverPhotoUrl = cdn[0];
        h.photoCount = cdn.length;
        h.photosRehosted = true;
        homesRehosted++;
        console.log(`  ✓ ${(h.title ?? '').slice(0, 34).padEnd(34)} ${cdn.length} photos → CDN${h.priceNightSdg != null ? ` · ${h.priceNightSdg} SDG` : ''}${h.priceNightLocal != null ? ` · ${h.priceNightLocal} ${REGION.currency}` : ''}`);
      }
      // A long wave must not lose its uploads to one crash.
      if (++since >= 10) { checkpoint(); since = 0; }
    } else {
      console.log(`  = ${(h.title ?? '').slice(0, 34).padEnd(34)} ${h.photosRehosted ? 'already re-hosted' : 'no photos'}${h.priceNightSdg != null ? ` · ${h.priceNightSdg} SDG` : ''}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — would re-host ${homes.filter((h) => (h.photoUrls?.length ?? 0) && !h.photosRehosted).length} homes, convert ${converted} prices.`);
    console.log('To apply:  npx tsx scripts/crm/photo-rehost.ts --fx-rate=<rate> --apply\n');
    return;
  }

  checkpoint();
  if (skippedFx) console.log(`   ⚠️  ${skippedFx} price(s) not in ${FX_FROM} — left unconverted`);
  console.log(`\n✅ re-hosted ${photosDone} photos across ${homesRehosted} homes, converted ${converted} prices → ${OUT}`);
  console.log('   Feed this file to the import:  npx tsx scripts/crm/mkan-import.ts --in=' + OUT + ' --apply\n');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
