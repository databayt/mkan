"use client";

import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import { onWaTap, trackEvent, type SignalPlace } from "@/lib/analytics/beacon";
import { cn } from "@/lib/utils";

/** A WhatsApp button on /tt. A home's tap is recorded (CONTACT_MESSAGE) like the /k page's; the general one has no home. */
export function TtCta({ href, listingId, place = "tt", className, children }: { href: string; listingId?: number; /** Which page the button is on: /tt, /today, or the homepage strip. */ place?: SignalPlace; className?: string; children: ReactNode }) {
  // wa_tap for the place + the first-touch source in the prefilled text (2026-11-16); the CONTACT_MESSAGE of a home stays.
  const tap = onWaTap(place);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        tap(e);
        if (listingId) trackEvent(listingId, "CONTACT_MESSAGE");
      }}
      className={cn("flex items-center justify-center gap-2 rounded-full bg-foreground font-medium text-background", className)}
    >
      <MessageCircle className="size-4" aria-hidden />
      {children}
    </a>
  );
}
