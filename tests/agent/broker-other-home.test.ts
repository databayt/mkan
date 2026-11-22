import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  db: {
    broker: { findUnique: vi.fn(), update: vi.fn() },
    listing: { findMany: vi.fn(), create: vi.fn(), count: vi.fn() },
    user: { upsert: vi.fn() },
    location: { create: vi.fn() },
    listingBroker: { create: vi.fn() },
    outboundMessage: { update: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/components/agent/demand", () => ({ matchRequest: vi.fn() }));

import { keepOtherHome } from "@/components/agent/broker-home";

beforeEach(() => {
  vi.clearAllMocks();
  h.db.broker.findUnique.mockResolvedValue({ id: "b1", name: "Eric", userId: "u1", phones: ["+250788111222"] });
  h.db.listing.findMany.mockResolvedValue([]);
  h.db.location.create.mockResolvedValue({ id: 5 });
  h.db.listing.create.mockResolvedValue({ id: 9001 });
});

describe("a broker's other home, offered in words", () => {
  it("becomes a draft, unpublished lead with a ListingBroker row", async () => {
    const r = await keepOtherHome("b1", { area: "Gikondo", bedrooms: 2, rent: 200_000, furnished: null, note: "taken but I have another one" });
    expect(r).toEqual({ ok: true, listingId: 9001, created: true });
    const data = h.db.listing.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ draft: true, isPublished: false, priceMonth: 200_000, bedrooms: 2, hostId: "u1", rentPeriod: "MONTHLY", title: "2-bedroom home in Gikondo" });
    expect(data.sourceListingId).toBe("broker-other:b1:1");
    expect(h.db.listingBroker.create).toHaveBeenCalledWith({ data: expect.objectContaining({ listingId: 9001, userId: "u1", brokerId: "b1" }) });
  });
  it("needs a rent and a place or a size; said twice it is one lead", async () => {
    expect(await keepOtherHome("b1", { area: "Gikondo", bedrooms: 2, rent: null, furnished: null })).toEqual({ ok: false, reason: "thin" });
    expect(await keepOtherHome("b1", { area: null, bedrooms: null, rent: 200_000, furnished: null })).toEqual({ ok: false, reason: "thin" });
    h.db.listing.findMany.mockResolvedValue([{ id: 77, priceMonth: 200_000, bedrooms: 2, location: { address: "Gikondo" } }]);
    expect(await keepOtherHome("b1", { area: "Gikondo", bedrooms: 2, rent: 200_000, furnished: null })).toEqual({ ok: true, listingId: 77, created: false });
    expect(h.db.listing.create).not.toHaveBeenCalled();
  });
});
