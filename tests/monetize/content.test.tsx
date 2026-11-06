import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/monetize-actions", () => ({ addRevenueEntry: vi.fn(), saveExperiment: vi.fn(), toggleSprintTask: vi.fn(), setPromptStatus: vi.fn(), saveSprint: vi.fn(), closeSprint: vi.fn(), addSprintTask: vi.fn(), addSprintPrompt: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }));

import ar from "@/components/internationalization/ar.json";
import en from "@/components/internationalization/en.json";
import { MonetizeContent } from "@/components/monetize/content";
import { bottleneck } from "@/lib/monetize/bottleneck";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { costByBlock, costLines } from "@/lib/monetize/cost-lines";
import { money } from "@/lib/monetize/money";
import { nextSteps } from "@/lib/monetize/next-steps";
import { liveView, publicLive } from "@/lib/monetize/live-shape";
import { shapeSprints } from "@/lib/monetize/sprint-shape";

const stages = [
  { key: "read", block: "scrape", count: 20 },
  { key: "homes", block: "scrape", count: 15 },
  { key: "ready", block: "enhance", count: 0 },
];

const lines = costLines({
  fixed: { cloudflare: 7250, whatsappLine: 5000, macAndInternet: 15000 },
  spend: [{ lane: "agent-read", usd: 0.002, calls: 8, tokensIn: 2937, tokensOut: 1014 }],
  tiktokUsd: 0.001,
  monthElapsed: 0.1,
});

const base = {
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
  firstShare: null,
  lessons: [],
  costLines: lines,
  costByBlock: costByBlock(lines),
  monthElapsed: 0.1,
  usdToRwf: 1450,
};
const sprints = shapeSprints(
  [
    {
      id: "w",
      kind: "WEEK",
      title: "First paid deal",
      goal: "One tenant signs",
      startsAt: new Date("2026-11-02"),
      endsAt: new Date("2026-11-09"),
      status: "active",
      tasks: [{ id: "t1", title: "Turn broker sends back on", block: "chat", order: 0, done: false, doneAt: null }],
      prompts: [
        { id: "p1", taskId: "t1", order: 0, text: "In ~/mkan: read the test chat, then gate broker sends.", status: "running", processedAt: new Date("2026-11-03T11:50:00Z"), result: null },
        { id: "p3", taskId: null, order: 2, text: "In ~/mkan: draft the share terms for +250 780 123 456.", status: "blocked", processedAt: new Date("2026-11-03T10:00:00Z"), result: "Approve the text for +250 780 123 456" },
        { id: "p2", taskId: null, order: 1, text: "In ~/mkan: post every day.", status: "processed", processedAt: new Date("2026-11-03"), result: "ok" },
      ],
    },
  ],
  new Date("2026-11-04"),
);

const data = {
  ...base,
  sprints,
  nextSteps: nextSteps({ money: base.money, blocks: base.blocks, bottleneck: base.bottleneck, gates: base.gates, fixedEstimated: true, shortlisted: 15, paidDealsMonth: 0 }),
} satisfies MonetizeOverview;

const live = liveView(sprints, { state: "running", since: "2026-11-03T11:50:00Z", at: "2026-11-03T11:50:00Z", promptId: "p1" }, "2026-11-03T11:55:00Z", new Date("2026-11-03T12:00:00Z"));

describe("/monetize content", () => {
  it("opens on the loop, live: what it does now, for how long, and what is next", () => {
    render(<MonetizeContent data={data} live={live} labels={en.monetize} locale="en" lang="en" canEdit />);
    expect(screen.getByText(`${en.monetize.live.title}: ${en.monetize.live.states.running}`)).toBeTruthy();
    expect(screen.getAllByText("Turn broker sends back on").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: en.monetize.live.copy })).toBeTruthy();
    expect(screen.getByRole("button", { name: en.monetize.live.showPrompt })).toBeTruthy();
    // An admin sees the ask that waits on Abdout.
    expect(screen.getAllByText("Approve the text for +250 780 123 456").length).toBeGreaterThan(0);
  });

  it("shows the road to money: the ladder, this week's sprint and the sprints after it", () => {
    render(<MonetizeContent data={data} live={live} labels={en.monetize} locale="en" lang="en" />);
    expect(screen.getByRole("heading", { name: en.monetize.road.title })).toBeTruthy();
    for (const r of Object.values(en.monetize.road.rungs)) expect(screen.getAllByText(r).length).toBeGreaterThan(0);
    expect(screen.getAllByText("First paid deal").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A viewing on a home that pays").length).toBeGreaterThan(0);
  });

  it("draws the weakest block's flowchart first, with its live numbers, and names the weakest hand-off", () => {
    render(<MonetizeContent data={data} live={live} labels={en.monetize} locale="en" lang="en" />);
    expect(screen.getByRole("heading", { name: en.monetize.flows.title })).toBeTruthy();
    for (const b of ["scrape", "enhance", "post", "chat"] as const) expect(screen.getAllByText(en.monetize.blocks[b].title).length).toBeGreaterThan(0);
    // homes → ready (15 → 0) is the weakest hand-off: the Enhance chart opens.
    expect(screen.getByText(en.monetize.flows.enhance.pick.t)).toBeTruthy();
    expect(screen.getByText(en.monetize.flows.enhance.rejected.t)).toBeTruthy();
    expect(screen.getAllByText(en.monetize.flows.weakest).length).toBeGreaterThan(0);
  });

  it("keeps the money in one card, every cost line one click away", () => {
    render(<MonetizeContent data={data} live={live} labels={en.monetize} locale="en" lang="en" canEdit />);
    expect(screen.getAllByText(en.monetize.money.revenue).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en.monetize.card.net).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en.monetize.spend.lines.cloudflare.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText(en.monetize.lines.COMMISSION).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: en.monetize.revenueForm.save })).toBeTruthy();
    expect(screen.getAllByText("Auto-mastering lifts ready homes").length).toBeGreaterThan(0);
  });

  it("is public read-only: no write forms, no prompt, no asks — only how many wait", () => {
    const pub = publicLive(live);
    render(<MonetizeContent data={data} live={pub} labels={en.monetize} locale="en" lang="en" />);
    expect(screen.queryByRole("button", { name: en.monetize.revenueForm.save })).toBeNull();
    expect(screen.queryByRole("button", { name: en.monetize.experiments.save })).toBeNull();
    expect(screen.queryByRole("button", { name: en.monetize.live.showPrompt })).toBeNull();
    expect(screen.queryByText(/123 456/)).toBeNull();
    expect(screen.getByText(en.monetize.live.needsYouCount.replace("{n}", "1"))).toBeTruthy();
  });

  it("renders in Arabic with the Arabic labels", () => {
    render(<MonetizeContent data={data} live={live} labels={ar.monetize} locale="ar" lang="ar" />);
    expect(screen.getAllByText(ar.monetize.blocks.chat.title).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: ar.monetize.road.title })).toBeTruthy();
    expect(screen.getByText(ar.monetize.flows.enhance.pick.t)).toBeTruthy();
  });
});
