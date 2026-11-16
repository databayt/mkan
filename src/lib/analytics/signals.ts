import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { kigaliDayOf } from "@/lib/monetize/inbound-pure";

/**
 * People upstream of a chat (2026-11-16): per Kigali day, how many distinct visitors visited, tapped a
 * WhatsApp button, or opened the chat, and from where. Same shape as recordListingEvent: one row per
 * (day, kind, place, visitor), later events only raise `hits`, so counts are people not refreshes.
 * Never throws: analytics must not break the page it measures.
 */

export const SIGNAL_KINDS = ["visit", "wa_tap", "chat_open"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const SIGNAL_PLACES = ["home", "find", "today", "tt", "k", "listing", "bubble", "sheet"] as const;
export type SignalPlace = (typeof SIGNAL_PLACES)[number];

export async function recordSignal(args: {
  kind: SignalKind;
  place: SignalPlace;
  /** Already sanitised (source.ts cleanSource). */
  source: string;
  visitorHash: string;
  now?: Date;
}): Promise<boolean> {
  const day = kigaliDayOf(args.now ?? new Date());
  const key = { day_kind_place_visitorHash: { day, kind: args.kind, place: args.place, visitorHash: args.visitorHash } };
  try {
    await db.siteSignal.upsert({
      where: key,
      create: { day, kind: args.kind, place: args.place, source: args.source, visitorHash: args.visitorHash },
      update: { hits: { increment: 1 } },
    });
    return true;
  } catch (error) {
    // Two first-events racing: the loser's insert hits the unique key. The event is real, so count it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      try {
        await db.siteSignal.update({ where: key, data: { hits: { increment: 1 } } });
        return true;
      } catch {
        return false;
      }
    }
    logger.error("recordSignal failed", { error: String(error), kind: args.kind, place: args.place });
    return false;
  }
}
