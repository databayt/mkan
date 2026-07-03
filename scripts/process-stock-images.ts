/**
 * Stock image processor (mirror of hogwarts `catalog/image.ts`).
 *
 * For every stock photo on the CDN it:
 *   1. Generates a tiny base64 WebP blur → written to `src/lib/stock-blur-map.ts`
 *      so <PropertyImage> shows a real per-image LQIP (works with zero AWS).
 *   2. When AWS S3 is configured, also produces resized WebP variants
 *      (sm/md/lg/original) and uploads them as `<base>-<size>.webp`, so the
 *      custom next/image loader can serve pre-made variants — transforms
 *      AWS-side, off Vercel.
 *
 * Run:  pnpm tsx scripts/process-stock-images.ts
 *
 * Idempotent. Safe to re-run whenever the stock pool changes.
 */

import sharp from "sharp";
import { writeFileSync } from "fs";
import { join } from "path";

// The full set of stock photos referenced across the app (grep-derived).
const STOCK_URLS: string[] = [
  "https://cdn.databayt.org/mkan/stock/photo-1449824913935-59a10b8d2000.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1484154218962-a197022b5858.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1499793983690-e29da59ef1c2.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1502672260266-1c1ef2d93688.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1506905925346-21bda4d32df4.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1522708323590-d24dbb6b0267.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1534528741775-53994a69daeb.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1544620347-c4fd4a3d5957.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1545324418-cc1a3fa10c00.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1552321554-5fefe8c9ef14.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1556742049-0cfed4f6a45d.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1556909114-f6e7ad7d3136.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1558618666-fcd25c85cd64.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1560448204-e02f11c3d0e2.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1564013799919-ab600027ffc6.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1566073771259-6a8506099945.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1568605114967-8130f3a36994.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1570129477492-45c003edd2be.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1571896349842-33c89424de2d.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1586023492125-27b2c045efd7.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1600566753190-17f0baa2a6c3.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1600596542815-ffad4c1539a9.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1600607687939-ce8a6c25118c.jpg",
  "https://cdn.databayt.org/mkan/stock/photo-1613490493576-7fde63acd811.jpg",
];

// Variant widths — keep in sync with src/lib/listing-image.ts.
const VARIANTS = [
  { suffix: "sm", width: 400 },
  { suffix: "md", width: 800 },
  { suffix: "lg", width: 1600 },
] as const;

function keyFromUrl(url: string): string {
  return new URL(url).pathname.replace(/^\/+/, ""); // e.g. mkan/stock/photo-x.jpg
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function makeBlur(buf: Buffer): Promise<string> {
  const out = await sharp(buf)
    .resize(16, null, { withoutEnlargement: true })
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

async function uploadVariants(buf: Buffer, baseKey: string): Promise<void> {
  const bucket = process.env.AWS_S3_BUCKET;
  if (
    !bucket ||
    !process.env.AWS_ACCESS_KEY_ID ||
    !process.env.AWS_SECRET_ACCESS_KEY
  ) {
    return; // S3 not configured — blur map only (see go-live doc).
  }
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const jobs = [
    ...VARIANTS.map((v) => ({
      key: `${baseKey}-${v.suffix}.webp`,
      pipeline: sharp(buf).resize(v.width, null, {
        withoutEnlargement: true,
        fit: "inside",
      }),
    })),
    { key: `${baseKey}-original.webp`, pipeline: sharp(buf) },
  ];
  await Promise.all(
    jobs.map(async (j) => {
      const body = await j.pipeline.webp({ quality: 80 }).toBuffer();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: j.key,
          Body: body,
          ContentType: "image/webp",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      console.log(`   ↑ ${j.key}`);
    }),
  );
}

async function main(): Promise<void> {
  const blurMap: Record<string, string> = {};
  const s3On = Boolean(
    process.env.AWS_S3_BUCKET &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY,
  );
  console.log(
    `Processing ${STOCK_URLS.length} stock images (S3 upload: ${s3On ? "ON" : "OFF — blur map only"})\n`,
  );

  for (const url of STOCK_URLS) {
    try {
      const buf = await fetchBuffer(url);
      blurMap[url] = await makeBlur(buf);
      const base = keyFromUrl(url).replace(/\.(jpe?g|png|webp)$/i, "");
      await uploadVariants(buf, base);
      console.log(`✓ ${url.split("/").pop()}`);
    } catch (err) {
      console.warn(`✗ ${url} — ${(err as Error).message}`);
    }
  }

  const outPath = join(process.cwd(), "src/lib/stock-blur-map.ts");
  const body =
    "// GENERATED by scripts/process-stock-images.ts — do not edit by hand.\n" +
    "// Per-stock-photo LQIP (tiny base64 WebP) consumed by <PropertyImage>.\n\n" +
    `export const STOCK_BLUR: Record<string, string> = ${JSON.stringify(blurMap, null, 2)};\n`;
  writeFileSync(outPath, body);
  console.log(`\nWrote ${Object.keys(blurMap).length} blurs → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
