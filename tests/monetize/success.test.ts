import { describe, expect, it } from "vitest";

import { successFor } from "@/lib/monetize/success";
import type { BlockView } from "@/lib/monetize/types";

const chat: BlockView = {
  key: "chat",
  health: "red",
  reason: "brokerSendsOff",
  kpis: [
    { key: "paidDeals", value: 0, unit: "count" },
    { key: "chats", value: 22, unit: "count" },
    { key: "shortlistRate", value: 1, unit: "pct" },
    { key: "p50", value: 690, unit: "ms" },
    { key: "failRate", value: 0.1, unit: "pct" },
  ],
  jobs: [],
  snapshotAt: null,
  trend: [],
};

describe("success metrics", () => {
  it("checks each number against its target, both directions", () => {
    const s = Object.fromEntries(successFor(chat).map((x) => [x.kpi, x]));
    expect(s.paidDeals).toMatchObject({ status: "missed", progress: 0 });
    expect(s.chats).toMatchObject({ status: "met", progress: 1 });
    expect(s.p50).toMatchObject({ status: "met" });
    expect(s.failRate!.status).toBe("missed");
    expect(s.failRate!.progress).toBeCloseTo(0.5);
    expect(s.brokerAnswerRate).toMatchObject({ status: "unknown", value: null });
  });

  it("scales weekly targets with the window", () => {
    const s = Object.fromEntries(successFor(chat, 28).map((x) => [x.kpi, x]));
    expect(s.paidDeals!.target).toBe(8);
    expect(s.shortlistRate!.target).toBe(0.8);
  });
});
