import type { Locale } from "@/components/internationalization/config";
import { formatPercentage } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { REVENUE_LINES } from "@/lib/monetize/money";
import { BLOCKS, type BlockKey, type BlockView, type Health } from "@/lib/monetize/types";

import { fill, formatValue, type MonetizeLabels } from "./format";

/**
 * Everything the sticky card draws, worded and formatted on the server so the client part only
 * draws: one panel per section of the page (the card follows the scroll). Plain data — it crosses
 * into a client component.
 */
export interface Bar {
  key: string;
  label: string;
  value: number;
  display: string;
}
export interface CardData {
  overview: {
    price: string;
    revenue: string;
    cost: string;
    net: string;
    netNeg: boolean;
    fixed: string;
    metered: string;
    needed: string;
    progress: number;
    progressDisplay: string;
    projected: string;
    projectedNeg: boolean;
    sprintLine: string | null;
    weakest: string | null;
  };
  sprint: {
    rings: { key: string; label: string; value: number; display: string; sub: string }[];
    prompts: string[];
    counts: { status: string; label: string; n: number }[];
  } | null;
  todo: Bar[];
  spend: { bars: Bar[]; total: string };
  earn: { bars: Bar[]; target: number; targetDisplay: string; empty: boolean };
  /** Each block's steps as a flow chart, with the step the light blames (null when green). */
  flows: Record<BlockKey, BlockFlow>;
}
export interface BlockFlow {
  steps: string[];
  problem: number | null;
  reason: string | null;
  health: Health;
}

/** The step a failing or stale job belongs to (the block's "how it works" order). */
const JOB_STEP: Record<string, number> = {
  "hermes_mkan-tiktok-sweep": 0,
  "hermes_mkan-web-sweep": 0,
  "mkan-home-sweep": 2,
  "mkan-crm-sync-up": 2,
  "hermes_mkan-demand-match": 3,
  "mkan-master-sweep": 1,
  "mkan-mastering-reconcile": 2,
  "hermes_mkan-tiktok-post": 0,
  "hermes_mkan-tiktok-stats": 3,
};
/** The step a number-based reason points at: where the block's main number is made. */
const REASON_STEP: Record<BlockKey, Record<string, number>> = {
  scrape: { leverDown: 2, leverZero: 2 },
  enhance: { leverDown: 1, leverZero: 1 },
  post: { leverDown: 0, leverZero: 0 },
  chat: { leverDown: 3, leverZero: 3, capped: 1, failRateHigh: 1, brokerSendsOff: 2 },
};

function flowOf(b: BlockView, steps: string[], reasons: Record<string, string>): BlockFlow {
  if (b.health === "green") return { steps, problem: null, reason: null, health: b.health };
  const want = b.reason === "jobFailed" ? ["fail"] : b.reason === "jobStale" ? ["stale"] : b.reason === "jobWarn" ? ["warn"] : [];
  const job = b.jobs.find((j) => want.includes(j.status) && j.job in JOB_STEP);
  // A stale pusher (monetize-snapshot) or no evidence at all: the flow stops at its first step.
  const problem = job ? JOB_STEP[job.job]! : (REASON_STEP[b.key][b.reason] ?? 0);
  return { steps, problem: Math.min(problem, steps.length - 1), reason: reasons[b.reason] ?? b.reason, health: b.health };
}

export const PANELS = ["overview", "sprint", "todo", "spend", "earn", "scrape", "enhance", "post", "chat"] as const;
export type PanelKey = (typeof PANELS)[number];

