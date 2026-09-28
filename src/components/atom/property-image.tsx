"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { BlurImage, NEUTRAL_BLUR } from "@/components/atom/blur-image";
import { PropertyImageFallback } from "@/components/atom/property-image-fallback";
import cdnVariantLoader from "@/lib/image-loader";
import { STOCK_BLUR } from "@/lib/stock-blur-map";

/**
 * The single home/property image primitive.
 *
 * Always `fill` — the caller owns a `relative` box with the aspect ratio. It
 * centralizes, for every listing image in the app:
 *   • the blur-up (via BlurImage): the per-image LQIP when supplied, else the
 *     stock map, else a neutral blur — the photo sharpens into place instead of
 *     popping from a gray box. The caller's box must be `overflow-hidden`;
 *   • the correct responsive `sizes` + `quality` per surface (variant);
 *   • an optional CDN-variant loader so resize/format happens AWS-side, off
 *     Vercel, once NEXT_PUBLIC_USE_CDN_VARIANTS=true and the variants exist;
 *   • a graceful fallback when the src is missing or fails to load.
 *
 * Tune image behaviour here once and it applies across search, detail, gallery,
 * the mobile strip, the full-screen viewer, and the home carousels.
 */

/** Flip on once the offline Sharp script has populated `<key>-<size>.webp`. */
const USE_CDN_VARIANTS = process.env.NEXT_PUBLIC_USE_CDN_VARIANTS === "true";

export type PropertyImageVariant =
  | "card"
  | "hero"
  | "thumb"
  | "full"
  | "nearby";

// Per-surface responsive sizes + quality, measured from the Airbnb-cloned
// layouts. `quality` stays within next.config's allowed `[50, 65, 75]`.
const VARIANTS: Record<
  PropertyImageVariant,
  { sizes: string; quality: number }
> = {
  card: {
    sizes: "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw",
    quality: 65,
  },
  hero: { sizes: "(max-width: 1024px) 100vw, 50vw", quality: 75 },
  thumb: { sizes: "25vw", quality: 65 },
  full: { sizes: "(max-width: 768px) 100vw, 50vw", quality: 75 },
  nearby: { sizes: "200px", quality: 65 },
};

export interface PropertyImageProps {
  src?: string | null;
  alt: string;
  variant?: PropertyImageVariant;
  priority?: boolean;
  /** Per-image LQIP; falls back to the shared shimmer. */
  blurDataURL?: string;
  /** Extra classes on the <Image> (merged after object-cover). */
  className?: string;
  /** Override the variant's responsive sizes. */
  sizes?: string;
  /** Override the variant's quality (must be one of 50 / 65 / 75). */
  quality?: number;
  /** Seed for the fallback graphic (listing id/title). */
  seed?: string;
  /** Fade only, no blur-up — for tiny tiles (≤48px) where a blur reads as a bug. */
  plain?: boolean;
}

export function PropertyImage({
  src,
  alt,
  variant = "card",
  priority = false,
  blurDataURL,
  className,
  sizes,
  quality,
  seed,
  plain = false,
}: PropertyImageProps): React.ReactElement {
  const [errored, setErrored] = React.useState(false);
  const v = VARIANTS[variant];

  if (!src || errored) {
    return <PropertyImageFallback seed={seed ?? alt} alt={alt} />;
  }

  return (
    <BlurImage
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? v.sizes}
      quality={quality ?? v.quality}
      priority={priority}
      plain={plain}
      blurDataURL={blurDataURL ?? STOCK_BLUR[src] ?? NEUTRAL_BLUR}
      loader={USE_CDN_VARIANTS ? cdnVariantLoader : undefined}
      className={cn("object-cover", className)}
      onError={() => setErrored(true)}
    />
  );
}
