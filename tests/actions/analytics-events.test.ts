import { describe, it, expect, vi, beforeEach } from "vitest";

// Enum + error-class mirrors: hoisted vi.mock factories run before imports, so
// they cannot pull anything from @prisma/client. vi.hoisted lifts the class
// definition above the factories too — a plain `class` declaration here is
// hoisted but left uninitialised, and the factory hits its temporal dead zone.
const { MockKnownRequestError } = vi.hoisted(() => {
  class MockKnownRequestError extends Error {
    code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return { MockKnownRequestError };
});

vi.mock("@prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: MockKnownRequestError },
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
    listingEvent: { upsert: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/rate-limit", () => ({ getClientId: vi.fn(async () => "41.223.10.5") }));

const headersGet = vi.fn();
vi.mock("next/headers", () => ({ headers: async () => ({ get: headersGet }) }));

import { db } from "@/lib/db";
import { recordListingEvent, trackListingEvent } from "@/lib/analytics/events";

const mockDb = db as unknown as {
  listing: { findFirst: ReturnType<typeof vi.fn> };
  listingEvent: { upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
};

const NOW = new Date("2026-08-14T12:30:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ANALYTICS_SALT_SECRET = "test-secret";
  mockDb.listing.findFirst.mockResolvedValue({
    id: 7,
    location: { city: "Khartoum" },
  });
  mockDb.listingEvent.upsert.mockResolvedValue({ id: 1 });
});

describe("recordListingEvent", () => {
  it("upserts on (listing, type, day, visitor) so a refresh increments instead of duplicating", async () => {
    const result = await recordListingEvent({
      listingId: 7,
      type: "VIEW" as never,
      visitorHash: "abc",
      now: NOW,
    });

    expect(result).toEqual({ recorded: true, created: true });

    const arg = mockDb.listingEvent.upsert.mock.calls[0][0];
    expect(arg.where.listingId_type_day_visitorHash).toEqual({
      listingId: 7,
      type: "VIEW",
      day: new Date("2026-08-14T00:00:00.000Z"),
      visitorHash: "abc",
    });
    // The update branch is what makes a refresh cheap and non-duplicating.
    expect(arg.update.hits).toEqual({ increment: 1 });
    expect(arg.update.lastAt).toEqual(NOW);
  });

  it("denormalises the city so zone rollups never join through Location", async () => {
    await recordListingEvent({ listingId: 7, type: "VIEW" as never, visitorHash: "abc", now: NOW });
    expect(mockDb.listingEvent.upsert.mock.calls[0][0].create.cityKey).toBe("Khartoum");
  });

  it("refuses to record for a listing that is not live", async () => {
    mockDb.listing.findFirst.mockResolvedValue(null);

    const result = await recordListingEvent({
      listingId: 999,
      type: "VIEW" as never,
      visitorHash: "abc",
      now: NOW,
    });

    expect(result).toEqual({ recorded: false, reason: "unknown-listing" });
    expect(mockDb.listingEvent.upsert).not.toHaveBeenCalled();
  });

  it("recovers from the concurrent-first-event race instead of dropping the event", async () => {
    // Two requests for the same new visitor both miss the row and race to
    // insert; the loser gets a unique violation. The event is real.
    mockDb.listingEvent.upsert.mockRejectedValue(new MockKnownRequestError("P2002"));
    mockDb.listingEvent.update.mockResolvedValue({ id: 1 });

    const result = await recordListingEvent({
      listingId: 7,
      type: "VIEW" as never,
      visitorHash: "abc",
      now: NOW,
    });

    expect(result).toEqual({ recorded: true, created: false });
    expect(mockDb.listingEvent.update).toHaveBeenCalledTimes(1);
    expect(mockDb.listingEvent.update.mock.calls[0][0].data.hits).toEqual({ increment: 1 });
  });

  it("never throws — analytics must not be able to break a listing page", async () => {
    mockDb.listing.findFirst.mockRejectedValue(new Error("db is down"));

    await expect(
      recordListingEvent({ listingId: 7, type: "VIEW" as never, visitorHash: "abc", now: NOW }),
    ).resolves.toEqual({ recorded: false, reason: "error" });
  });

  it("claims an anonymous row when the visitor signs in mid-session", async () => {
    await recordListingEvent({
      listingId: 7,
      type: "VIEW" as never,
      visitorHash: "abc",
      userId: "user-1",
      now: NOW,
    });
    expect(mockDb.listingEvent.upsert.mock.calls[0][0].update.userId).toBe("user-1");
  });
});

describe("trackListingEvent", () => {
  it("drops anonymous crawler traffic", async () => {
    headersGet.mockReturnValue("Mozilla/5.0 (compatible; Googlebot/2.1)");

    const result = await trackListingEvent({ listingId: 7, type: "VIEW" as never });

    expect(result).toEqual({ recorded: false, reason: "bot" });
    expect(mockDb.listingEvent.upsert).not.toHaveBeenCalled();
  });

  it("keeps a signed-in user's deliberate action whatever their user agent claims", async () => {
    headersGet.mockReturnValue("curl/8.4.0");

    const result = await trackListingEvent({
      listingId: 7,
      type: "CONTACT_MESSAGE" as never,
      userId: "user-1",
    });

    expect(result).toEqual({ recorded: true, created: true });
    expect(mockDb.listingEvent.upsert).toHaveBeenCalledTimes(1);
  });
});
