import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { loadTtHomes, TT_MAX_HOMES, ttListingArgs, ttPostArgs, windowStart, type TtDb } from "@/lib/tt/homes";

const NOW = Date.UTC(2026, 10, 7, 9, 0); // 2026-11-07 09:00 UTC = 11:00 Kigali
const listing = (id: number, o: Record<string, unknown> = {}) => ({
  id, title: `Home ${id}`, photoUrls: [`https://cdn/${id}.jpg`], priceMonth: 300_000, currency: "RWF", bedrooms: 2, lostAt: null,
  location: { state: "KICUKIRO", sector: null, neighbourhood: null }, ...o,
});
const post = (id: number, hoursAgo: number) => ({ listingId: id, postedAt: new Date(NOW - hoursAgo * 3_600_000) });

/** Posts as the post query returns them; homes as the listing query returns them (it already applied its `where`). */
const fake = (posts: ReturnType<typeof post>[], homes: ReturnType<typeof listing>[]) => {
  const calls = { posts: [] as ReturnType<typeof ttPostArgs>[], homes: [] as ReturnType<typeof ttListingArgs>[] };
  const db: TtDb = {
    tikTokPost: { findMany: async (a) => (calls.posts.push(a), posts) },
    listing: { findMany: async (a) => (calls.homes.push(a), homes.filter((h) => a.where.id.in.includes(h.id))) },
  };
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

describe("the queries name only fields the models have (2026-11-08: a `listing` relation TikTokPost does not declare)", () => {
  const filterWords = new Set(["AND", "OR", "NOT"]);
  it("the post query reads and filters TikTokPost's own columns", () => {
    const fields = new Set(Object.keys(Prisma.TikTokPostScalarFieldEnum));
    const a = ttPostArgs(NOW);
    for (const k of [...Object.keys(a.where), ...Object.keys(a.select), ...Object.keys(a.orderBy)]) {
      expect(fields.has(k) || filterWords.has(k), `TikTokPost.${k}`).toBe(true);
    }
  });
  it("the listing query filters Listing's own columns", () => {
    const fields = new Set(Object.keys(Prisma.ListingScalarFieldEnum));
    for (const k of Object.keys(ttListingArgs([1]).where)) expect(fields.has(k), `Listing.${k}`).toBe(true);
  });
});

describe("loadTtHomes", () => {
  it("asks for POSTED posts in the window, then their homes still on the market", async () => {
    const { db, calls } = fake([post(5, 1)], [listing(5)]);
    await loadTtHomes(db, NOW);
    const w = calls.posts[0].where;
    expect(w.status).toBe("POSTED");
    expect(w.postedAt.gte.toISOString()).toBe("2026-11-03T22:00:00.000Z");
    expect(calls.posts[0].orderBy).toEqual({ postedAt: "desc" });
    expect(calls.homes[0].where).toMatchObject({ id: { in: [5] }, lostAt: null, rentPeriod: "MONTHLY", priceMonth: { not: null } });
  });
  it("no posts: no second query", async () => {
    const { db, calls } = fake([], []);
    expect(await loadTtHomes(db, NOW)).toEqual([]);
    expect(calls.homes).toHaveLength(0);
  });
  it("one card per home (the newest post), with its code, photo and price", async () => {
    const { db, calls } = fake([post(5, 1), post(6, 2), post(5, 30)], [listing(5), listing(6)]);
    const homes = await loadTtHomes(db, NOW);
    expect(homes.map((h) => h.ref)).toEqual(["K5", "K6"]);
    expect(homes[0]).toMatchObject({ photo: "https://cdn/5.jpg", priceMonth: 300_000, currency: "RWF" });
    expect(homes[0].place.en).toBeTruthy();
    expect(calls.homes[0].where.id.in).toEqual([5, 6]);
  });
  it("skips a post whose home the listing query did not return (taken, nightly, no price)", async () => {
    const { db } = fake([post(8, 1), post(9, 2)], [listing(9)]);
    expect((await loadTtHomes(db, NOW)).map((h) => h.id)).toEqual([9]);
  });
  it("drops a taken home, one with no photo, and one with no price", async () => {
    const { db } = fake(
      [post(1, 1), post(2, 1), post(3, 1), post(4, 1)],
      [listing(1, { lostAt: new Date(NOW) }), listing(2, { photoUrls: [] }), listing(3, { priceMonth: null }), listing(4)],
    );
    expect((await loadTtHomes(db, NOW)).map((h) => h.id)).toEqual([4]);
  });
  it("keeps the listing's own currency", async () => {
    const { db } = fake([post(7, 1)], [listing(7, { currency: "USD" })]);
    expect((await loadTtHomes(db, NOW))[0].currency).toBe("USD");
  });
  it("caps the page", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => 100 + i);
    const { db } = fake(ids.map((id) => post(id, 1)), ids.map((id) => listing(id)));
    expect(await loadTtHomes(db, NOW)).toHaveLength(TT_MAX_HOMES);
  });
});
