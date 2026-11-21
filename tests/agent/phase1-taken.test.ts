/**
 * Phase 1, item 5 — "taken" is never a dead end (chat-funnel.md, stage 6). Every November pick died within
 * minutes and the tenant got "is taken, sorry. Your other homes are here: <link>"; broker …180 answered
 * "taken, but I have another one in Gikondo, 2 bedrooms 200k" and the line said "Okay, thank you".
 */
import { describe, expect, it } from "vitest";
import { readTakenWithOther, parseBrokerReply } from "@/components/agent/broker-reply";
import { takenNextMessage, takenOtherAckMessage, takenAckMessage, brokerAnswerMessage } from "@/components/agent/broker-message";
import { homeLines, nextBestAfterTaken, reorderAfterTaken } from "@/components/agent/whatsapp-format";
import type { ShortlistItem } from "@/components/agent/types";

const home = (id: number, over: Partial<ShortlistItem> = {}): ShortlistItem => ({
  id,
  path: `/en/k/K${id}`,
  title: `Room ${id}`,
  photo: null,
  district: "KICUKIRO",
  zone: "kicukiro/gikondo",
  bedrooms: 1,
  bathrooms: 1,
  rating: null,
  reviews: null,
  currency: "RWF",
  rentPeriod: "MONTHLY",
  score: 1,
  reasons: [],
  cost: { headline: 130_000, period: "month", lines: [], total: 0, totalHigh: 0 },
  duplicates: 0,
  availability: "unconfirmed",
  ...over,
});

describe("a broker who says taken and offers another home", () => {
  it("is read as taken, and the other home is kept (…180)", () => {
    const r = readTakenWithOther("Taken, but I have another one in Gikondo, 2 bedrooms 200k, and a 1-bed in Kagarama 200k");
    expect(r.taken).toBe(true);
    expect(r.other).toMatchObject({ place: "Gikondo", bedrooms: 2, price: 200_000 });
    expect(r.other?.text).toContain("another one in Gikondo");
  });
  it("in Kinyarwanda and with 'we have'", () => {
    expect(readTakenWithOther("yafashwe ariko dufite indi nzu i Kicukiro 150k").other).toMatchObject({ price: 150_000 });
    expect(readTakenWithOther("Already taken. We have one more in Kimironko 2 bedrooms 300k").other).toMatchObject({ bedrooms: 2, price: 300_000 });
  });
  it("a plain taken offers nothing; a yes is not taken; an offer with no home named is not a lead", () => {
    expect(readTakenWithOther("taken")).toEqual({ taken: true, other: null });
    expect(readTakenWithOther("It's still available")).toEqual({ taken: false, other: null });
    expect(readTakenWithOther("taken but I have another one").other).toBeNull();
  });
  it("parseBrokerReply alone reads that reply as no answer at all — why it was dropped", () => {
    const p = parseBrokerReply("Taken, but I have another one in Gikondo, 2 bedrooms 200k");
    expect(p.gone).toBe(false);
    expect(p.yes).toBe(false);
  });
  it("is answered by asking for the link or photos and the rent, never 'Okay, thank you'", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const t = takenOtherAckMessage(seed);
      expect(t).toMatch(/link|photos/i);
      expect(t).toMatch(/price|rent/i);
      expect(t).not.toBe(takenAckMessage(seed));
    }
  });
});

describe("the tenant hears the next best homes at once", () => {
  const shortlist = [home(1, { availability: "asked" }), home(2), home(3, { availability: "confirmed" }), home(4), home(5, { availability: "rented" })];

  it("the taken home goes last and marked, confirmed homes first", () => {
    expect(reorderAfterTaken(shortlist, 1).map((s) => [s.id, s.availability])).toEqual([
      [3, "confirmed"],
      [2, "unconfirmed"],
      [4, "unconfirmed"],
      [1, "rented"],
      [5, "rented"],
    ]);
  });
  it("offers at most two, never a taken one", () => {
    expect(nextBestAfterTaken(shortlist, 1).map((s) => s.id)).toEqual([3, 2]);
    expect(nextBestAfterTaken([home(1)], 1)).toEqual([]);
  });
  it("the message names the next homes with links and how to pick, not 'your other homes are here'", () => {
    const next = nextBestAfterTaken(shortlist, 1);
    const lines = homeLines(next, "en", "https://mkan.sd").join("\n\n");
    const msg = takenNextMessage("en", "Room 1", lines, next.length);
    expect(msg).toContain('"Room 1" is taken, sorry. Next best for you:');
    expect(msg).toContain("*1. Room 3*");
    expect(msg).toContain("https://mkan.sd/en/k/K3");
    expect(msg).toContain("*2. Room 2*");
    expect(msg).toMatch(/Reply with a number and I'll check it's still free/);
    expect(msg).not.toMatch(/other homes are here/);
  });
  it("one next home asks for '1'; Arabic and Kinyarwanda follow", () => {
    expect(takenNextMessage("en", "Room 1", "*1. Room 2*", 1)).toMatch(/Reply 1 and/);
    expect(takenNextMessage("ar", "غرفة", "*1. x*", 2)).toContain("مؤجَّر للأسف");
    expect(takenNextMessage("rw", "Icyumba", "*1. x*", 2)).toContain("yamaze gufatwa");
  });
  it("the old dead-end line is what remains only when nothing else is left", () => {
    expect(brokerAnswerMessage("en", "Room 1", false, "https://x")).toMatch(/Your other homes are here/);
  });
});
