/**
 * Real photos for host 0001's heirs-estate homes — extracted from the owner's
 * walkthrough videos, re-hosted on our CDN, written onto the listings.
 *
 * Why a script and not a manual upload: the only real visuals the family ever
 * supplied are per-property .mp4 walkthroughs in `~/heirs/public`. The still
 * images sitting next to them are WhatsApp chat screenshots and scanned
 * inheritance decrees carrying real names, passport numbers and phone numbers —
 * they are NEVER publishable and this script must never be pointed at them.
 *
 * What it does, per unit in PLAN below:
 *   1. seeks the hand-picked seconds in that unit's walkthrough (ffmpeg),
 *   2. upscales + mildly sharpens the frame and encodes WebP (sharp),
 *   3. uploads to S3 under the STABLE key `mkan/uploads/heirs/<slug>/NN.webp`
 *      (stable so re-runs overwrite instead of littering, and so the URLs
 *      survive a re-seed that mints new listing ids),
 *   4. patches the matching Prisma listing's `photoUrls` in place — it never
 *      deletes a listing, unlike `seed:heirs`,
 *   5. writes `scripts/data/heirs-photos.json`, which `seed-heirs-homes.ts`
 *      reads so a legitimate re-seed keeps the photos.
 *
 *   pnpm seed:heirs-photos              # dry run — extract + report, no upload
 *   pnpm seed:heirs-photos --apply      # upload to S3 + patch Prisma
 *   pnpm seed:heirs-photos --apply --keep-local   # also leave the WebPs on disk
 *
 * Flags: --videos=<dir> (default ~/heirs/public) --out=<tmpdir> --only=<slug>
 *
 * Coverage is deliberately partial: 3 of 0001's 7 homes. The other four have no
 * usable footage — see the NO_FOOTAGE note at the bottom of PLAN.
 */
import { config } from "dotenv";
config({ override: true });

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const KEEP_LOCAL = process.argv.includes("--keep-local");
const argv = (n: string, d = ""): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split("=").slice(1).join("=") : d;
};
const VIDEO_DIR = argv("videos", join(homedir(), "heirs", "public"));
const WORK_DIR = argv("out", join(tmpdir(), "heirs-photos"));
const ONLY = argv("only");

const MANIFEST = "scripts/data/heirs-photos.json";

type Unit = {
  /** Stable CDN slug — part of the S3 key, so never rename it casually. */
  slug: string;
  /**
   * Distinctive slice of the listing title, used to find the row. A substring
   * and not the whole title on purpose: the live titles have drifted from
   * `seed-heirs-homes.ts` (a neighbourhood suffix was appended, adjectives
   * were edited in), so an exact match silently finds nothing.
   */
  titleMatch: string;
  /** The estate's own label for the unit, for humans reading the manifest. */
  heirsLabel: string;
  video: string;
  /**
   * The unit's photo set, COVER SHOT FIRST.
   *
   * `frame` indexes the 1-frame-every-3-seconds ladder (`fps=1/3`) — indexes
   * rather than timestamps because that ladder is what was reviewed frame by
   * frame (every pick verified to show no people — these are tenanted homes —
   * and no household clutter), and plain `-ss <seconds>` seeking lands on
   * different frames than the ladder.
   *
   * `name`, when present, becomes the CDN filename and the room hint the
   * mastering prompt is grounded with. Trailing digits are photo order within
   * a room type, NOT a claim about how many such rooms the home has. Units
   * still on bare numbers fall back to `01.webp`, `02.webp`, …
   */
  shots: Array<{ frame: number; name?: string }>;
  /** Output width — roughly 2× the source, which is phone-video small. */
  width: number;
};

const PLAN: Unit[] = [
  {
    slug: "furn-1st",
    titleMatch: "بثلاث غرف وثلاثة حمّامات",
    heirsLabel: "الفرن الدور الأول",
    video: "الفرن الدور الاول.mp4",
    shots: [8, 5, 2, 10, 19, 13, 16, 22].map((frame) => ({ frame })),
    width: 1536,
  },
  {
    slug: "beit-kabir-2nd-b",
    titleMatch: "بغرفتين وصالتين وحمّامين",
    heirsLabel: "البيت الكبير الدور الثاني شقة ب",
    // Two clips exist for this unit ("شقة ب" and "شقة ب 2" — same kitchen, same
    // bathrooms, same floors). We use the "2" pass: the other one was filmed
    // while the tenants were home and shows them and their belongings.
    video: "البيت الكبير الدور الثاني شقة ب 2.mp4",
    shots: [
      { frame: 18, name: "living-room" },
      { frame: 2, name: "bedroom-1" },
      { frame: 27, name: "bedroom-2" },
      { frame: 33, name: "bedroom-3" },
      { frame: 13, name: "bedroom-4" },
      { frame: 9, name: "bedroom-5" },
      { frame: 36, name: "kitchen" },
      { frame: 41, name: "kitchen-2" },
      { frame: 21, name: "bathroom" },
    ],
    width: 1280,
  },
  {
    slug: "beit-kabir-ground",
    titleMatch: "شقة أرضية",
    heirsLabel: "البيت الكبير الدور الأرضي",
    // The other ground-floor clip ("النمرة الكاملة") shows the unrenovated half:
    // unplastered walls, windows not yet fitted, a yard full of building debris.
    video: "البيت الكبير الدور الارضي شقة نص نمرة الا تلاتة دكاكين.mp4",
    shots: [4, 1, 5, 9, 23].map((frame) => ({ frame })),
    width: 716,
  },
];

