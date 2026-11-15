import { describe, expect, it } from "vitest";
import { dayBefore, dayStart, inArchive, isDay, kigaliDay, latestDay, todayPosts, type TodayDb } from "@/lib/tt/homes";

const NOW = Date.UTC(2026, 10, 15, 9, 0); // 11:00 Kigali, 2026-11-15
const listing = (id: number, o: Record<string, unknown> = {}) => ({
  id, title: `Home ${id}`, photoUrls: [`https://cdn/${id}.jpg`], priceMonth: 300_000, currency: "RWF", bedrooms: 2, lostAt: null,
  videoUrl: `https://cdn/${id}.mp4`, videoPosterUrl: `https://cdn/${id}.jpg`, location: { state: "KICUKIRO", sector: null, neighbourhood: null }, ...o,
});
const post = (id: number, iso: string) => ({ listingId: id, postedAt: new Date(iso) });
const fake = (posts: ReturnType<typeof post>[], homes: ReturnType<typeof listing>[]): TodayDb => ({
  tikTokPost: { findMany: async () => posts },
  listing: { findMany: async (a) => homes.filter((h) => a.where.id.in.includes(h.id)) },
});

describe("Kigali days", () => {
  it("11:00 Kigali and 23:30 UTC (01:30 next day) fall on the right day", () => {
    expect(kigaliDay(NOW)).toBe("2026-11-15");
    expect(kigaliDay(Date.UTC(2026, 10, 14, 23, 30))).toBe("2026-11-15");
  });
  it("a day starts at Kigali midnight", () => expect(dayStart("2026-11-15").toISOString()).toBe("2026-11-14T22:00:00.000Z"));
  it("archive: today and 6 days back, real dates only", () => {
    expect(inArchive("2026-11-15", NOW)).toBe(true);
    expect(inArchive("2026-11-09", NOW)).toBe(true);
    expect(inArchive("2026-11-08", NOW)).toBe(false);
    expect(inArchive("2026-11-16", NOW)).toBe(false);
    expect(isDay("2026-02-30")).toBe(false);
    expect(dayBefore("2026-11-01")).toBe("2026-10-31");
  });
});

describe("todayPosts / latestDay", () => {
  it("post order, once per home, taken homes dropped", async () => {
    const db = fake(
      [post(2, "2026-11-15T05:00:00Z"), post(1, "2026-11-15T06:00:00Z"), post(2, "2026-11-15T07:00:00Z"), post(3, "2026-11-15T08:00:00Z")],
      [listing(1), listing(2), listing(3, { lostAt: new Date() })],
    );
    expect((await todayPosts(db, "2026-11-15")).map((h) => h.id)).toEqual([2, 1]);
  });
  it("carries the poster and video", async () => {
    const [h] = await todayPosts(fake([post(1, "2026-11-15T05:00:00Z")], [listing(1)]), "2026-11-15");
    expect(h).toMatchObject({ ref: "K1", videoPosterUrl: "https://cdn/1.jpg", videoUrl: "https://cdn/1.mp4" });
  });
  it("today's homes when there are any; else the latest earlier day, flagged", async () => {
    const posts = [post(1, "2026-11-13T07:00:00Z"), post(2, "2026-11-14T07:00:00Z"), post(3, "2026-11-14T09:00:00Z")];
    const homes = [listing(1), listing(2), listing(3)];
    const earlier = await latestDay(fake(posts, homes), NOW);
    expect(earlier).toMatchObject({ day: "2026-11-14", isToday: false });
    expect(earlier!.homes.map((h) => h.id)).toEqual([2, 3]);
    const today = await latestDay(fake([...posts, post(1, "2026-11-15T06:00:00Z")], homes), NOW);
    expect(today).toMatchObject({ day: "2026-11-15", isToday: true });
  });
  it("a day whose homes are all taken falls back to the day before", async () => {
    const d = await latestDay(fake([post(1, "2026-11-14T07:00:00Z"), post(2, "2026-11-15T07:00:00Z")], [listing(1), listing(2, { lostAt: new Date() })]), NOW);
    expect(d).toMatchObject({ day: "2026-11-14" });
  });
  it("nothing posted: null", async () => expect(await latestDay(fake([], []), NOW)).toBeNull());
});
