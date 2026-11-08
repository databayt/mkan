import { describe, expect, it } from "vitest";
import {
  answerStats,
  awakeMs,
  brokerScore,
  brokerTier,
  dueForNext,
  isSilent,
  nudgeDue,
  rankBrokers,
  smoothedRate,
  type BrokerSignal,
} from "@/components/agent/broker-rank";

const now = new Date("2026-11-05T10:00:00Z"); // 12:00 in Kigali
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const sig = (s: Partial<BrokerSignal> = {}): BrokerSignal => ({ asked: 0, answered: 0, askedLong: 0, answeredLong: 0, ...s });

describe("who is asked first", () => {
  it("puts the broker who answers ahead of the one who does not", () => {
    const list = [
      { id: "silent-ish", s: sig({ asked: 4, answered: 0, askedLong: 4, answeredLong: 0, lastReplyAt: daysAgo(40) }) },
      { id: "answers", s: sig({ asked: 4, answered: 3, askedLong: 4, answeredLong: 3 }) },
    ];
    expect(rankBrokers(list, (x) => x.s, now).map((x) => x.id)).toEqual(["answers", "silent-ish"]);
  });

  it("orders by relationship when nothing else tells them apart: PARTNER > ACTIVE > INTRODUCED > NEW", () => {
    const rels = ["NEW", "INTRODUCED", "PARTNER", "ACTIVE"] as const;
    const ranked = rankBrokers(rels.map((r) => ({ r })), (x) => sig({ relationship: x.r }), now).map((x) => x.r);
    expect(ranked).toEqual(["PARTNER", "ACTIVE", "INTRODUCED", "NEW"]);
  });

  it("favours a broker active lately: wrote to Mkan, posted an ad, replies fast", () => {
    expect(brokerScore(sig({ lastReplyAt: daysAgo(2) }), now)).toBeGreaterThan(brokerScore(sig({ lastReplyAt: daysAgo(60) }), now));
    expect(brokerScore(sig({ lastSeenAt: daysAgo(3) }), now)).toBeGreaterThan(brokerScore(sig({ lastSeenAt: daysAgo(200) }), now));
    expect(brokerScore(sig({ replyMinutes: 20 }), now)).toBeGreaterThan(brokerScore(sig({ replyMinutes: 3_000 }), now));
  });

  it("does not judge a broker on one ask", () => {
    expect(smoothedRate(0, 0)).toBe(0.5);
    expect(smoothedRate(0, 1)).toBeCloseTo(1 / 3);
    // One unanswered ask does not outweigh a PARTNER.
    expect(brokerScore(sig({ relationship: "PARTNER", asked: 1, askedLong: 1 }), now)).toBeGreaterThan(brokerScore(sig({ relationship: "NEW" }), now));
  });

  it("puts a broker who never answered after three asks last — never drops them", () => {
    const never = sig({ relationship: "PARTNER", askedLong: 3, answeredLong: 0, asked: 3 });
    expect(isSilent(never)).toBe(true);
    expect(isSilent({ ...never, lastReplyAt: daysAgo(1) })).toBe(false);
    expect(isSilent(sig({ askedLong: 2 }))).toBe(false);
    const ranked = rankBrokers([{ id: "never", s: never }, { id: "new", s: sig() }], (x) => x.s, now).map((x) => x.id);
    expect(ranked).toEqual(["new", "never"]);
    expect(rankBrokers([{ id: "never", s: never }], (x) => x.s, now)).toHaveLength(1);
  });

  it("asks a broker the outbox would send to now before one it would hold today", () => {
    expect(brokerTier(sig({ held: true }))).toBe(1);
    expect(brokerTier(sig({ relationship: "PAUSED" }))).toBe(2);
    const ranked = rankBrokers([{ id: "held", s: sig({ relationship: "PARTNER", held: true }) }, { id: "free", s: sig() }], (x) => x.s, now).map((x) => x.id);
    expect(ranked).toEqual(["free", "held"]);
  });

  it("keeps the incoming order (owner, then oldest ad) on a tie", () => {
    expect(rankBrokers(["a", "b", "c"], () => sig(), now)).toEqual(["a", "b", "c"]);
  });
});

describe("the broker's own answer rate", () => {
  const row = (brokerUserId: string, status: string, o: { channel?: string; sent?: boolean; responded?: boolean; age?: number } = {}) => ({
    brokerUserId,
    status,
    channel: o.channel ?? "evolution",
    sentAt: o.sent === false ? null : daysAgo(o.age ?? 1),
    respondedAt: o.responded ? daysAgo(o.age ?? 1) : null,
    createdAt: daysAgo(o.age ?? 1),
  });

  it("counts only asks that went out, and only answers the broker gave", () => {
    const stats = answerStats(
      [
        row("a", "AVAILABLE", { responded: true }),
        // Closed by another broker's answer: no respondedAt on this row.
        row("a", "AVAILABLE"),
        row("a", "NO_REPLY"),
        row("a", "PENDING", { sent: false }),
        row("a", "AVAILABLE", { channel: "joined", responded: true }),
        row("a", "RENTED", { responded: true, age: 60 }),
        row("b", "NO_REPLY", { age: 120 }),
      ],
      now,
    );
    expect(stats.get("a")).toEqual({ asked: 3, answered: 1, askedLong: 4, answeredLong: 2 });
    expect(stats.has("b")).toBe(false);
  });
});

