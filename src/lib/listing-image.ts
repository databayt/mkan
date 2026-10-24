// Pre-made variant helpers (mirror hogwarts `catalog/image-url.ts`).
//
// The ladder itself lives in `image-variants.ts`, the single source of truth
// shared by the loader, the Worker and the offline Sharp scripts; this file
// adds the app-side URL builder on top of it.

import { urlForKey } from "@/lib/cdn";
import { variantBaseKey, type LadderSuffix } from "@/lib/image-variants";

export { LISTING_IMAGE_VARIANTS, variantBaseKey } from "@/lib/image-variants";

export type VariantSuffix = LadderSuffix | "original";

/** Full CDN URL for a single pre-made WebP variant. */
export function getListingImageUrl(
  keyOrUrl: string,
  size: VariantSuffix = "md",
): string {
  return urlForKey(`${variantBaseKey(keyOrUrl)}-${size}.webp`);
}
