// Pre-made WebP variant helpers (mirror hogwarts `catalog/image-url.ts`).
//
// `scripts/process-stock-images.ts` runs Sharp to produce `<base>-<size>.webp`
// variants in S3/CDN. Once those exist AND NEXT_PUBLIC_USE_CDN_VARIANTS=true,
// the custom loader (`image-loader.ts`) serves them so transforms happen
// AWS-side, off Vercel. Until then the app uses Next's default optimizer.
//
// Single source of truth for the variant widths — shared by the loader and the
// offline Sharp script.

import { urlForKey } from "@/lib/cdn";

export const LISTING_IMAGE_VARIANTS = [
  { suffix: "sm", width: 400 },
  { suffix: "md", width: 800 },
  { suffix: "lg", width: 1600 },
] as const;

export type VariantSuffix =
  | (typeof LISTING_IMAGE_VARIANTS)[number]["suffix"]
  | "original";

/** Accept a full CDN URL or a bare key; return the key with any image ext stripped. */
export function variantBaseKey(keyOrUrl: string): string {
  const key = keyOrUrl.replace(/^https?:\/\/[^/]+\//, "").replace(/\?.*$/, "");
  return key.replace(/\.(jpe?g|png|webp)$/i, "");
}

/** Full CDN URL for a single pre-made variant. */
export function getListingImageUrl(
  keyOrUrl: string,
  size: VariantSuffix = "md",
): string {
  return urlForKey(`${variantBaseKey(keyOrUrl)}-${size}.webp`);
}
