import React from "react";

/**
 * Authentic Airbnb rating star (viewBox 0 0 32 32, fill #222222) — the exact
 * glyph from the live room page, sizable via `size` (Airbnb renders it ~10px in
 * card meta rows, larger in headings). `faded` draws the empty/un-earned star.
 */
const STAR_D =
  "m15.1 1.58-4.13 8.88-9.86 1.27a1 1 0 0 0-.54 1.74l7.3 6.57-1.97 9.85a1 1 0 0 0 1.48 1.06l8.62-5 8.63 5a1 1 0 0 0 1.48-1.06l-1.97-9.85 7.3-6.57a1 1 0 0 0-.55-1.73l-9.86-1.28-4.12-8.88a1 1 0 0 0-1.82 0z";

export function RatingStar({
  size = 10,
  faded = false,
  className = "",
}: {
  size?: number;
  faded?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      className={className}
      style={{ display: "block", fill: faded ? "#DDDDDD" : "#222222" }}
    >
      <path fillRule="evenodd" d={STAR_D} />
    </svg>
  );
}

export default RatingStar;
