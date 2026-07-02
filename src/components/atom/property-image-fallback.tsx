import { cdn } from "@/lib/cdn";
import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

/**
 * Fallback shown in place of a listing photo when a property has none.
 *
 * Renders the Airbnb-style "No Image Available" placeholder graphic
 * (`public/property-placeholder.svg`) centred on a neutral surface, contained
 * (never stretched), so the framed icon + caption keep their proportions in
 * the landscape card slots. Zero network cost beyond the static SVG.
 */

interface PropertyImageFallbackProps {
  /** Accepted for call-site parity; not used by the static placeholder. */
  seed?: string
  /** Accepted for call-site parity. */
  alt?: string
  sizes?: string
  className?: string
}

export function PropertyImageFallback({
  className,
}: PropertyImageFallbackProps): React.ReactElement {
  return (
    <div
      aria-hidden
      className={cn("absolute inset-0 bg-muted/40", className)}
    >
      <Image
        src={cdn.product("property-placeholder.svg")}
        alt="No image available"
        fill
        // Served straight from /public — the image optimizer rejects SVG
        // unless `dangerouslyAllowSVG` is enabled, which it isn't here.
        unoptimized
        className="object-contain p-3"
      />
    </div>
  )
}
