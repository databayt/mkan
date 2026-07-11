"use client";

import * as React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { PropertyImageFallback } from "@/components/atom/property-image-fallback";
import cdnVariantLoader from "@/lib/image-loader";
import { STOCK_BLUR } from "@/lib/stock-blur-map";

/**
 * The single home/property image primitive.
 *
 * Always `fill` — the caller owns a `relative` box with the aspect ratio. It
 * centralizes, for every listing image in the app:
 *   • a blur placeholder (per-image LQIP when supplied, else a shared shimmer)
 *     so cards fade in instead of popping from a gray box;
 *   • the correct responsive `sizes` + `quality` per surface (variant);
 *   • an optional CDN-variant loader so resize/format happens AWS-side, off
 *     Vercel, once NEXT_PUBLIC_USE_CDN_VARIANTS=true and the variants exist;
 *   • a graceful fallback when the src is missing or fails to load.
 *
 * Tune image behaviour here once and it applies across search, detail, gallery,
 * the mobile strip, the full-screen viewer, and the home carousels.
 */

/** Neutral blur shown until the image decodes (reads fine in light + dark). */
const SHIMMER =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQAAwAA4BaJaQAA3AA/vEAgAA=";

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
}: PropertyImageProps): React.ReactElement {
  const [errored, setErrored] = React.useState(false);
  const v = VARIANTS[variant];

  if (!src || errored) {
    return <PropertyImageFallback seed={seed ?? alt} alt={alt} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes ?? v.sizes}
      quality={quality ?? v.quality}
      priority={priority}
      // i18n-exempt — next/image API token, not user-facing copy
      placeholder="blur"
      blurDataURL={blurDataURL ?? STOCK_BLUR[src] ?? SHIMMER}
      loader={USE_CDN_VARIANTS ? cdnVariantLoader : undefined}
      className={cn("object-cover", className)}
      onError={() => setErrored(true)}
    />
  );
}