describe("who is asked first: answered before", () => {
  it("puts a broker who answered before ahead of a better-scored one who never has", () => {
    const list = [
      { id: "new-active", s: sig({ relationship: "PARTNER", lastReplyAt: daysAgo(1), lastSeenAt: daysAgo(1) }) },
      { id: "answered-once", s: sig({ asked: 2, answered: 1, askedLong: 3, answeredLong: 1 }) },
    ];
    expect(rankBrokers(list, (x) => x.s, now).map((x) => x.id)).toEqual(["answered-once", "new-active"]);
  });

  it("an older answer (outside 30 days) still counts, and a held or silent broker stays behind", () => {
    const list = [
      { id: "held-answered", s: sig({ asked: 1, answered: 1, askedLong: 1, answeredLong: 1, held: true }) },
      { id: "long-ago", s: sig({ askedLong: 4, answeredLong: 1 }) },
      { id: "never", s: sig({ relationship: "ACTIVE" }) },
    ];
    expect(rankBrokers(list, (x) => x.s, now).map((x) => x.id)).toEqual(["long-ago", "never", "held-answered"]);
  });
});

describe("when the next broker is asked", () => {
  const kigali = (iso: string) => new Date(`${iso}+02:00`);

  it("counts only daytime hours (08:00–20:00 Kigali)", () => {
    expect(awakeMs(kigali("2026-11-05T09:00:00"), kigali("2026-11-05T12:00:00"))).toBe(3 * 3_600_000);
    // 19:00 → 09:00 next day: one hour that evening, one the next morning.
    expect(awakeMs(kigali("2026-11-05T19:00:00"), kigali("2026-11-06T09:00:00"))).toBe(2 * 3_600_000);
    // Sent at night: the clock starts at 08:00.
    expect(awakeMs(kigali("2026-11-05T22:00:00"), kigali("2026-11-06T10:30:00"))).toBe(2.5 * 3_600_000);
    expect(awakeMs(kigali("2026-11-05T12:00:00"), kigali("2026-11-05T11:00:00"))).toBe(0);
  });

  it("hands on after three daytime hours of silence, never overnight", () => {
    expect(dueForNext(kigali("2026-11-05T09:00:00"), kigali("2026-11-05T11:59:00"))).toBe(false);
    expect(dueForNext(kigali("2026-11-05T09:00:00"), kigali("2026-11-05T12:00:00"))).toBe(true);
    expect(dueForNext(kigali("2026-11-05T18:30:00"), kigali("2026-11-05T23:00:00"))).toBe(false);
    expect(dueForNext(kigali("2026-11-05T18:30:00"), kigali("2026-11-06T09:30:00"))).toBe(true);
  });
});

describe("the one nudge", () => {
  const kigali = (iso: string) => new Date(`${iso}+02:00`);

  it("is due after two daytime hours, not before", () => {
    expect(nudgeDue(kigali("2026-11-05T09:00:00"), kigali("2026-11-05T10:59:00"))).toBe(false);
    expect(nudgeDue(kigali("2026-11-05T09:00:00"), kigali("2026-11-05T11:00:00"))).toBe(true);
  });

  it("waits for the morning after a night ask, and counts only daytime across the evening", () => {
    expect(nudgeDue(kigali("2026-11-05T21:00:00"), kigali("2026-11-06T07:59:00"))).toBe(false);
    expect(nudgeDue(kigali("2026-11-05T21:00:00"), kigali("2026-11-06T09:59:00"))).toBe(false);
    expect(nudgeDue(kigali("2026-11-05T21:00:00"), kigali("2026-11-06T10:00:00"))).toBe(true);
    // 19:00 ask: one evening hour + one morning hour.
    expect(nudgeDue(kigali("2026-11-05T19:00:00"), kigali("2026-11-06T08:59:00"))).toBe(false);
    expect(nudgeDue(kigali("2026-11-05T19:00:00"), kigali("2026-11-06T09:00:00"))).toBe(true);
  });

  it("never repeats once recorded, and never fires for an ask that has not gone out", () => {
    const sent = kigali("2026-11-05T09:00:00");
    const later = kigali("2026-11-05T15:00:00");
    expect(nudgeDue(sent, later, "2026-11-05T11:00:00.000Z")).toBe(false);
    expect(nudgeDue(sent, later, new Date())).toBe(false);
    expect(nudgeDue(null, later)).toBe(false);
    // Comes before the hand-on at three hours.
    expect(nudgeDue(sent, kigali("2026-11-05T11:30:00"))).toBe(true);
    expect(dueForNext(sent, kigali("2026-11-05T11:30:00"))).toBe(false);
  });
});
