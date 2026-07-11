"use client";

import React from "react";
import { useDictionary } from "@/components/internationalization/use-dictionary";

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
  heading,
}: ThingsToKnowProps) {
  const dict = useDictionary();
  const t = dict?.listings?.thingsToKnow;

  const houseRules = [
    t?.checkInAfter ?? "Check-in after 3:00 PM",
    t?.checkoutBefore ?? "Checkout before 11:00 AM",
    (t?.guestsMaximum ?? "{count} guests maximum").replace("{count}", String(maxGuests ?? 2)),
    petsAllowed ? (t?.petsAllowed ?? "Pets allowed") : (t?.noPets ?? "No pets"),
  ];

  const safety = [
    t?.carbonMonoxideAlarmNotReported ?? "Carbon monoxide alarm not reported",
    t?.smokeAlarm ?? "Smoke alarm",
    t?.exteriorCameras ?? "Exterior security cameras on property",
  ];

  const cancellation = [
    t?.freeCancellationBeforeCheckIn ?? "Free cancellation before check-in.",
    t?.reviewFullPolicy ??
      "Review the Host's full cancellation policy which applies even if you cancel for illness or disruptions.",
  ];

  const showMore = t?.showMore ?? "Show more";

  return (
    <section className="border-b border-[#DDDDDD] py-12">
      <h2 className="mb-8 text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {heading ?? (t?.heading ?? "Things to know")}
      </h2>
      <div className="grid grid-cols-1 gap-x-4 gap-y-8 md:grid-cols-3">
        <Column title={t?.houseRules ?? "House rules"} rows={houseRules} showMore={showMore} />
        <Column title={t?.safetyProperty ?? "Safety & property"} rows={safety} showMore={showMore} />
        <Column
          title={t?.cancellationPolicy ?? "Cancellation policy"}
          rows={cancellation}
          showMore={showMore}
        />
      </div>
    </section>
  );
}
