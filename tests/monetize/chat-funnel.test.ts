import { describe, expect, it } from "vitest";

import { chatFacts, funnelLines, funnelTable, furthest, median, rentBand, splitBy, stopCounts, stopOf, wilson, worstStop, type ChatFacts, type DealFacts, type TaskRow } from "@/lib/monetize/chat-funnel-pure";

const NOW = new Date("2026-11-14T12:00:00Z");
const h = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

const chat = (id: string, at: ChatFacts["at"], extra: Partial<ChatFacts> = {}): ChatFacts => ({ id, channel: "wa", source: "tiktok", lang: "en", rent: 400_000, at: { chat: h(100), ...at }, lastTenantAt: h(100), ...extra });

describe("the chat funnel", () => {
  it("counts a chat at every stage up to the furthest it reached", () => {
    const rows = funnelTable([chat("a", {}), chat("b", { homes: h(99) }), chat("c", { homes: h(99), pick: h(98), asked: h(98), yes: h(90) }), chat("d", { booked: h(10) })]);
    const n = Object.fromEntries(rows.map((r) => [r.stage, r.n]));
    // d has only a booking stamp: a booked chat still counts as having seen homes and picked.
    expect(n).toMatchObject({ chat: 4, homes: 3, pick: 2, asked: 2, yes: 2, time: 1, booked: 1, viewed: 0, paid: 0 });
    expect(rows.find((r) => r.stage === "homes")!.rate).toBeCloseTo(0.75);
    expect(rows.find((r) => r.stage === "viewed")!.rate).toBe(0);
    // Nothing reached "viewed", so "signed" has no rate to speak of.
    expect(rows.find((r) => r.stage === "signed")!.rate).toBeNull();
  });

  it("gives the median wait from the stage before", () => {
    const rows = funnelTable([chat("a", { homes: h(99), pick: h(97) }), chat("b", { homes: h(99), pick: h(95) }), chat("c", { homes: h(99), pick: h(98) })]);
    expect(rows.find((r) => r.stage === "pick")!.medianMs).toBe(2 * 3_600_000);
  });

  it("keeps the interval wide on small counts", () => {
    const one = wilson(1, 3);
    expect(one.lo).toBeGreaterThan(0.05);
    expect(one.hi).toBeLessThan(0.8);
    expect(one.hi - one.lo).toBeGreaterThan(0.5);
    const many = wilson(100, 300);
    expect(many.hi - many.lo).toBeLessThan(0.12);
    expect(wilson(0, 0)).toEqual({ lo: 0, hi: 1 });
    expect(wilson(0, 10).lo).toBe(0);
    expect(wilson(10, 10).hi).toBe(1);
  });

  it("names where a chat stopped and who it waits on", () => {
    expect(stopOf(chat("a", {}), NOW)).toMatchObject({ cause: "no-homes", owner: "line" });
    expect(stopOf(chat("b", { homes: h(50) }), NOW)).toMatchObject({ cause: "no-pick", owner: "tenant" });
    // The 12 Nov chat: a pick and no ask a day and a half later is the line's.
    expect(stopOf(chat("c", { homes: h(40), pick: h(38) }), NOW)).toMatchObject({ cause: "not-asked", owner: "line", stage: "pick" });
    // Minutes after the pick the ask may still be queued.
    expect(stopOf(chat("c2", { homes: h(1), pick: h(0.2) }), NOW)).toMatchObject({ cause: "waiting-broker" });
    expect(stopOf(chat("d", { pick: h(40), asked: h(40) }), NOW)).toMatchObject({ cause: "broker-silent", owner: "broker" });
    expect(stopOf(chat("e", { pick: h(5), asked: h(5) }), NOW)).toMatchObject({ cause: "waiting-broker" });
    expect(stopOf(chat("f", { pick: h(40), asked: h(40) }, { taken: true }), NOW)).toMatchObject({ cause: "home-taken" });
    expect(stopOf(chat("g", { yes: h(30) }), NOW)).toMatchObject({ cause: "no-time", owner: "tenant" });
    expect(stopOf(chat("i", { yes: h(60), time: h(48) }), NOW)).toMatchObject({ cause: "not-booked", owner: "line" });
    expect(stopOf(chat("j", { booked: h(20) }, { viewingAt: new Date(NOW.getTime() + 86_400_000) }), NOW)).toMatchObject({ cause: "viewing-ahead", owner: "none" });
    expect(stopOf(chat("k", { booked: h(72) }, { viewingAt: h(24) }), NOW)).toMatchObject({ cause: "viewing-unrecorded", owner: "mkan" });
    expect(stopOf(chat("l", { viewed: h(72) }), NOW)).toMatchObject({ cause: "after-viewing" });
    expect(stopOf(chat("m", { signed: h(72) }), NOW)).toMatchObject({ cause: "share-unpaid", owner: "broker" });
    expect(stopOf(chat("n", { paid: h(1) }), NOW)).toBeNull();
    expect(stopOf(chat("o", { booked: h(72) }, { lost: { at: h(10), reason: "took another home" } }), NOW)).toMatchObject({ cause: "lost", reason: "took another home", stage: "booked" });
  });

  it("works on the line's own stops before the biggest one", () => {
    const stops = [chat("a", { homes: h(50) }), chat("b", { homes: h(50) }), chat("c", { homes: h(50) }), chat("d", { homes: h(40), pick: h(38) })].map((c) => stopOf(c, NOW)!);
    const counts = stopCounts(stops);
    expect(counts[0]).toMatchObject({ cause: "no-pick", n: 3 });
    expect(worstStop(counts)).toMatchObject({ cause: "not-asked", n: 1 });
    // With no chat the line dropped, the biggest stop is the one.
    expect(worstStop(stopCounts(stops.slice(0, 3)))).toMatchObject({ cause: "no-pick" });
    // Chats still moving are nothing to work on.
    expect(worstStop(stopCounts([stopOf(chat("e", { pick: h(5), asked: h(5) }), NOW)!]))).toBeNull();
  });

  it("splits the road by source, language and rent", () => {
    const chats = [chat("a", { homes: h(9) }), chat("b", { homes: h(9), pick: h(8) }, { source: "k_page", lang: "rw", rent: 150_000 }), chat("c", {}, { source: "k_page", rent: null })];
    expect(splitBy(chats, (c) => c.source)).toEqual([
      { key: "k_page", chats: 2, homes: 1, pick: 1, yes: 0, booked: 0, paid: 0 },
      { key: "tiktok", chats: 1, homes: 1, pick: 0, yes: 0, booked: 0, paid: 0 },
    ]);
    expect(rentBand(150_000)).toBe("under 200k");
    expect(rentBand(200_000)).toBe("200k–500k");
    expect(rentBand(700_000)).toBe("500k–1M");
    expect(rentBand(2_000_000)).toBe("over 1M");
    expect(rentBand(null)).toBe("unknown");
    expect(median([])).toBeNull();
    expect(median([3, 1])).toBe(2);
  });

  it("prints no id, phone or word of a chat", () => {
    const text = funnelLines([chat("task_secret_1", { homes: h(40), pick: h(38) }), chat("task_secret_2", { homes: h(50) })], NOW, 30).join("\n");
    expect(text).toContain("2 real chat(s)");
    expect(text).toContain("Work on: picked a home and no broker was asked");
    expect(text).not.toContain("task_secret");
    expect(text).not.toMatch(/\d{9,}/);
    expect(funnelLines([], NOW, 7)).toEqual(["Chat funnel, last 7 d: 0 real chat(s) (0 WhatsApp, 0 web)"]);
  });
});

