"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { PHASE1 } from "@/config/phase-flags";
import { getStaleAvailabilityListings } from "@/lib/actions/listing-actions";
import {
  AVAILABILITY_SNOOZE_COOKIE,
  type StaleListing,
} from "./availability-shared";

// The dialog (framer-motion + Radix Dialog subtree) loads only for the rare
// visitor it actually applies to — an authenticated host with a stale
// listing — instead of shipping with every route via the locale layout.
const AvailabilityCheck = dynamic(
  () => import("./availability-check").then((m) => m.AvailabilityCheck),
  { ssr: false },
);

// Surfaces where a floating owner-nudge would be rude or in the way: auth,
// checkout, wizards/editors, admin tooling, and the transport vertical.
const BLOCKED: RegExp[] = [
  /\/(login|register|reset|new-password|new-verification|error)(\/|$)/,
  /\/book(\/|$)/,
  /\/checkout(\/|$)/,
  /\/hosting\/listings\/editor\//,
  /\/host(\/|$)/, // become-a-host onboarding wizard (NOT /hosting)
  /\/admin(\/|$)/,
  /\/dev(\/|$)/,
  /\/travel/,
  /\/verify-listing\//,
  /\/multicalendar/,
  /\/clone-preview/,
];

function hasCookie(name: string): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}

/**
 * Global availability-nudge loader. Mounted once in the locale layout so the
 * reminder reaches owners wherever they browse (home, search, hosting) — not
 * only on /hosting/listings. Renders nothing for guests, on blocked surfaces,
 * while snoozed, or while the cookie-consent banner still owns the bottom edge.
 * Fetches the stale queue once per session via the server action (the layout
 * stays ISR-cacheable — no auth() in the render path).
 */
export function AvailabilityPrompt() {
  const { status } = useSession();
  const pathname = usePathname() ?? "";
  const [items, setItems] = useState<StaleListing[] | null>(null);
  // Cookie-consent banner occupies the same bottom edge — wait our turn.
  const [consentSettled, setConsentSettled] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (hasCookie("cookieConsent")) {
      setConsentSettled(true);
      return;
    }
    const onChoice = () => setConsentSettled(true);
    window.addEventListener("cookieconsent", onChoice);
    return () => window.removeEventListener("cookieconsent", onChoice);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || fetched.current) return;
    if (hasCookie(AVAILABILITY_SNOOZE_COOKIE)) return;
    fetched.current = true;
    getStaleAvailabilityListings(PHASE1.availabilityReminderDays)
      .then(setItems)
      .catch(() => setItems(null));
  }, [status]);

  if (!consentSettled || !items || items.length === 0) return null;
  if (BLOCKED.some((re) => re.test(pathname))) return null;

  return (
    <AvailabilityCheck
      staleListings={items}
      periodDays={PHASE1.availabilityReminderDays}
    />
  );
}
