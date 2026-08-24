"use server";

import { z } from "zod";
import { auth, canOverride } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/rate-limit";
import { localize, getText } from "@/components/translation/localize";
import { getDisplayLang } from "@/components/translation/locale";
import { trackListingEvent } from "@/lib/analytics/events";
import { ListingEventType } from "@prisma/client";
import { listingSegment } from "@/lib/listing-code";

// ============================================
// Host ⇄ guest messaging (Airbnb /hosting/messages). The inbox is host-centric
// but every action is party-aware (host OR guest OR admin) so the same thread
// is reachable from either side.
// ============================================

export interface ConversationListItem {
  id: number;
  guestName: string;
  guestImage: string | null;
  listingTitle: string | null;
  listingPhoto: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unread: boolean;
  subject: string | null;
}

export interface ThreadMessage {
  id: number;
  body: string;
  senderId: string;
  isHost: boolean;
  createdAt: string;
}

export interface ConversationDetail {
  id: number;
  guestId: string;
  guestName: string;
  guestImage: string | null;
  listingId: number | null;
  /** URL segment for the listing — the mkan code when it has one. */
  listingHref: string | null;
  listingTitle: string | null;
  listingPhoto: string | null;
  bookingId: number | null;
  subject: string | null;
  booking: {
    checkIn: string;
    checkOut: string;
    guestCount: number;
    status: string;
    totalPrice: number;
  } | null;
  messages: ThreadMessage[];
}

const idSchema = z.coerce.number().int().positive();

// ---------- list (host inbox) ----------
export async function getConversations(): Promise<ConversationListItem[]> {
  const session = await auth();
  if (!session?.user?.id) return [];

  const convos = await db.conversation.findMany({
    where: { hostId: session.user.id },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      subject: true,
      lastMessageAt: true,
      hostReadAt: true,
      guest: { select: { username: true, image: true } },
      listing: { select: { title: true, photoUrls: true, code: true, sourceListingId: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
    },
  });

  const items: ConversationListItem[] = convos.map((c) => ({
    id: c.id,
    guestName: c.guest.username ?? "Guest",
    guestImage: c.guest.image ?? null,
    listingTitle: c.listing?.title ?? null,
    listingPhoto: c.listing?.photoUrls?.[0] ?? null,
    lastMessage: c.messages[0]?.body ?? "",
    lastMessageAt: c.lastMessageAt.toISOString(),
    unread: !c.hostReadAt || c.hostReadAt < c.lastMessageAt,
    subject: c.subject,
  }));

  // Localize the host-authored listing title for the viewer's display language
  // (cookie-derived). Message bodies/previews are private chat — kept verbatim.
  return (await localize(
    items as unknown as Array<Record<string, unknown>>,
    ["listingTitle"],
    await getDisplayLang(),
  )) as unknown as ConversationListItem[];
}

// ---------- detail (one thread) ----------
export async function getConversation(id: unknown): Promise<ConversationDetail | null> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return null;

  const session = await auth();
  if (!session?.user?.id) return null;
  const uid = session.user.id;

  const c = await db.conversation.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      hostId: true,
      guestId: true,
      subject: true,
      listingId: true,
      bookingId: true,
      guest: { select: { username: true, image: true } },
      listing: { select: { title: true, photoUrls: true, code: true, sourceListingId: true } },
      booking: {
        select: { checkIn: true, checkOut: true, guestCount: true, status: true, totalPrice: true },
      },
      messages: {
        // Newest 200, re-sorted ascending below — an unbounded thread would
        // reload its entire history on every visit.
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, body: true, senderId: true, createdAt: true },
      },
    },
  });
  if (!c) return null;

  // Only a party to the thread (or an admin) may read it.
  if (c.hostId !== uid && c.guestId !== uid && !canOverride(session, c.hostId)) return null;

  return {
    id: c.id,
    guestId: c.guestId,
    guestName: c.guest.username ?? "Guest",
    guestImage: c.guest.image ?? null,
    listingId: c.listingId,
    listingHref:
      c.listingId != null ? listingSegment({ ...c.listing, id: c.listingId }) : null,
    // Listing title is host-authored content — localize for the viewer.
    // Messages and subject stay verbatim (private user-to-user chat).
    listingTitle: c.listing?.title
      ? await getText(c.listing.title, await getDisplayLang())
      : null,
    listingPhoto: c.listing?.photoUrls?.[0] ?? null,
    bookingId: c.bookingId,
    subject: c.subject,
    booking: c.booking
      ? {
          checkIn: c.booking.checkIn.toISOString(),
          checkOut: c.booking.checkOut.toISOString(),
          guestCount: c.booking.guestCount,
          status: c.booking.status,
          totalPrice: c.booking.totalPrice,
        }
      : null,
    messages: c.messages
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        isHost: m.senderId === c.hostId,
        createdAt: m.createdAt.toISOString(),
      })),
  };
}

