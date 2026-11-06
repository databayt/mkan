"use client";

import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import { trackEvent } from "@/lib/analytics/beacon";

/**
 * The /k page's "Get the broker's answer on WhatsApp": the tap is the funnel's step between a TikTok
 * view and a chat, so it is recorded (CONTACT_MESSAGE, through /api/track's bot filter) — 2026-11-07,
 * the step was not measured at all.
 */
export function WhatsAppCta({ href, listingId, children }: { href: string; listingId: number; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackEvent(listingId, "CONTACT_MESSAGE")}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3 text-[15px] font-medium text-background"
    >
      <MessageCircle className="size-4" aria-hidden />
      {children}
    </a>
  );
}
