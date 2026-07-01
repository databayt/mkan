"use client";

import React from "react";

/**
 * "Things to know" — the three-column block that closes the Airbnb room page:
 * House rules / Safety & property / Cancellation policy. Each column is a
 * heading (16px/600) over a short stack of 14px #222222 rows and a "Show more"
 * affordance, laid out 1-col on mobile and 3-col from md up (Airbnb's grid).
 *
 * The Listing model exposes guest count and pet policy; the remaining rows are
 * the platform-standard defaults Airbnb shows when a host hasn't overridden
 * them (check-in/checkout windows, alarms, partial-refund cancellation).
 */

interface ThingsToKnowProps {
  maxGuests?: number | null;
  petsAllowed?: boolean;
  heading?: string;
}

function Column({
  title,
  rows,
  showMore,
}: {
  title: string;
  rows: string[];
  showMore: string;
}) {
  return (
    <div className="flex flex-col">
      <h3 className="mb-1 text-sm font-medium leading-[18px] text-[#222222]">{title}</h3>
      <ul className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={i} className="text-sm leading-[18px] text-[#6C6C6C]">
            {r}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-3 w-fit text-sm text-[#6A6A6A] underline underline-offset-2 hover:opacity-80"
      >
        {showMore}
      </button>
    </div>
  );
}

export default function ThingsToKnow({
  maxGuests,
  petsAllowed = false,
  heading = "Things to know",
}: ThingsToKnowProps) {
  const houseRules = [
    "Check-in after 3:00 PM",
    "Checkout before 11:00 AM",
    `${maxGuests ?? 2} guests maximum`,
    petsAllowed ? "Pets allowed" : "No pets",
  ];

  const safety = [
    "Carbon monoxide alarm not reported",
    "Smoke alarm",
    "Exterior security cameras on property",
  ];

  const cancellation = [
    "Free cancellation before check-in.",
    "Review the Host's full cancellation policy which applies even if you cancel for illness or disruptions.",
  ];

  return (
    <section className="border-b border-[#DDDDDD] py-12">
      <h2 className="mb-8 text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {heading}
      </h2>
      <div className="grid grid-cols-1 gap-x-4 gap-y-8 md:grid-cols-3">
        <Column title="House rules" rows={houseRules} showMore="Show more" />
        <Column title="Safety & property" rows={safety} showMore="Show more" />
        <Column
          title="Cancellation policy"
          rows={cancellation}
          showMore="Show more"
        />
      </div>
    </section>
  );
}
