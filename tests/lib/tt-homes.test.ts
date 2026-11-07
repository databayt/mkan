import { describe, expect, it } from "vitest";

import { loadTtHomes, TT_MAX_HOMES, windowStart, type TtDb } from "@/lib/tt/homes";

const NOW = Date.UTC(2026, 10, 7, 9, 0); // 2026-11-07 09:00 UTC = 11:00 Kigali
const listing = (id: number, o: Record<string, unknown> = {}) => ({
  id, title: `Home ${id}`, photoUrls: [`https://cdn/${id}.jpg`], priceMonth: 300_000, currency: "RWF", bedrooms: 2, lostAt: null,
  location: { state: "KICUKIRO", sector: null, neighbourhood: null }, ...o,
});
const row = (id: number, hoursAgo: number, o: Record<string, unknown> = {}) => ({
  listingId: id, postedAt: new Date(NOW - hoursAgo * 3_600_000), listing: listing(id, o),
});
const fake = (rows: unknown[]) => {
  const calls: any[] = [];
  const db: TtDb = { tikTokPost: { findMany: async (a) => (calls.push(a), rows) } };
  return { db, calls };
};

describe("windowStart — today and the 3 days before, Kigali time", () => {
  it("is Kigali midnight three days back", () => {
    expect(windowStart(NOW).toISOString()).toBe("2026-11-03T22:00:00.000Z"); // 11-04 00:00 in Kigali
  });
  it("just after Kigali midnight still belongs to the new day", () => {
    expect(windowStart(Date.UTC(2026, 10, 6, 22, 30)).toISOString()).toBe("2026-11-03T22:00:00.000Z");
  });
});

describe("loadTtHomes", () => {
  it("asks only for POSTED posts in the window of homes still available", async () => {
    const { db, calls } = fake([]);
    await loadTtHomes(db, NOW);
    const w = calls[0].where;
    expect(w.status).toBe("POSTED");
    expect(w.postedAt.gte.toISOString()).toBe("2026-11-03T22:00:00.000Z");
    expect(w.listing).toMatchObject({ lostAt: null });
    expect(calls[0].orderBy).toEqual({ postedAt: "desc" });
  });
  it("one card per home (the newest post), with its code, photo and price", async () => {
    const { db } = fake([row(5, 1), row(6, 2), row(5, 30)]);
    const homes = await loadTtHomes(db, NOW);
    expect(homes.map((h) => h.ref)).toEqual(["K5", "K6"]);
    expect(homes[0]).toMatchObject({ photo: "https://cdn/5.jpg", priceMonth: 300_000, currency: "RWF" });
    expect(homes[0].place.en).toBeTruthy();
  });
  it("drops a taken home, one with no photo, and one with no price", async () => {
    const { db } = fake([row(1, 1, { lostAt: new Date(NOW) }), row(2, 1, { photoUrls: [] }), row(3, 1, { priceMonth: null }), row(4, 1)]);
    expect((await loadTtHomes(db, NOW)).map((h) => h.id)).toEqual([4]);
  });
  it("keeps the listing's own currency", async () => {
    const { db } = fake([row(7, 1, { currency: "USD" })]);
    expect((await loadTtHomes(db, NOW))[0].currency).toBe("USD");
  });
  it("caps the page", async () => {
    const { db } = fake(Array.from({ length: 60 }, (_, i) => row(100 + i, 1)));
    expect(await loadTtHomes(db, NOW)).toHaveLength(TT_MAX_HOMES);
  });
});