export function cardData(d: MonetizeOverview, labels: MonetizeLabels, locale: Locale): CardData {
  const rwf = (v: number) => formatValue(v, "rwf", locale);
  const num = (v: number) => formatValue(v, "count", locale);
  const pct = (v: number) => formatPercentage(v, locale);
  const m = d.money;
  const C = labels.card;
  const P = labels.panels;
  const stage = labels.stages as Record<string, string>;

  const fixedMonth = d.costLines.filter((l) => l.kind === "fixed").reduce((s, l) => s + l.monthlyRwf, 0);
  const meteredMonth = d.costLines.filter((l) => l.kind === "metered").reduce((s, l) => s + l.monthlyRwf, 0);
  const progress = m.breakEvenRwf > 0 ? Math.min(1, m.revenueRwf / m.breakEvenRwf) : 0;
  const s = d.sprints;
  const allTasks = [...(s.week?.tasks ?? []), ...(s.month?.tasks ?? [])];
  const bn = d.bottleneck;

  const bar = (key: string, label: string, value: number | null, display?: string): Bar => ({ key, label, value: value ?? 0, display: display ?? (value == null ? "—" : num(value)) });

  const statusLabel = labels.prompt.status as Record<string, string>;
  const order = ["processed", "running", "blocked", "pending", "skipped"];

  return {
    overview: {
      price: rwf(m.breakEvenRwf),
      revenue: rwf(m.revenueRwf),
      cost: rwf(m.costRwf),
      net: rwf(m.netRwf),
      netNeg: m.netRwf < 0,
      fixed: rwf(fixedMonth),
      metered: rwf(meteredMonth),
      needed: rwf(m.breakEvenRwf),
      progress,
      progressDisplay: pct(progress),
      projected: rwf(m.projectedNetRwf),
      projectedNeg: m.projectedNetRwf < 0,
      sprintLine:
        s.week || s.month
          ? fill(C.sprintLine, {
              tasks: `${allTasks.filter((t) => t.done).length}/${allTasks.length}`,
              prompts: `${s.prompts.filter((p) => p.status === "processed" || p.status === "skipped").length}/${s.prompts.length}`,
            })
          : null,
      weakest: bn.kind === "step" && bn.rate != null ? fill(C.weakest, { from: stage[bn.from!] ?? bn.from!, to: stage[bn.to!] ?? bn.to!, rate: pct(bn.rate) }) : null,
    },
    sprint:
      s.week || s.month
        ? {
            rings: [
              ...(s.week ? [{ key: "week", label: P.sprintWeek, value: s.week.tasks.length ? s.week.doneTasks / s.week.tasks.length : 0, display: "", sub: fill(P.tasksDone, { done: s.week.doneTasks, total: s.week.tasks.length }) }] : []),
              ...(s.month ? [{ key: "month", label: P.sprintMonth, value: s.month.tasks.length ? s.month.doneTasks / s.month.tasks.length : 0, display: "", sub: fill(P.tasksDone, { done: s.month.doneTasks, total: s.month.tasks.length }) }] : []),
            ].map((r) => ({ ...r, display: pct(r.value) })),
            prompts: s.prompts.map((p) => p.status),
            counts: order.map((st) => ({ status: st, label: statusLabel[st] ?? st, n: s.prompts.filter((p) => p.status === st).length })).filter((c) => c.n > 0),
          }
        : null,
    todo: ([1, 2, 3, 4] as const).map((pr) => bar(`p${pr}`, (labels.todo.priority as Record<string, string>)[String(pr)] ?? "", d.nextSteps.filter((x) => x.priority === pr).length)),
    spend: {
      bars: d.costLines
        .filter((l) => l.kind !== "free" && l.soFarRwf > 0)
        .sort((a, b) => b.soFarRwf - a.soFarRwf)
        .slice(0, 6)
        .map((l) => bar(l.key, (labels.spend.lines as Record<string, { name: string } | undefined>)[l.key]?.name ?? l.key, l.soFarRwf, rwf(l.soFarRwf))),
      total: rwf(d.costLines.reduce((t, l) => t + l.soFarRwf, 0)),
    },
    earn: {
      bars: REVENUE_LINES.map((l) => bar(l, labels.lines[l], m.byLine[l], rwf(m.byLine[l]))),
      target: m.breakEvenRwf,
      targetDisplay: fill(P.earnTarget, { v: rwf(m.breakEvenRwf) }),
      empty: m.revenueRwf === 0,
    },
    flows: Object.fromEntries(
      BLOCKS.map((k) => {
        const b = d.blocks.find((x) => x.key === k);
        const steps = labels.blocks[k].flow;
        return [k, b ? flowOf(b, steps, labels.reasons as Record<string, string>) : { steps, problem: null, reason: null, health: "unknown" as Health }];
      }),
    ) as Record<BlockKey, BlockFlow>,
  };
}
