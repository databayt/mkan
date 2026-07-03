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

export default function cdnVariantLoader({
  src,
  width,
}: ImageLoaderProps): string {
  // Non-transformable sources render as-is.
  if (src.startsWith("data:") || /\.svg(\?.*)?$/i.test(src)) return src;
  if (!src.includes(CDN_HOST)) return src;

  const base = variantBaseKey(src);
  // Only the stock pool has pre-made `-{size}.webp` variants (produced by
  // scripts/process-stock-images.ts). User uploads are already optimized to a
  // single WebP at upload time, so they serve as-is; anything else too.
  if (!base.includes("mkan/stock/")) return src;
  // Already a variant key — don't double-suffix.
  if (/-(sm|md|lg|original)$/.test(base)) {
    return `https://${CDN_HOST}/${base}.webp`;
  }
  return `https://${CDN_HOST}/${base}-${pickSuffix(width)}.webp`;
}
