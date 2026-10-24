/**
 * Cover blurs — a 16 px WebP of each listing's cover photo, stored on the row,
 * so a card paints the real photo, blurred, from the first HTML byte instead
 * of a grey box while the image loads.
 *
 * Writes Listing.coverBlur + coverBlurUrl (the photo it was made from) for
 * every listing whose cover has no blur yet or has changed since; cards use it
 * only while coverBlurUrl is still photoUrls[0] (coverBlurOf). Reads the
 * cover's small pre-made variant (-sm.webp, ~10 KB) when it exists, else the
 * original. Same blur recipe as process-stock-images.ts.
 *
 * Raw SQL on purpose: a Prisma update would bump updatedAt, and the hourly
 * CRM sync-up would then re-send every listing to Twenty.
 *
 * Run (GitHub Actions does this hourly — .github/workflows/listing-images.yml):
 *   pnpm images:blurs [--limit=N] [--dry-run]
 */
import "dotenv/config";
import sharp from "sharp";
import { hasVariants, variantBaseKey } from "@/lib/image-variants";

const argv = process.argv.slice(2);
const opt = (name: string) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const DRY = argv.includes("--dry-run");
const LIMIT = Number(opt("limit")) || 100_000;
const CDN = process.env.NEXT_PUBLIC_CDN_DOMAIN?.trim() || "cdn.databayt.org";

async function fetchImage(url: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status < 500) return null; // 403/404: not there
    } catch {}
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
  return null;
}

async function makeBlur(buf: Buffer): Promise<string> {
  const out = await sharp(buf, { failOn: "none" })
    .rotate()
    .resize(16, null, { withoutEnlargement: true })
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${out.toString("base64")}`;
}

async function main(): Promise<void> {
  const { db } = await import("@/lib/db");
  // Neon suspends when idle and a scheduled job has no warm-up — knock first.
  for (let attempt = 1; ; attempt++) {
    try {
      await db.$queryRaw`SELECT 1`;
      break;
    } catch (e) {
      if (attempt === 5) throw e;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }

  const rows = await db.$queryRaw<{ id: number; cover: string }[]>`
    SELECT id, "photoUrls"[1] AS cover FROM "Listing"
    WHERE cardinality("photoUrls") > 0
      AND "coverBlurUrl" IS DISTINCT FROM "photoUrls"[1]
    ORDER BY "isPublished" DESC, "createdAt" DESC
    LIMIT ${LIMIT}`;
  console.log(`[blurs] ${rows.length} covers without a current blur${DRY ? " · DRY RUN" : ""}`);

  const count = { written: 0, missing: 0, moved: 0, failed: 0 };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(16, rows.length) }, async () => {
      while (next < rows.length) {
        const { id, cover } = rows[next++];
        try {
          const small = hasVariants(cover, CDN)
            ? await fetchImage(`https://${CDN}/${variantBaseKey(cover)}-sm.webp`)
            : null;
          const buf = small ?? (await fetchImage(cover));
          if (!buf) {
            count.missing++;
            continue;
          }
          const blur = await makeBlur(buf);
          if (DRY) {
            count.written++;
            continue;
          }
          // Guarded on the cover: a host may have changed it since the SELECT.
          const n = await db.$executeRaw`
            UPDATE "Listing" SET "coverBlur" = ${blur}, "coverBlurUrl" = ${cover}
            WHERE id = ${id} AND "photoUrls"[1] = ${cover}`;
          count[n ? "written" : "moved"]++;
        } catch (e) {
          count.failed++;
          if (count.failed <= 20) console.warn(`[blurs] ✗ listing ${id} — ${(e as Error).message}`);
        }
        const done = count.written + count.missing + count.moved + count.failed;
        if (done % 500 === 0) console.log(`[blurs] ${done}/${rows.length} · ${JSON.stringify(count)}`);
      }
    }),
  );
  console.log(`[blurs] summary ${JSON.stringify({ covers: rows.length, ...count })}`);
  await db.$disconnect();
  if (count.failed > Math.max(10, rows.length * 0.05)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
