"use client";

/**
 * Authentic Airbnb listing-editor glyphs.
 *
 * These are Airbnb's own icon paths (32×32 viewBox, `fill:none; stroke:currentColor`),
 * matching the house style used across the editor — not lucide substitutes.
 * Stroke-based so they inherit `currentColor` and scale crisply.
 */

import React from "react";

type IconProps = {
  className?: string;
  size?: number;
  strokeWidth?: number;
  "aria-hidden"?: boolean;
};

const base = (size: number): React.CSSProperties => ({
  display: "block",
  height: size,
  width: size,
  fill: "none",
  stroke: "currentColor",
  overflow: "visible",
});

/** "All photos" — two overlapping rounded squares (Airbnb's gallery glyph). */
export function PhotosGridIcon({ className, size = 16, strokeWidth = 3 }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ ...base(size), strokeWidth }}
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <g>
        <path d="m9.37059905 10.0233417c.18293611-1.03748223.45734027-2.59370556.82321245-4.66866999.383613-2.17557722 2.4582465-3.62825127 4.6338238-3.24463831l11.817693 2.08377814c2.1755772.38361296 3.6282513 2.4582465 3.2446383 4.63382372l-2.0837781 11.81769304c-.383613 2.1755772-2.4582465 3.6282513-4.6338238 3.2446383-.5125818-.090382-.8970182-.1581685-1.1533092-.2033595" />
        <path d="m6 10h12c2.209139 0 4 1.790861 4 4v12c0 2.209139-1.790861 4-4 4h-12c-2.209139 0-4-1.790861-4-4v-12c0-2.209139 1.790861-4 4-4z" />
      </g>
    </svg>
  );
}

/** Thin plus — Airbnb's add affordance. */
export function PlusIcon({ className, size = 16, strokeWidth = 2.67 }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ ...base(size), strokeWidth, strokeLinecap: "round" }}
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <path d="M16 3v26M3 16h26" />
    </svg>
  );
}

/** Back chevron (start-pointing). Mirror with `rtl:rotate-180`. */
export function ChevronLeftIcon({ className, size = 16, strokeWidth = 2.67 }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ ...base(size), strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" }}
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <path d="M20 28 8 16 20 4" />
    </svg>
  );
}

/** Settings gear (feather-style cog). */
export function GearIcon({ className, size = 16, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ ...base(size), strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" }}
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** Horizontal ellipsis (per-photo overflow menu). */
export function EllipsisIcon({ className, size = 16 }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block", height: size, width: size, fill: "currentColor", overflow: "visible" }}
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <circle cx="6" cy="16" r="2.4" />
      <circle cx="16" cy="16" r="2.4" />
      <circle cx="26" cy="16" r="2.4" />
    </svg>
  );
}

/** Camera (empty photo state). */
export function CameraIcon({ className, size = 24, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ ...base(size), strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" }}
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <path d="M3 11a3 3 0 0 1 3-3h2.5l1.6-2.7a1 1 0 0 1 .9-.5h9.9a1 1 0 0 1 .9.5L25.5 8H26a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
      <circle cx="16" cy="17" r="5" />
    </svg>
  );
}

/** Trash (remove photo). */
export function TrashIcon({ className, size = 16, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ ...base(size), strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" }}
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <path d="M5 8h22M12 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M25 8l-1.2 18a2 2 0 0 1-2 1.9H10.2a2 2 0 0 1-2-1.9L7 8M13 14v8M19 14v8" />
    </svg>
  );
}
