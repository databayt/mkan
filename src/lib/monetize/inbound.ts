import "server-only";
/**
 * Loads the inbound overview (inbound-pure.ts) — STUB (2026-11-16), filled by the cards lane: loadChatFacts
 * for the people, SiteSignal for reach and intent, TikTokPost for views.
 */
import type { InboundOverview } from "./inbound-pure";

export async function loadInbound(_now: Date = new Date()): Promise<InboundOverview | null> {
  return null;
}
