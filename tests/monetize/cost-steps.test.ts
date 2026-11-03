import { describe, expect, it } from "vitest";

import { bottleneck } from "@/lib/monetize/bottleneck";
import { costByBlock, costLines } from "@/lib/monetize/cost-lines";
import { money } from "@/lib/monetize/money";
import { nextSteps } from "@/lib/monetize/next-steps";
import type { BlockView } from "@/lib/monetize/types";

describe("costLines", () => {
  const lines = costLines({
    fixed: { cloudflare: 7250, macAndInternet: 15000 },
    spend: [
      { lane: "agent-read", usd: 0.01, calls: 5, tokensIn: 100, tokensOut: 50 },
      { lane: "agent-read", usd: 0.01, calls: 5, tokensIn: 100, tokensOut: 50 },
      { lane: "capped", usd: 0, calls: 3, tokensIn: 0, tokensOut: 0 },
    ],
    tiktokUsd: 0,
    monthElapsed: 0.5,
  });

  it("accrues fixed bills by the month elapsed and projects metered spend", () => {
    const cf = lines.find((l) => l.key === "cloudflare")!;
    expect(cf).toMatchObject({ kind: "fixed", soFarRwf: 3625, monthlyRwf: 7250, blocks: ["chat"] });
    const read = lines.find((l) => l.key === "agent-read")!;
    expect(read).toMatchObject({ kind: "metered", calls: 10, soFarRwf: 29, monthlyRwf: 58 });
    expect(lines.some((l) => l.key === "capped")).toBe(false);
    expect(lines.filter((l) => l.kind === "free").length).toBeGreaterThan(0);
  });

  it("splits a shared line evenly over the blocks it serves", () => {
    const by = costByBlock(lines);
    expect(by.scrape.monthlyRwf).toBe(5000);
    expect(by.chat.monthlyRwf).toBe(7250 + 58);
  });
});

describe("nextSteps", () => {
  const blocks = [
    { key: "scrape", health: "red", reason: "jobFailed", kpis: [], jobs: [{ job: "hermes_mkan-demand-match", status: "fail", at: null, summary: "mirror failed twice" }], snapshotAt: null, trend: [] },
    { key: "post", health: "green", reason: "healthy", kpis: [{ key: "postedDays7", value: 5, unit: "count" }], jobs: [], snapshotAt: null, trend: [] },
  ] as BlockView[];
  const m = money({ received: {}, dealEarnedRwf: 0, apiUsd: 0, tiktokUsd: 0, fixedRwf: 27000, chats: 0, leads: 0, paidDeals: 0, monthElapsed: 0.1 });

  it("lists money first, then what is broken, then growth, then the books", () => {
    const s = nextSteps({ money: m, blocks, bottleneck: bottleneck([]), gates: { brokerSends: "off", capped: false }, fixedEstimated: true, shortlisted: 3, paidDealsMonth: 0 });
    expect(s.map((x) => x.key)).toEqual(["brokerSends", "firstDeal", "breakEven", "jobFailed", "postDaily", "invoices"]);
    expect(s.find((x) => x.key === "jobFailed")!.vars.job).toBe("mkan-demand-match");
  });

  it("drops a task once the data shows it done", () => {
    const s = nextSteps({ money: m, blocks: [], bottleneck: bottleneck([]), gates: { brokerSends: "gated", capped: false }, fixedEstimated: false, shortlisted: 0, paidDealsMonth: 1 });
    expect(s.map((x) => x.key)).toEqual(["breakEven"]);
  });
});
