/**
 * Browser side of the marketplace funnel.
 *
 * Kept free of any `@prisma/client` or `node:` import so it can be pulled into
 * a client bundle without dragging the Prisma runtime with it — the event names
 * are mirrored as a string union instead. They must stay in sync with the
 * `ListingEventType` enum in prisma/schema.prisma (which is append-only).
 */

import { currentSource, withSourceMarker } from "./source";

export type TrackableEvent =
  | "VIEW"
  | "CONTACT_PHONE_REVEAL"
  | "CONTACT_PHONE_CLICK"
  /** The /k page's "Get the broker's answer on WhatsApp". */
  | "CONTACT_MESSAGE";

/**
 * Fire-and-forget. `sendBeacon` is the right primitive here: it survives the
 * page teardown that a `tel:` link causes on mobile, where a plain `fetch`
 * would be cancelled as the dialer takes over and the inquiry would vanish
 * exactly on the interaction we most want to count.
 *
 * The payload is a text/plain Blob carrying JSON so the request stays a simple
 * request with no preflight; the route reads it as text and parses it.
 *
 * Never throws and never reports failure — a dropped analytics event is not
 * worth a broken interaction.
 */
export function trackEvent(listingId: number, type: TrackableEvent): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(listingId) || listingId <= 0) return;

  send(JSON.stringify({ listingId, type }));
}

function send(payload: string): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon("/api/track", blob)) return;
    }
    // sendBeacon returns false when the user-agent's queue is full, and is
    // absent on some older browsers. keepalive gives the fetch the same
    // survive-the-unload behaviour.
    void fetch("/api/track", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    // Ignore — analytics must never surface to the visitor.
  }
}

/**
 * People upstream of a chat (2026-11-16): a visit, a WhatsApp tap, a chat opened. The kinds and places
 * mirror src/lib/analytics/signals.ts (kept as strings here so this file stays free of server imports).
 * The source is the visitor's first touch (source.ts) — a `?s=` marker or the referrer.
 */
export type SignalKind = "visit" | "wa_tap" | "chat_open";
export type SignalPlace = "home" | "find" | "today" | "tt" | "k" | "listing" | "bubble" | "sheet";

export function trackSignal(kind: SignalKind, place: SignalPlace): void {
  if (typeof window === "undefined") return;
  try {
    send(JSON.stringify({ signal: { kind, place, source: currentSource() } }));
  } catch {
    // Ignore — analytics must never surface to the visitor.
  }
}

const sentOnce = new Set<string>();

/** Once per page load, for events that can repeat (the chat opening, a first keypress). */
export function trackSignalOnce(kind: SignalKind, place: SignalPlace): void {
  const key = `${kind}:${place}`;
  if (sentOnce.has(key)) return;
  sentOnce.add(key);
  trackSignal(kind, place);
}

/**
 * onClick for a WhatsApp link: counts the tap and, before the browser follows the link, adds
 * ` s:<source>` to its prefilled text so the chat that arrives can be attributed to the link that
 * brought the person (whatsapp-format.ts refSourceOf). Only for a non-direct source.
 */
export function onWaTap(place: SignalPlace): (event: { currentTarget: { href?: string } }) => void {
  return (event) => {
    try {
      trackSignal("wa_tap", place);
      const el = event.currentTarget;
      if (el && typeof el.href === "string") el.href = withSourceMarker(el.href, currentSource());
    } catch {
      // Ignore — the link must still open.
    }
  };
}