describe("a person's chats, read from the rows", () => {
  const task = (id: string, extra: Partial<TaskRow> = {}): TaskRow => ({
    id,
    profileId: "p1",
    wa: true,
    source: "k_page",
    lang: "en",
    createdAt: h(60),
    messages: [
      { role: "user", at: h(60).toISOString() },
      { role: "agent", kind: "shortlist", count: 3, at: h(59.9).toISOString() },
    ],
    budget: 700_000,
    requests: [],
    proposedAt: null,
    ...extra,
  });
  const deal = (extra: Partial<DealFacts> = {}): DealFacts => ({ taskId: "t2", status: "VIEWING_BOOKED", createdAt: h(20), updatedAt: h(20), signedAt: null, paidAt: null, notes: null, rent: 650_000, visit: { createdAt: h(20), scheduledFor: h(-24), occurredAt: null }, ...extra });

  it("counts one person once, at the furthest any of their chats went", () => {
    const people = chatFacts(
      [
        task("t1"),
        task("t2", { createdAt: h(30), messages: [{ role: "user", at: h(30).toISOString() }], requests: [{ consentAt: h(29), sentAt: h(29), respondedAt: h(27), status: "AVAILABLE", rent: 650_000 }], proposedAt: h(26) }),
        task("t3", { profileId: "p2", wa: false, source: null, lang: "ar", messages: [{ role: "user", at: h(5).toISOString() }], budget: null }),
      ],
      [deal()],
    );
    expect(people).toHaveLength(2);
    const [a, b] = people;
    expect(a!.id).toBe("t2");
    expect(furthest(a!)).toBe("booked");
    expect(a!.at.chat).toEqual(h(60));
    expect(a!.at.homes).toEqual(h(59.9));
    expect(a!.rent).toBe(650_000);
    expect(a!.viewingAt).toEqual(h(-24));
    expect(stopOf(a!, NOW)).toMatchObject({ cause: "viewing-ahead" });
    expect(b).toMatchObject({ id: "t3", channel: "web", source: "web", lang: "ar", rent: null });
    expect(furthest(b!)).toBe("chat");
  });

  it("reads a taken home, a lost deal and a paid one", () => {
    const taken = chatFacts([task("t1", { requests: [{ consentAt: h(50), sentAt: h(50), respondedAt: h(49), status: "RENTED", rent: 300_000 }] })], []);
    expect(stopOf(taken[0]!, NOW)).toMatchObject({ cause: "home-taken" });
    const lost = chatFacts([task("t2")], [deal({ status: "LOST", updatedAt: h(3), notes: "  found another home  " })]);
    expect(stopOf(lost[0]!, NOW)).toMatchObject({ cause: "lost", reason: "found another home" });
    const paid = chatFacts([task("t2")], [deal({ status: "PAID", signedAt: h(10), paidAt: h(2), visit: { createdAt: h(40), scheduledFor: h(30), occurredAt: h(30) } })]);
    expect(furthest(paid[0]!)).toBe("paid");
    expect(paid[0]!.at.viewed).toEqual(h(30));
    expect(stopOf(paid[0]!, NOW)).toBeNull();
  });

  it("counts a pick no broker was asked about", () => {
    const handed = chatFacts([task("t1", { messages: [{ role: "user", at: h(60).toISOString() }, { role: "agent", kind: "shortlist", count: 3, at: h(59).toISOString() }, { role: "agent", kind: "shortlist", count: 3, checked: "handed", at: h(40).toISOString() }] })], []);
    expect(stopOf(handed[0]!, NOW)).toMatchObject({ cause: "not-asked", owner: "line", stage: "pick" });
  });

  it("does not count a shortlist with no homes as homes shown", () => {
    const none = chatFacts([task("t1", { messages: [{ role: "user", at: h(60).toISOString() }, { role: "agent", kind: "shortlist", count: 0, at: h(59).toISOString() }] })], []);
    expect(furthest(none[0]!)).toBe("chat");
  });
});
