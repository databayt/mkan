"use client";

import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import { trackEvent } from "@/lib/analytics/beacon";
import { cn } from "@/lib/utils";

/** A WhatsApp button on /tt. A home's tap is recorded (CONTACT_MESSAGE) like the /k page's; the general one has no home. */
export function TtCta({ href, listingId, className, children }: { href: string; listingId?: number; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={listingId ? () => trackEvent(listingId, "CONTACT_MESSAGE") : undefined}
      className={cn("flex items-center justify-center gap-2 rounded-full bg-foreground font-medium text-background", className)}
    >
      <MessageCircle className="size-4" aria-hidden />
      {children}
    </a>
  );
}
