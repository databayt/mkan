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
 * Flags: --in=<scored> --out=<enriched> --fx-rate=<SAR→SDG> --limit=<N> --apply
 *
 * `--apply` uploads to S3 (needs AWS creds in .env — already live) and writes the
 * enriched file. FX rate is required to convert (never hardcoded); it's stamped
 * per home with the date. Idempotent: homes already `photosRehosted` are skipped.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const APPLY = process.argv.includes('--apply');
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const IN = argv('in', 'scripts/crm/.data/airbnb-scored.json');
const OUT = argv('out', 'scripts/crm/.data/airbnb-rehosted.json');
const FX = parseFloat(argv('fx-rate', process.env.MKAN_SAR_SDG ?? '0')) || 0;
const LIMIT = parseInt(argv('limit', '0'), 10) || 0;
const TODAY = new Date().toISOString().slice(0, 10);

const roundClean = (n: number): number => Math.round(n / 500) * 500; // clean SDG price point
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
  title?: string | null;
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[]; hosts: unknown[] };
  let homes = payload.homes ?? [];
  if (LIMIT) homes = homes.slice(0, LIMIT);

  const s3 = APPLY ? await import('@/lib/s3') : null;
  const s3Ready = s3?.isS3Configured() ?? false;

  console.log(`\n🖼  Photo re-host + SR→SDG — ${homes.length} homes  (FX ${FX || 'none'}${APPLY ? `, S3 ${s3Ready ? 'live' : 'UNCONFIGURED'}` : ', dry'})`);
  if (APPLY && !s3Ready) console.log('   ⚠️  S3 not configured — will convert price only, skip photo re-host.');
  if (!FX) console.log('   ⚠️  no --fx-rate — SDG price left null (SR→SDG needs a rate; never hardcoded).');

  let photosDone = 0, homesRehosted = 0, converted = 0;
  for (const h of homes) {
    // SR → SDG
    if (FX && h.priceNightSar != null && h.priceNightSdg == null) {
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
      const cdn: string[] = [];
      for (const url of h.photoUrls) {
        try {
          const res = await fetch(url);
          if (!res.ok) { console.warn(`    ! fetch ${res.status} ${url.slice(0, 60)}`); continue; }
          const body = new Uint8Array(await res.arrayBuffer());
          const ext = (url.match(/\.(jpe?g|png|webp)/i)?.[1] ?? 'jpg').toLowerCase().replace('jpeg', 'jpg');
          const cdnUrl = await s3!.putObject({ key: s3!.buildUploadKey(h.airbnbListingId, ext), body, contentType: ctFor(ext) });
          if (cdnUrl) { cdn.push(cdnUrl); photosDone++; }
        } catch (e) {
          console.warn(`    ! ${url.slice(0, 60)}: ${(e as Error).message}`);
        }
      }
      if (cdn.length) {
        h.photoUrls = cdn;
        h.coverPhotoUrl = cdn[0];
        h.photoCount = cdn.length;
        h.photosRehosted = true;
        homesRehosted++;
        console.log(`  ✓ ${(h.title ?? '').slice(0, 34).padEnd(34)} ${cdn.length} photos → CDN${h.priceNightSdg != null ? ` · ${h.priceNightSdg} SDG` : ''}`);
      }
    } else {
      console.log(`  = ${(h.title ?? '').slice(0, 34).padEnd(34)} ${h.photosRehosted ? 'already re-hosted' : 'no photos'}${h.priceNightSdg != null ? ` · ${h.priceNightSdg} SDG` : ''}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — would re-host ${homes.filter((h) => (h.photoUrls?.length ?? 0) && !h.photosRehosted).length} homes, convert ${converted} prices.`);
    console.log('To apply:  npx tsx scripts/crm/photo-rehost.ts --fx-rate=<rate> --apply\n');
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ ...payload, homes, rehostedAt: new Date().toISOString() }, null, 2));
  console.log(`\n✅ re-hosted ${photosDone} photos across ${homesRehosted} homes, converted ${converted} prices → ${OUT}`);
  console.log('   Feed this file to the import:  npx tsx scripts/crm/mkan-import.ts --in=' + OUT + ' --apply\n');
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