/**
 * The remaining four homes on 0001 stay on the app's placeholder fallback:
 *   • الفرن الدور الثاني                — no walkthrough exists
 *   • البيت الكبير الدور الأول شقة أ    — no walkthrough exists
 *   • البيت الكبير الدور الثاني شقة أ   — no walkthrough exists
 *   • البيت الكبير الدور الأول شقة ب    — filmed mid-renovation (bare block
 *     walls, unglazed windows, paint buckets); the frames contradict the
 *     listing copy, so they are worse than no photo. Re-shoot when finished.
 * The three shop clips (دكان الحلاق / المغسلة / الدكان الفي النص) belong to no
 * listing — mkan sells homes, not shopfronts.
 */

function extract(unit: Unit, frame: number, index: number): string {
  const src = join(VIDEO_DIR, unit.video);
  const raw = join(WORK_DIR, `${unit.slug}-${String(index).padStart(2, "0")}.png`);
  execFileSync(
    "ffmpeg",
    [
      "-v", "error",
      "-i", src,
      "-vf", `fps=1/3,select=eq(n\\,${frame - 1})`,
      "-fps_mode", "passthrough",
      "-frames:v", "1",
      "-y", raw,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  return raw;
}

async function encode(raw: string, width: number, out: string): Promise<number> {
  const buf = await sharp(raw)
    .resize({ width, kernel: "lanczos3", withoutEnlargement: false })
    .sharpen({ sigma: 0.8 })
    .webp({ quality: 84, effort: 6 })
    .toBuffer();
  writeFileSync(out, buf);
  return buf.byteLength;
}

async function main(): Promise<void> {
  mkdirSync(WORK_DIR, { recursive: true });
  const units = ONLY ? PLAN.filter((u) => u.slug === ONLY) : PLAN;
  if (!units.length) throw new Error(`--only=${ONLY} matched no unit`);

  const s3 = APPLY ? await import("@/lib/s3") : null;
  if (APPLY && !s3!.isS3Configured()) {
    throw new Error(
      "S3 is not configured — set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET in .env",
    );
  }

  console.log(
    `\n📸 Heirs photos → host 0001 — ${units.length} unit(s)  (${APPLY ? "APPLY" : "dry"})`,
  );
  console.log(`   videos: ${VIDEO_DIR}\n`);

  const manifest: Record<
    string,
    { heirsLabel: string; titleMatch: string; photoUrls: string[] }
  > = {};

  for (const unit of units) {
    const urls: string[] = [];
    for (let i = 0; i < unit.shots.length; i++) {
      const n = i + 1;
      const shot = unit.shots[i]!;
      const stem = shot.name ?? String(n).padStart(2, "0");
      const raw = extract(unit, shot.frame, n);
      const webp = join(WORK_DIR, `${unit.slug}-${stem}.webp`);
      const bytes = await encode(raw, unit.width, webp);
      rmSync(raw, { force: true });

      const key = `mkan/uploads/heirs/${unit.slug}/${stem}.webp`;
      if (APPLY) {
        const url = await s3!.putObject({
          key,
          body: readFileSync(webp),
          contentType: "image/webp",
        });
        if (!url) throw new Error(`S3 upload returned no URL for ${key}`);
        urls.push(url);
      } else {
        urls.push(`https://cdn.databayt.org/${key}`);
      }
      if (!KEEP_LOCAL && APPLY) rmSync(webp, { force: true });
      console.log(`   · ${key}  ${(bytes / 1024).toFixed(0)} KB`);
    }
    manifest[unit.slug] = { heirsLabel: unit.heirsLabel, titleMatch: unit.titleMatch, photoUrls: urls };
    console.log(`   ${unit.heirsLabel} → ${urls.length} photos\n`);
  }

  if (!APPLY) {
    console.log(
      `DRY — nothing uploaded, Prisma untouched. Frames are in ${WORK_DIR}. Re-run with --apply.\n`,
    );
    return;
  }

  // Patch Prisma IN PLACE. Deliberately not `seed:heirs`: that script deletes
  // 0001's listings (and their bookings, leases and reviews) before rebuilding.
  const prisma = (await import("@/lib/db")).db;
  const host = await prisma.user.findUnique({
    where: { email: "0001@mkan.org" },
    select: { id: true },
  });
  if (!host) throw new Error("host 0001@mkan.org not found");

  for (const unit of units) {
    const matches = await prisma.listing.findMany({
      where: { hostId: host.id, title: { contains: unit.titleMatch } },
      select: { id: true, title: true },
    });
    if (matches.length !== 1) {
      console.warn(
        `   ! "${unit.titleMatch}" matched ${matches.length} listings on host 0001 — skipped (needs exactly one)`,
      );
      continue;
    }
    const listing = matches[0]!;
    await prisma.listing.update({
      where: { id: listing.id },
      data: { photoUrls: manifest[unit.slug]!.photoUrls },
    });
    console.log(
      `   ✓ listing ${listing.id} ← ${manifest[unit.slug]!.photoUrls.length} photos  (${unit.heirsLabel})`,
    );
  }

  // Merge into the manifest the seed reads, so a re-seed keeps the photos.
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    /* first run */
  }
  mkdirSync("scripts/data", { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify({ ...existing, ...manifest }, null, 2)}\n`);
  console.log(`\n✅ done — manifest at ${MANIFEST}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
