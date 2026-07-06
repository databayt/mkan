// Custom next/image loader — serves pre-made CDN WebP variants so image
// resize/format happens AWS-side (CloudFront/S3), NOT on Vercel's optimizer.
//
// A pure function (isomorphic, safe in client components). next/image calls it
// once per device width; we map each width to the smallest variant that covers
// it. Anything we can't map — SVGs, data URIs, non-CDN hosts — passes through
// untouched so the browser renders it as-is.
//
// Wired into <PropertyImage> only when NEXT_PUBLIC_USE_CDN_VARIANTS === "true"
// (i.e. after the offline Sharp script has populated the variants in S3).

import type { ImageLoaderProps } from "next/image";
import { LISTING_IMAGE_VARIANTS, variantBaseKey } from "@/lib/listing-image";

const CDN_HOST = process.env.NEXT_PUBLIC_CDN_DOMAIN?.trim() || "cdn.databayt.org";

/** Smallest pre-made variant suffix that covers the requested render width. */
function pickSuffix(width: number): string {
  for (const v of LISTING_IMAGE_VARIANTS) {
    if (width <= v.width) return v.suffix;
  }
  return "original";
}

/**
 * Vercel's optimizer endpoint — the exact URL shape next/image's default
 * loader emits. Used for CDN images with no pre-made variants (user uploads,
 * CRM-rehosted photos): they're arbitrary-size JPEG/PNG originals, and serving
 * them untouched shipped full-resolution files into ~300px card slots
 * (~700 kB of waste on the homepage alone).
 */
function vercelOptimizedUrl({ src, width, quality }: ImageLoaderProps): string {
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`;
}

export default function cdnVariantLoader({
  src,
  width,
  quality,
}: ImageLoaderProps): string {
  // Non-transformable sources render as-is.
  if (src.startsWith("data:") || /\.svg(\?.*)?$/i.test(src)) return src;
  if (!src.includes(CDN_HOST)) return src;

  const base = variantBaseKey(src);
  // Only the stock pool has pre-made `-{size}.webp` variants (produced by
  // scripts/process-stock-images.ts). Everything else on the CDN (uploads,
  // rehosted photos) goes through Vercel's optimizer for resize + AVIF until
  // an offline script produces variants for those pools too.
  if (!base.includes("mkan/stock/")) {
    return vercelOptimizedUrl({ src, width, quality });
  }
  // Already a variant key — don't double-suffix.
  if (/-(sm|md|lg|original)$/.test(base)) {
    return `https://${CDN_HOST}/${base}.webp`;
  }
  return `https://${CDN_HOST}/${base}-${pickSuffix(width)}.webp`;
}
