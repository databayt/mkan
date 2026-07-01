"use client";

import React from "react";

/**
 * "Where you'll sleep" — mirrors the Airbnb room-page sleeping-arrangements
 * row: one bordered card per bedroom with a bed glyph, the room label, and the
 * bed count. The reference (airbnb.com/rooms) draws each card at 1px #DDDDDD /
 * 12px radius / 24px padding in a horizontally-scrolling flex row.
 *
 * The Listing model has no per-room bed breakdown, so each bedroom renders a
 * single "1 bed" card; a studio (0 bedrooms) collapses to one "Living room"
 * card, matching how Airbnb labels bedless stays.
 */

// Airbnb's DLS bed glyph (viewBox 0 0 32 32, 2px stroke, round caps) — lifted
// to match the optical weight of the room-card icons on the live page.
function BedGlyph() {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      role="presentation"
      focusable="false"
      style={{
        display: "block",
        height: 24,
        width: 24,
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }}
    >
      <path d="M4 9v14M4 17h24M28 23v-6a4 4 0 0 0-4-4H10M4 13h2" />
      <path d="M10 13V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4" />
    </svg>
  );
}

interface WhereYouSleepProps {
  bedrooms?: number | null;
  heading?: string;
  bedLabel?: string;
  bedroomLabel?: string;
  studioLabel?: string;
}

export default function WhereYouSleep({
  bedrooms,
  heading = "Where you'll sleep",
  bedLabel = "1 bed",
  bedroomLabel = "Bedroom",
  studioLabel = "Living room",
}: WhereYouSleepProps) {
  const count = Math.max(0, bedrooms ?? 0);
  // 0 bedrooms (studio) → a single living-room card; otherwise one card per room.
  const rooms =
    count === 0
      ? [{ label: studioLabel }]
      : Array.from({ length: count }, (_, i) => ({
          label: `${bedroomLabel} ${i + 1}`,
        }));

  return (
    <section className="border-b border-[#DDDDDD] py-12">
      <h2 className="mb-6 text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
        {heading}
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-1">
        {rooms.map((room, i) => (
          <div
            key={i}
            className="flex w-[232px] flex-none flex-col gap-2 rounded-xl border border-[#DDDDDD] p-6"
          >
            <span className="text-[#222222]">
              <BedGlyph />
            </span>
            <h3 className="mt-2 text-base font-medium text-[#222222]">
              {room.label}
            </h3>
            <p className="text-sm text-[#6A6A6A]">{bedLabel}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
