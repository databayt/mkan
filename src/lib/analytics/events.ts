import "server-only";

import { Prisma, type ListingEventType } from "@prisma/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getClientId } from "@/lib/rate-limit";
import { dayDate, dayKey, isBot, visitorHash } from "./visitor";

/**
 * Writes to the marketplace funnel.
 *
 * Every write is an upsert onto `(listingId, type, day, visitorHash)`: the
 * first event of the day for a visitor creates the row, everything after it
 * increments `hits`. So "views" means distinct visitor-days by default —
 * refresh-proof — while `hits` keeps the raw depth for anyone who wants it.
 *
 * Analytics must never break the thing it measures. Every function here
 * swallows its own errors and reports success/failure as a value; callers are
 * free to ignore the result.
 */

export type RecordResult =
  | { recorded: true; created: boolean }
  | { recorded: false; reason: "bot" | "unknown-listing" | "error" };

interface RecordArgs {
  listingId: number;
  type: ListingEventType;
  /** Pre-computed by the caller — see src/lib/analytics/visitor.ts. */
  visitorHash: string;
  /** Present only when the visitor was signed in. */
  userId?: string | null;
  now?: Date;
}

export async function recordListingEvent(args: RecordArgs): Promise<RecordResult> {
  const now = args.now ?? new Date();
  const day = dayDate(dayKey(now));

  try {
    // Doubles as the validity gate: an event for a listing that isn't live is
    // either a probe or a host looking at their own draft, and neither is
    // marketplace demand. This mirrors the PDP's own 404 condition.
    const listing = await db.listing.findFirst({
      where: { id: args.listingId, isPublished: true },
      select: { id: true, location: { select: { city: true, zoneKey: true } } },
    });
    if (!listing) return { recorded: false, reason: "unknown-listing" };

    const cityKey = listing.location?.city?.trim() || null;
    const zoneKey = listing.location?.zoneKey ?? null;

    await db.listingEvent.upsert({
      where: {
        listingId_type_day_visitorHash: {
          listingId: args.listingId,
          type: args.type,
          day,
          visitorHash: args.visitorHash,
        },
      },
      create: {
        listingId: args.listingId,
        type: args.type,
        day,
        visitorHash: args.visitorHash,
        userId: args.userId ?? null,
        cityKey,
        zoneKey,
        firstAt: now,
        lastAt: now,
      },
      update: {
        hits: { increment: 1 },
        lastAt: now,
        // Back-fill attribution when a visitor signs in mid-session: the row
        // was created anonymously, so claim it rather than leaving it orphaned.
        ...(args.userId ? { userId: args.userId } : {}),
      },
    });

    return { recorded: true, created: true };
  } catch (error) {
    // Two concurrent first-events for the same visitor both miss the row and
    // race to insert; the loser gets a unique violation. The event is real, so
    // retry as a pure increment instead of dropping it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      try {
        await db.listingEvent.update({
          where: {
            listingId_type_day_visitorHash: {
              listingId: args.listingId,
              type: args.type,
              day,
              visitorHash: args.visitorHash,
            },
          },
          data: { hits: { increment: 1 }, lastAt: now },
        });
        return { recorded: true, created: false };
      } catch {
        return { recorded: false, reason: "error" };
      }
    }
    logger.error("recordListingEvent failed", {
      error: String(error),
      listingId: args.listingId,
      type: args.type,
    });
    return { recorded: false, reason: "error" };
  }
}

/**
 * Server-action entry point — derives the visitor from the inbound request
 * headers so callers don't have to. Use this from actions that already know an
 * inquiry happened (`createConversation`, `createApplication`); the beacon
 * route handles the client-fired path.
 */
export async function trackListingEvent(args: {
  listingId: number;
  type: ListingEventType;
  userId?: string | null;
}): Promise<RecordResult> {
  try {
    const { headers } = await import("next/headers");
    const headerList = await headers();
    const userAgent = headerList.get("user-agent") ?? "";

    // A signed-in user taking a deliberate action is a real inquiry even if
    // their user-agent looks odd, so only screen anonymous traffic here.
    if (!args.userId && isBot(userAgent)) return { recorded: false, reason: "bot" };

    const ip = await getClientId();
    return recordListingEvent({
      listingId: args.listingId,
      type: args.type,
      visitorHash: visitorHash({ ip, userAgent }),
      userId: args.userId,
    });
  } catch (error) {
    logger.error("trackListingEvent failed", { error: String(error) });
    return { recorded: false, reason: "error" };
  }
}
