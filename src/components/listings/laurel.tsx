import React from "react";
import Image from "next/image";

/**
 * Laurel wreath half — the authentic Airbnb "Guest favorite" laurels, the exact
 * PNGs Airbnb serves (AirbnbPlatformAssets-GuestFavorite), copied into
 * public/guest-favorite/. `side` picks the left or right (mirrored) half. The
 * source art is 86.71 × 132 (ratio ≈ 0.6569); `size` sets the rendered height
 * and the width follows the ratio so it never distorts.
 */
const LAUREL_RATIO = 86.70588235294117 / 132; // ≈ 0.6569

export function Laurel({
  side = "left",
  size = 56,
  className = "",
}: {
  side?: "left" | "right";
  size?: number;
  className?: string;
}) {
  const height = size;
  const width = Math.round(size * LAUREL_RATIO);
  return (
    <Image
      src={`/guest-favorite/laurel-${side}.png`}
      alt=""
      aria-hidden="true"
      width={width}
      height={height}
      className={className}
      style={{ height, width, objectFit: "contain" }}
    />
  );
}

export default Laurel;
