import { describe, expect, it } from "vitest";

import type { ChatFacts } from "@/lib/monetize/chat-funnel-pure";
import { addDays, buildInbound, daysEnding, INBOUND_TARGET_PER_WEEK, kigaliDayOf, weakestStep, type SignalRow } from "@/lib/monetize/inbound-pure";

// Prod's real series (2026-11-16), by Kigali day of the first message: 31 web + 1 WhatsApp in 45 days.
const NOW = new Date("2026-11-16T10:00:00Z");
const SERIES: [string, number, "web" | "wa"][] = [
  ["2026-10-21", 3, "web"], ["2026-10-22", 13, "web"], ["2026-10-23", 2, "web"], ["2026-10-24", 6, "web"], ["2026-10-25", 1, "web"],
  ["2026-10-26", 1, "web"], ["2026-10-27", 1, "web"], ["2026-11-01", 1, "web"], ["2026-11-02", 1, "web"], ["2026-11-05", 1, "web"],
  ["2026-11-11", 1, "web"], ["2026-11-12", 1, "wa"],
];
let seq = 0;
const fact = (day: string, channel: "web" | "wa", extra: Partial<ChatFacts> = {}): ChatFacts => ({
  id: `t${++seq}`,
  profileId: `p${seq}`,
  firstWords: "2 bedroom in Kicukiro",
  channel,
  source: channel === "wa" ? "k_page" : "web",
  lang: "en",
  rent: null,
  at: { chat: new Date(`${day}T09:00:00Z`) },
  lastTenantAt: null,
  ...extra,
});
const REAL = SERIES.flatMap(([day, n, ch]) => Array.from({ length: n }, () => fact(day, ch)));
const build = (extra: ChatFacts[] = [], signals: SignalRow[] = [], signalsSince: string | null = null) =>
  buildInbound({ facts: [...REAL, ...extra], signals, posts: [], signalsSince, now: NOW });

