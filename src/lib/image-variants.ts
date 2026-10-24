// Pre-made listing-photo variants — the one ladder shared by the next/image
// loader (image-loader.ts), the Cloudflare Worker (cf/worker.js bundles this
// file, so it stays import-free and runtime-neutral) and the offline Sharp
// scripts (process-stock-images.ts, process-listing-images.ts).
//
// Every CDN photo `mkan/…/<name>.<jpg|png|webp>` gets `<name>-<suffix>.<format>`
// written beside it. The Worker answers /_next/image from those files, so the
// one half-vCPU container never resizes a listing photo on request — a cold
// /listings page queued ~20 s of encodes there (2026-10-23).

export const LISTING_IMAGE_VARIANTS = [
  { suffix: "sm", width: 400 },
  { suffix: "md", width: 800 },
  { suffix: "lg", width: 1600 },
] as const;

export type LadderSuffix = (typeof LISTING_IMAGE_VARIANTS)[number]["suffix"];

/** AVIF where the browser takes it (~35% smaller), WebP everywhere else. */
export const VARIANT_FORMATS = ["avif", "webp"] as const;
export type VariantFormat = (typeof VARIANT_FORMATS)[number];

/** Sharp settings. Encoding happens once, offline, so the slower effort is free. */
export const VARIANT_ENCODE = {
  avif: { quality: 50, effort: 4 },
  webp: { quality: 75, effort: 4 },
} as const;

export const VARIANT_CACHE_CONTROL = "public, max-age=31536000, immutable";

// A slot this much narrower than the asked-for width looks the same (an 828
// request gets the 800 file) and saves jumping to the next slot, twice as big.
const TOLERANCE = 1.05;

/** Smallest slot that covers a render width; the largest one beyond that. */
export function pickVariantSuffix(width: number): LadderSuffix {
  for (const v of LISTING_IMAGE_VARIANTS) {
    if (width <= v.width * TOLERANCE) return v.suffix;
  }
  return "lg";
}

/** Accept a full CDN URL or a bare key; return the key with any image ext stripped. */
export function variantBaseKey(keyOrUrl: string): string {
  const key = keyOrUrl.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
  return key.replace(/\.(jpe?g|png|webp)$/i, "");
}

const SOURCE = /\.(jpe?g|png|webp)$/i;
const ALREADY_VARIANT = /-(sm|md|lg|original)$/;

/** The CDN photos that have (or will get) pre-made variants: mkan's own rasters. */
export function hasVariants(src: string, host = "cdn.databayt.org"): boolean {
  if (!src.startsWith(`https://${host}/mkan/`)) return false;
  if (/[?#]/.test(src) || !SOURCE.test(src)) return false;
  return !ALREADY_VARIANT.test(variantBaseKey(src));
}

/** URL of the variant that serves `width` for a CDN photo, or null if it has none. */
export function variantUrl(
  src: string | null | undefined,
  width: number,
  format: VariantFormat,
  host = "cdn.databayt.org",
): string | null {
  if (!src || !hasVariants(src, host)) return null;
  if (!Number.isFinite(width) || width <= 0) return null;
  return `https://${host}/${variantBaseKey(src)}-${pickVariantSuffix(width)}.${format}`;
}

/**
 * The cover's stored blur (Listing.coverBlur), only while it still belongs to
 * the cover: a host who changes the cover must not get the old photo's blur.
 */
export function coverBlurOf(listing: {
  photoUrls?: string[] | null;
  coverBlur?: string | null;
  coverBlurUrl?: string | null;
}): string | undefined {
  const cover = listing.photoUrls?.[0];
  if (!cover || !listing.coverBlur || listing.coverBlurUrl !== cover) return undefined;
  return listing.coverBlur;
}

/**
 * Every file the generator writes for one photo, in write order. The last one
 * (lg.avif) doubles as the "this photo is done" marker, so it must stay last.
 */
export function variantFiles(): {
  suffix: LadderSuffix;
  width: number;
  format: VariantFormat;
}[] {
  const order: VariantFormat[] = ["webp", "avif"];
  return order.flatMap((format) =>
    LISTING_IMAGE_VARIANTS.map((v) => ({ suffix: v.suffix, width: v.width, format })),
  );
}