// ---------- send ----------
const sendSchema = z.object({
  conversationId: z.number().int().positive(),
  body: z.string().trim().min(1).max(5000),
});

export async function sendMessage(
  input: unknown,
): Promise<{ ok: true; message: ThreadMessage } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthenticated" };

  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Message can't be empty" };

  const uid = session.user.id;
  await assertRateLimit("mutation", `message:${uid}`);

  const convo = await db.conversation.findUnique({
    where: { id: parsed.data.conversationId },
    select: { id: true, hostId: true, guestId: true },
  });
  if (!convo) return { ok: false, error: "Conversation not found" };

  const isHost = convo.hostId === uid;
  const isGuest = convo.guestId === uid;
  if (!isHost && !isGuest && !canOverride(session, convo.hostId)) {
    return { ok: false, error: "Not your conversation" };
  }

  try {
    const now = new Date();
    const msg = await db.message.create({
      data: { conversationId: convo.id, senderId: uid, body: parsed.data.body },
    });
    // Bump the thread; mark the sender's side read (the other side goes unread).
    await db.conversation.update({
      where: { id: convo.id },
      data: { lastMessageAt: now, ...(isHost ? { hostReadAt: now } : { guestReadAt: now }) },
    });

    revalidatePath("/hosting/messages");
    return {
      ok: true,
      message: { id: msg.id, body: msg.body, senderId: uid, isHost, createdAt: msg.createdAt.toISOString() },
    };
  } catch (error) {
    logger.error("sendMessage failed", { error: String(error) });
    return { ok: false, error: "Could not send message" };
  }
}

// ---------- mark read ----------
export async function markConversationRead(id: unknown): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };

  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false };
  const uid = session.user.id;

  const convo = await db.conversation.findUnique({
    where: { id: parsed.data },
    select: { hostId: true, guestId: true },
  });
  if (!convo) return { ok: false };

  const now = new Date();
  if (convo.hostId === uid) {
    await db.conversation.update({ where: { id: parsed.data }, data: { hostReadAt: now } });
  } else if (convo.guestId === uid) {
    await db.conversation.update({ where: { id: parsed.data }, data: { guestReadAt: now } });
  } else {
    return { ok: false };
  }

  revalidatePath("/hosting/messages");
  return { ok: true };
}

// ---------- start a thread (guest → host) ----------
//
// Until this existed, `Conversation` rows could only be created by a seed
// script: `sendMessage` requires a `conversationId` and 403s without one, so a
// guest had no way to open a thread at all and the "Inquiries" stage of the
// marketplace funnel was structurally unreachable. Every other piece of the
// messaging system — the host inbox, the thread view, read receipts — was
// already built and waiting on this one action.

const createConversationSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1).max(5000),
});

export async function createConversation(
  input: unknown,
): Promise<{ ok: true; conversationId: number } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthenticated" };

  const parsed = createConversationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Message can't be empty" };

  const uid = session.user.id;
  await assertRateLimit("mutation", `inquiry:${uid}`);

  const listing = await db.listing.findFirst({
    where: { id: parsed.data.listingId, isPublished: true },
    select: { id: true, hostId: true, title: true },
  });
  if (!listing) return { ok: false, error: "Listing not found" };
  if (listing.hostId === uid) return { ok: false, error: "You can't message your own listing" };

  try {
    const now = new Date();

    // One open thread per (guest, listing) — a guest clicking "Message host"
    // twice should land back in the conversation they already started, not
    // fragment the host's inbox into duplicates. Booking-scoped threads
    // (bookingId set) are a separate concern and never reused here.
    const existing = await db.conversation.findFirst({
      where: { hostId: listing.hostId, guestId: uid, listingId: listing.id, bookingId: null },
      select: { id: true },
    });

    const conversationId =
      existing?.id ??
      (
        await db.conversation.create({
          data: {
            hostId: listing.hostId,
            guestId: uid,
            listingId: listing.id,
            subject: listing.title ?? null,
            lastMessageAt: now,
            guestReadAt: now,
          },
          select: { id: true },
        })
      ).id;

    await db.message.create({
      data: { conversationId, senderId: uid, body: parsed.data.body },
    });
    await db.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: now, guestReadAt: now },
    });

    // Funnel: this is an inquiry. Recorded server-side rather than from the
    // browser so it can't be lost to a navigation, and deduped per day by the
    // same rule as every other event.
    await trackListingEvent({
      listingId: listing.id,
      type: ListingEventType.CONTACT_MESSAGE,
      userId: uid,
    });

    revalidatePath("/hosting/messages");
    return { ok: true, conversationId };
  } catch (error) {
    logger.error("createConversation failed", { error: String(error), listingId: parsed.data.listingId });
    return { ok: false, error: "Could not send message" };
  }
}
