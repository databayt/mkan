import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/monetize-actions", () => ({ addRevenueEntry: vi.fn(), saveExperiment: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import ar from "@/components/internationalization/ar.json";
import en from "@/components/internationalization/en.json";
import { MonetizeContent } from "@/components/monetize/content";
import { bottleneck } from "@/lib/monetize/bottleneck";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { money } from "@/lib/monetize/money";

const stages = [
  { key: "read", block: "scrape", count: 20 },
  { key: "homes", block: "scrape", count: 15 },
  { key: "ready", block: "enhance", count: 0 },
];

const data = {
  days: 7,
  generatedAt: "2026-11-03T12:00:00Z",
  health: "red",
  money: money({ received: { COMMISSION: 50_000 }, dealEarnedRwf: 80_000, apiUsd: 0.03, tiktokUsd: 0, fixedRwf: 27_000, chats: 15, leads: 15, paidDeals: 1, monthElapsed: 0.1 }),
  fixedBreakdown: { cloudflare: 7250 },
  fixedEstimated: true,
  blocks: [
    { key: "scrape", health: "red", reason: "jobFailed", kpis: [{ key: "newHomes", value: 15, unit: "count", lever: true, prev: 10 }, { key: "found", value: 131, unit: "count" }], jobs: [{ job: "hermes_mkan-demand-match", status: "fail", at: null, summary: "mirror failed twice" }], snapshotAt: "2026-11-03T11:00:00Z", trend: [3, 5, 15] },
    { key: "enhance", health: "yellow", reason: "leverZero", kpis: [{ key: "mastered", value: 0, unit: "count", lever: true, prev: 0 }], jobs: [], snapshotAt: null, trend: [] },
    { key: "post", health: "green", reason: "healthy", kpis: [{ key: "viewsPerPost", value: 135.4, unit: "count", lever: true }], jobs: [], snapshotAt: null, trend: [] },
    { key: "chat", health: "red", reason: "brokerSendsOff", kpis: [{ key: "chatToPaid", value: 0, unit: "pct", lever: true, prev: null }, { key: "p50", value: 690, unit: "ms" }], jobs: [], snapshotAt: null, trend: [] },
  ],
  stages,
  bottleneck: bottleneck(stages),
  experiments: [{ id: "e1", block: "enhance", hypothesis: "Auto-mastering lifts ready homes", metric: "mastered", baseline: 0, target: 10, result: null, verdict: "running", startedAt: "2026-11-03T00:00:00Z", endedAt: null }],
  gates: { brokerSends: "off", capped: false },
  adChats: 0,
  funnel: {} as never,
} satisfies MonetizeOverview;

describe("/monetize content", () => {
  it("renders every block, the money, the bottleneck and, for an admin, the forms (en)", () => {
    render(<MonetizeContent data={data} labels={en.monetize} locale="en" lang="en" canEdit />);
    for (const b of ["scrape", "enhance", "post", "chat"] as const) expect(screen.getAllByText(en.monetize.blocks[b].title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en.monetize.reasons.brokerSendsOff).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en.monetize.money.revenue).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/the weakest hand-off, in the 2 · Enhance block/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Earned on paid deals but not recorded/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Auto-mastering lifts ready homes").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: en.monetize.revenueForm.save })).toBeTruthy();
    expect(screen.getAllByText("690 ms").length).toBeGreaterThan(0);
  });

  it("is public read-only: no write forms without an admin session", () => {
    render(<MonetizeContent data={data} labels={en.monetize} locale="en" lang="en" />);
    expect(screen.getAllByText(en.monetize.money.revenue).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Auto-mastering lifts ready homes").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: en.monetize.revenueForm.save })).toBeNull();
    expect(screen.queryByRole("button", { name: en.monetize.experiments.save })).toBeNull();
  });
  it("renders in Arabic with the Arabic labels", () => {
    render(<MonetizeContent data={data} labels={ar.monetize} locale="ar" lang="ar" />);
    expect(screen.getAllByText(ar.monetize.blocks.chat.title).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ar.monetize.money.title).length).toBeGreaterThan(0);
  });
});
