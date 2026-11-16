"use client";

import { useEffect, useRef } from "react";

import { trackSignal, type SignalKind, type SignalPlace } from "@/lib/analytics/beacon";

/**
 * One beacon for the page it is mounted on (2026-11-16): a visit to the homepage, /find, /today, /tt, a
 * /k home or a listing. Mount ONCE per page. The ref guard keeps StrictMode's double effect (and a
 * re-render) from sending a second one, so one page view is one beacon.
 */
export function Signal({ kind, place }: { kind: SignalKind; place: SignalPlace }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackSignal(kind, place);
  }, [kind, place]);

  return null;
}