describe("inbound — the number", () => {
  it("replays the real series: 31 web and 1 WhatsApp over 45 days", () => {
    expect(REAL.filter((f) => f.channel === "web")).toHaveLength(31);
    const o = build();
    // The 30-day window starts 10-18: all of launch week is in it.
    expect(o.web.days30).toBe(31);
    expect(o.wa.days30).toBe(1);
    expect(o.day).toBe("2026-11-16");
    // This week is 11-10..11-16: one web (11-11) and one WhatsApp (11-12). Last week is 11-03..11-09: one web (11-05).
    expect(o.web).toMatchObject({ today: 0, week: 1, lastWeek: 1 });
    expect(o.wa).toMatchObject({ today: 0, week: 1, lastWeek: 0 });
    expect(o.total).toEqual({ today: 0, week: 2, lastWeek: 1, target: INBOUND_TARGET_PER_WEEK });
  });

  it("counts a web-sourced WhatsApp profile once, as the web card's → WhatsApp, never as a new WhatsApp person", () => {
    const o = build([fact("2026-11-13", "wa", { source: "web" })]);
    expect(o.wa.week).toBe(1);
    expect(o.wa.days30).toBe(1);
    expect(o.web.movedToWa).toBe(1);
    expect(o.web.week).toBe(1);
    expect(o.total.week).toBe(2);
    const moved = o.people.find((p) => p.movedToWa)!;
    expect(moved).toMatchObject({ channel: "web", source: "web", day: "2026-11-13" });
  });

  it("always has 14 points, oldest first, every day present", () => {
    for (const o of [build(), buildInbound({ facts: [], signals: [], posts: [], signalsSince: null, now: NOW })]) {
      for (const ch of [o.web, o.wa]) {
        expect(ch.series).toHaveLength(14);
        expect(ch.series[0]!.day).toBe("2026-11-03");
        expect(ch.series[13]!.day).toBe("2026-11-16");
      }
    }
    expect(build().web.series.find((p) => p.day === "2026-11-11")!.n).toBe(1);
  });

  it("cuts windows on Kigali days, not UTC days", () => {
    // 23:30 UTC on 11-15 is 01:30 on 11-16 in Kigali: today.
    const o = buildInbound({ facts: [fact("2026-11-15", "web", { at: { chat: new Date("2026-11-15T23:30:00Z") } })], signals: [], posts: [], signalsSince: null, now: NOW });
    expect(o.web.today).toBe(1);
    expect(kigaliDayOf(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
    // The week's edge: 11-10 is in, 11-09 is last week.
    const edge = buildInbound({ facts: [fact("2026-11-10", "web"), fact("2026-11-09", "web")], signals: [], posts: [], signalsSince: null, now: NOW });
    expect(edge.web).toMatchObject({ week: 1, lastWeek: 1 });
    expect(daysEnding("2026-11-16", 7)[0]).toBe("2026-11-10");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("lists this week's sources, most first", () => {
    const o = build([fact("2026-11-14", "web", { source: "tt" }), fact("2026-11-15", "web", { source: "tt" })]);
    expect(o.web.sources).toEqual([{ source: "tt", n: 2 }, { source: "web", n: 1 }]);
  });

  it("lists the last 30 days' new people, newest first, with first words", () => {
    const o = build();
    expect(o.people[0]!.day).toBe("2026-11-12");
    expect(o.people[0]).toMatchObject({ channel: "wa", source: "k_page", stage: "chat", firstWords: "2 bedroom in Kicukiro" });
    expect(o.people.length).toBe(32);
    const days = o.people.map((p) => p.day);
    expect([...days].sort().reverse()).toEqual(days);
  });

  it("names inbound the bottleneck while the week is under 7, then the funnel's weakest step", () => {
    const short = build();
    expect(short.bottleneck.now).toBe("inbound");
    // Everybody stopped at "chat": the step after it, chat → homes, is the one failing.
    expect(short.bottleneck.next).toBe("homes");
    const full = build(Array.from({ length: 6 }, () => fact("2026-11-15", "web")));
    expect(full.total.week).toBe(8);
    expect(full.bottleneck.now).toBe("homes");
  });
});

describe("inbound — upstream", () => {
  const sig = (day: string, kind: string, visitorHash: string): SignalRow => ({ day, kind, visitorHash });

  it("counts people, not hits: distinct visitors, openers and taps per window", () => {
    const o = build([], [
      sig("2026-11-16", "visit", "a"), sig("2026-11-15", "visit", "a"), sig("2026-11-15", "visit", "b"),
      sig("2026-11-16", "chat_open", "a"),
      sig("2026-11-16", "wa_tap", "c"), sig("2026-11-14", "wa_tap", "c"), sig("2026-11-14", "wa_tap", "d"),
      sig("2026-11-05", "visit", "z"),
    ], "2026-11-05");
    expect(o.web.upstream.week).toEqual({ reach: 2, intent: 1, tiktokViews: null });
    expect(o.web.upstream.lastWeek.reach).toBe(1);
    expect(o.wa.upstream.week).toMatchObject({ reach: 2, intent: 2 });
  });

  it("sums TikTok views of the posts in each window", () => {
    const o = buildInbound({ facts: [], signals: [], signalsSince: null, now: NOW, posts: [
      { postedAt: new Date("2026-11-15T10:00:00Z"), views: 300 },
      { postedAt: new Date("2026-11-08T10:00:00Z"), views: 100 },
      { postedAt: new Date("2026-11-08T11:00:00Z"), views: null },
    ] });
    expect(o.wa.upstream.week.tiktokViews).toBe(300);
    expect(o.wa.upstream.lastWeek.tiktokViews).toBe(100);
  });

  it("marks the weakest step, and none while no signal was ever counted", () => {
    const u = (reach: number, intent: number) => ({ reach, intent, tiktokViews: null });
    expect(weakestStep("web", u(0, 0), u(0, 0), 0, null)).toBeNull();
    expect(weakestStep("web", u(0, 0), u(0, 0), 0, "2026-11-16")).toBe("reach");
    expect(weakestStep("web", u(100, 1), u(100, 5), 1, "2026-11-01")).toBe("intent");
    expect(weakestStep("web", u(100, 20), u(100, 20), 1, "2026-11-01")).toBe("arrival");
    expect(weakestStep("web", u(40, 10), u(100, 10), 5, "2026-11-01")).toBe("reach");
    expect(weakestStep("wa", u(10, 10), u(10, 10), 0, "2026-11-01")).toBe("arrival");
  });
});
