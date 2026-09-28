"use client";

import * as React from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

/**
 * Blur-up image — a drop-in for `next/image`.
 *
 * The photo arrives as a soft, blurred version of itself (its LQIP, painted by
 * next/image from the first HTML byte) and sharpens into place over ~700 ms.
 * The parent owns the box: `relative overflow-hidden bg-muted` + an aspect
 * ratio for `fill` images — `overflow-hidden` is required so `scale-105` never
 * spills.
 *
 * LQIP source, in order: static import → stored per image → NEUTRAL_BLUR.
 */

/** Neutral 16×10 LQIP for images with no stored blur — reads fine in light + dark. */
export const NEUTRAL_BLUR =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQAAwAA4BaJaQAA3AA/vEAgAA=";

export type BlurImageProps = ImageProps & {
  /** Skip the blur-up (fade only, no placeholder). Use for tiny icons, logos, avatars ≤48px. */
  plain?: boolean;
};

export function BlurImage({
  className,
  onLoad,
  plain = false,
  placeholder,
  blurDataURL,
  alt,
  ...props
}: BlurImageProps) {
  const [loaded, setLoaded] = React.useState(false);

  // Static imports carry their own blurDataURL; remote images use the stored one or the neutral.
  const staticBlur = typeof props.src === "object" && "blurDataURL" in props.src;
  const blur = blurDataURL ?? (staticBlur ? undefined : NEUTRAL_BLUR);

  return (
    <Image
      {...props}
      alt={alt}
      // i18n-exempt — next/image API tokens, not user-facing copy
      placeholder={placeholder ?? (plain ? "empty" : "blur")}
      blurDataURL={plain ? undefined : blur}
      data-loaded={loaded ? "" : undefined}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      className={cn(
        "transition-[filter,scale,opacity] duration-700 ease-out",
        "motion-reduce:transition-none",
        // Tailwind v4 has no `blur-0` — `blur-none` is the sharp end state.
        loaded
          ? "blur-none scale-100 opacity-100"
          : plain
            ? "opacity-0"
            : "blur-xl scale-105 motion-reduce:blur-none motion-reduce:scale-100",
        className,
      )}
    />
  );
}
