import { describe, expect, it } from "vitest";

import en from "@/components/internationalization/en.json";
import { cardData } from "@/components/monetize/card-data";
import { bottleneck } from "@/lib/monetize/bottleneck";
import { costByBlock, costLines } from "@/lib/monetize/cost-lines";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { money } from "@/lib/monetize/money";
import { EMPTY_SPRINTS } from "@/lib/monetize/sprint-shape";

const lines = costLines({ fixed: { cloudflare: 7250, macAndInternet: 15000 }, spend: [{ lane: "agent-read", usd: 0.002, calls: 8, tokensIn: 1, tokensOut: 1 }], tiktokUsd: 0, monthElapsed: 0.1 });
const stages = [
  { key: "chats", block: "chat", count: 15 },
  { key: "shortlisted", block: "chat", count: 12 },
  { key: "paid", block: "chat", count: 0 },
];
const data = {
  days: 7,
  generatedAt: "2026-11-04T08:00:00Z",
  health: "red",
  money: money({ received: {}, dealEarnedRwf: 0, apiUsd: 0.002, tiktokUsd: 0, fixedRwf: 22_250, chats: 15, leads: 10, paidDeals: 0, monthElapsed: 0.1 }),
  fixedBreakdown: {},
  fixedEstimated: true,
  costLines: lines,
  costByBlock: costByBlock(lines),
  monthElapsed: 0.1,
  usdToRwf: 1450,
  nextSteps: [
    { key: "brokerSends", priority: 1, block: "chat", vars: {} },
    { key: "jobFailed", priority: 2, block: "scrape", vars: {} },
  ],
  sprints: EMPTY_SPRINTS,
  blocks: [
    { key: "scrape", health: "green", reason: "healthy", kpis: [{ key: "found", value: 131, unit: "count" }, { key: "read", value: 20, unit: "count" }, { key: "newHomes", value: 15, unit: "count", lever: true }], jobs: [], snapshotAt: null, trend: [], daily: [{ day: "2026-11-03", value: 4 }, { day: "2026-11-04", value: 9 }] },
    { key: "post", health: "green", reason: "healthy", kpis: [{ key: "postedDays7", value: 5, unit: "count" }], jobs: [], snapshotAt: null, trend: [] },
  ],
  stages,
  bottleneck: bottleneck(stages),
  experiments: [],
  gates: { brokerSends: "off", capped: false },
  adChats: 0,
  funnel: {} as never,
} as unknown as MonetizeOverview;

describe("the sticky card's data", () => {
  const c = cardData(data, en.monetize, "en");

  it("words the money overview like the Reserve card", () => {
    expect(c.overview.price).toMatch(/RWF/);
    expect(c.overview.netNeg).toBe(true);
    expect(c.overview.sprintLine).toBeNull();
  });

  it("ranks the costs, counts the open tasks by priority, and builds the flows", () => {
    expect(c.spend.bars[0]!.key).toBe("macAndInternet");
    expect(c.todo.map((b) => b.value)).toEqual([1, 1, 0, 0]);
    expect(c.scrape.funnel.map((b) => b.value)).toEqual([131, 20, 15]);
    expect(c.scrape.trend).toHaveLength(2);
    expect(c.chat.funnel.find((b) => b.key === "shortlisted")!.value).toBe(12);
    expect(c.post.postedDays).toBe(5);
    expect(c.sprint).toBeNull();
  });
});
