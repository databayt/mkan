import { describe, expect, it } from "vitest";

import { attribute, shapeFirstShare, type ChatRow, type PostRow } from "@/lib/monetize/first-share-shape";

const d = (s: string) => new Date(`2026-11-${s}T00:00:00Z`);
const post = (o: Partial<PostRow> & { id: string; listingId: number }): PostRow => ({
  ref: `K${o.listingId}`, brokerHandle: "broker", status: "POSTED", reason: null, pickedAt: d("03"), cleanAt: d("03"), postedAt: d("03"),
  tiktokUrl: null, views: 100, likes: 3, ...o,
});
const chat = (o: Partial<ChatRow> & { id: string }): ChatRow => ({
  profileId: o.id, refListingId: 1, createdAt: d("04"), failed: false, shortlisted: true, asked: false, answered: false, ...o,
});

describe("attribute — last touch", () => {
  it("takes the latest post of the listing at or before the chat", () => {
    const a = post({ id: "a", listingId: 1, postedAt: d("01") });
    const b = post({ id: "b", listingId: 1, postedAt: d("03") });
    const c = post({ id: "c", listingId: 1, postedAt: d("05") });
    expect(attribute({ refListingId: 1, createdAt: d("04") }, [a, b, c])?.id).toBe("b");
  });
  it("no code, or a home never posted before the chat: none", () => {
    expect(attribute({ refListingId: null, createdAt: d("04") }, [post({ id: "a", listingId: 1 })])).toBeNull();
    expect(attribute({ refListingId: 2, createdAt: d("04") }, [post({ id: "a", listingId: 1 })])).toBeNull();
  });
});

describe("shapeFirstShare", () => {
  const since = d("01");
  const posts = [
    post({ id: "p1", listingId: 1 }),
    post({ id: "p2", listingId: 2, status: "REJECTED", reason: "text left", cleanAt: null, postedAt: null }),
    post({ id: "p3", listingId: 3, status: "CLEAN", postedAt: null }),
  ];
  const view = shapeFirstShare({
    days: 7,
    since,
    posts,
    postedForAttribution: posts.filter((p) => p.status === "POSTED"),
    chats: [
      chat({ id: "t1", profileId: "u1", asked: true, answered: true }),
      chat({ id: "t2", profileId: "u1" }),
      chat({ id: "t3", profileId: "u2", refListingId: 9 }),
    ],
    firstContacts: ["u1", "u3"],
    deals: [{ taskId: "t1", status: "PAID", mkanShare: 50_000 }],
  });

  it("counts the funnel from featured to Mkan's share", () => {
    expect(view).toMatchObject({ featured: 3, clean: 2, rejected: 1, posted: 1, views: 100, chats: 3, contacts: 3, asked: 1, answered: 1, viewings: 1, signed: 1, paid: 1, paidShareRwf: 50_000, unattributedChats: 1 });
    expect(view.rejectReasons).toEqual([{ reason: "text left", count: 1 }]);
  });
  it("puts each chat and deal on its post's row", () => {
    const p1 = view.posts.find((p) => p.id === "p1")!;
    expect(p1).toMatchObject({ chats: 2, contacts: 1, signed: 1, paidShareRwf: 50_000 });
    expect(view.posts.find((p) => p.id === "p3")!.chats).toBe(0);
  });
});
