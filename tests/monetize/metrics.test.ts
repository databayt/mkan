import { describe, expect, it } from "vitest";

import { evalCondition, metricDirection, parseCondition, readMetrics, verdictOf } from "@/lib/monetize/metrics";
import type { BlockView } from "@/lib/monetize/types";

const block = (key: BlockView["key"], kpis: [string, number | null][]): BlockView => ({
  key,
  health: "green",
  reason: "ok",
  kpis: kpis.map(([k, value]) => ({ key: k, value, unit: "count" })),
  jobs: [],
  snapshotAt: null,
  trend: [],
});

describe("readMetrics", () => {
  it("flattens KPIs, gates, money, stages and the first-share totals", () => {
    const m = readMetrics({
      blocks: [block("chat", [["chats", 12], ["paidDeals", 0]]), block("enhance", [["readyNew", 79], ["mastered", 0]])],
      gates: { brokerSends: "off", capped: false },
      money: { revenueRwf: 0, breakEvenRwf: 11604, netRwf: -1676, unrecordedRwf: 0, costRwf: 1676 } as never,
      stages: [{ key: "posted", block: "post", count: 7 }],
      bottleneck: { kind: "step", from: "ready", to: "posted", rate: 0.09, floor: 0.5 },
      firstShare: { featured: 10, clean: 6, posted: 5, contacts: 2, signed: 0, paidShareRwf: 0, posts: [] },
    });
    expect(m).toMatchObject({
      chats: 12, paidDeals: 0, readyNew7: 79, masteredWeek: 0, "chat.health": "green",
      brokerSends: "off", capped: "false", revenueMonthRwf: 0, revenueEntry: null, breakEvenRwf: 11604,
      "stage.posted": 7, bottleneck: "ready>posted",
      postsFeatured7: 10, postsClean7: 6, postsPosted7: 5, tiktokContacts7: 2, signed7: 0, paidShareRwf: 0,
    });
    expect(readMetrics({})).toEqual({});
  });
});

describe("conditions", () => {
  const m = { brokerSends: "off", masteredWeek: 0, chats: 12, revenueEntry: null, rate: 0.25 };
  it("compares strings and numbers with every operator", () => {
    expect(evalCondition("brokerSends == gated", m)).toBe(false);
    expect(evalCondition("brokerSends == off", m)).toBe(true);
    expect(evalCondition("brokerSends != gated", m)).toBe(true);
    expect(evalCondition("brokerSends == 'off'", m)).toBe(true);
    expect(evalCondition("masteredWeek > 0", m)).toBe(false);
    expect(evalCondition("chats >= 12", m)).toBe(true);
    expect(evalCondition("chats < 12", m)).toBe(false);
    expect(evalCondition("chats <= 12 && rate > 0.2", m)).toBe(true);
    expect(evalCondition("chats <= 12 and rate > 0.3", m)).toBe(false);
  });
  it("treats a missing number as never true, and exists as non-null", () => {
    expect(evalCondition("revenueEntry exists", m)).toBe(false);
    expect(evalCondition("revenueEntry exists", { revenueEntry: 5000 })).toBe(true);
    expect(evalCondition("nothing != 3", m)).toBe(false);
    expect(evalCondition("brokerSends > 2", m)).toBe(false);
  });
  it("rejects malformed conditions", () => {
    expect(parseCondition("brokerSends gated")).toBeNull();
    expect(parseCondition("")).toBeNull();
    expect(evalCondition("== 3", m)).toBe(false);
    expect(parseCondition("a.b >= 2")).toEqual([{ key: "a.b", op: ">=", value: 2 }]);
  });
});

describe("verdicts", () => {
  it("reads direction from success.ts and the lower-is-better list", () => {
    expect(metricDirection("chats")).toBe(">=");
    expect(metricDirection("failRate")).toBe("<=");
    expect(metricDirection("videoRejectRate")).toBe("<=");
    expect(metricDirection("readyNew7")).toBe(">=");
  });
  it("moved / flat / worse / unknown", () => {
    expect(verdictOf("chats", 10, 14)).toBe("moved");
    expect(verdictOf("chats", 10, 10.1)).toBe("flat");
    expect(verdictOf("chats", 10, 6)).toBe("worse");
    expect(verdictOf("failRate", 0.3, 0.1)).toBe("moved");
    expect(verdictOf("chats", null, 4)).toBe("unknown");
    expect(verdictOf("chats", 0, 0)).toBe("flat");
  });
});
