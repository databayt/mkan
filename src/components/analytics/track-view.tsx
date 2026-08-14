"use client";

import { useEffect, useRef } from "react";

import { trackEvent } from "@/lib/analytics/beacon";

/**
 * Records one VIEW for the listing page it is mounted on.
 *
 * Mount this ONCE per page, at the page level — not inside the desktop and
 * mobile trees. The listing page renders both trees on every request and hides
 * one with CSS, so a component placed inside them would fire twice for a single
 * human visit.
 *
 * The ref guard makes the effect idempotent under React StrictMode's
 * double-invocation in development, so local view counts match production.
 */
export default function TrackView({ listingId }: { listingId: number }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent(listingId, "VIEW");
  }, [listingId]);

  return null;
}
