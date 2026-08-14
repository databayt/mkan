import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@prisma/client", () => ({
  ListingEventType: {
    VIEW: "VIEW",
    CONTACT_PHONE_REVEAL: "CONTACT_PHONE_REVEAL",
    CONTACT_PHONE_CLICK: "CONTACT_PHONE_CLICK",
    CONTACT_MESSAGE: "CONTACT_MESSAGE",
    CONTACT_APPLICATION: "CONTACT_APPLICATION",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    listing: { findFirst: vi.fn() },
    conversation: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  canOverride: () => false,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...a: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({ assertRateLimit: vi.fn() }));
vi.mock("@/components/translation/localize", () => ({ localize: (x: unknown) => x, getText: (x: unknown) => x }));
vi.mock("@/components/translation/locale", () => ({ getDisplayLang: async () => "en" }));

// vi.hoisted lifts the spy above the mock factories; a plain const would be in
// its temporal dead zone when the hoisted factory runs.
const { trackListingEvent } = vi.hoisted(() => ({
  trackListingEvent: vi.fn(async () => ({ recorded: true, created: true })),
}));
vi.mock("@/lib/analytics/events", () => ({ trackListingEvent }));

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { createConversation } from "@/lib/actions/message-actions";

const mockDb = db as unknown as {
  listing: { findFirst: ReturnType<typeof vi.fn> };
  conversation: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  message: { create: ReturnType<typeof vi.fn> };
};
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "guest-1", role: "USER" } });
  mockDb.listing.findFirst.mockResolvedValue({ id: 7, hostId: "host-1", title: "Nile view flat" });
  mockDb.conversation.findFirst.mockResolvedValue(null);
  mockDb.conversation.create.mockResolvedValue({ id: 42 });
  mockDb.message.create.mockResolvedValue({ id: 1 });
});

describe("createConversation", () => {
  it("opens a thread and posts the first message", async () => {
    const result = await createConversation({ listingId: 7, body: "Is it free in September?" });

    expect(result).toEqual({ ok: true, conversationId: 42 });
    expect(mockDb.conversation.create).toHaveBeenCalledTimes(1);
    const created = mockDb.conversation.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ hostId: "host-1", guestId: "guest-1", listingId: 7 });
    expect(mockDb.message.create.mock.calls[0][0].data).toMatchObject({
      conversationId: 42,
      senderId: "guest-1",
      body: "Is it free in September?",
    });
  });

  it("reuses the existing thread so a second click doesn't fragment the host inbox", async () => {
    mockDb.conversation.findFirst.mockResolvedValue({ id: 99 });

    const result = await createConversation({ listingId: 7, body: "Following up" });

    expect(result).toEqual({ ok: true, conversationId: 99 });
    expect(mockDb.conversation.create).not.toHaveBeenCalled();
    expect(mockDb.message.create.mock.calls[0][0].data.conversationId).toBe(99);
  });

  it("only reuses listing threads, never a booking-scoped one", async () => {
    await createConversation({ listingId: 7, body: "Hello" });
    expect(mockDb.conversation.findFirst.mock.calls[0][0].where).toMatchObject({
      hostId: "host-1",
      guestId: "guest-1",
      listingId: 7,
      bookingId: null,
    });
  });

  it("records the inquiry in the funnel", async () => {
    await createConversation({ listingId: 7, body: "Hello" });
    expect(trackListingEvent).toHaveBeenCalledWith({
      listingId: 7,
      type: "CONTACT_MESSAGE",
      userId: "guest-1",
    });
  });

  it("requires a session", async () => {
    mockAuth.mockResolvedValue(null);
    expect(await createConversation({ listingId: 7, body: "Hi" })).toEqual({
      ok: false,
      error: "Unauthenticated",
    });
  });

  it("refuses an empty message", async () => {
    expect(await createConversation({ listingId: 7, body: "   " })).toEqual({
      ok: false,
      error: "Message can't be empty",
    });
    expect(mockDb.conversation.create).not.toHaveBeenCalled();
  });

  it("refuses a listing that is not live", async () => {
    mockDb.listing.findFirst.mockResolvedValue(null);
    expect(await createConversation({ listingId: 999, body: "Hi" })).toEqual({
      ok: false,
      error: "Listing not found",
    });
  });

  it("stops a host messaging their own listing", async () => {
    mockAuth.mockResolvedValue({ user: { id: "host-1", role: "MANAGER" } });
    expect(await createConversation({ listingId: 7, body: "Hi" })).toEqual({
      ok: false,
      error: "You can't message your own listing",
    });
    expect(mockDb.conversation.create).not.toHaveBeenCalled();
  });
});
