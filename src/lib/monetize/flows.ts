/**
 * The four blocks as real flowcharts (Abdout, 2026-11-07: "actual flow charts for each block").
 * Pure data, traced from the code each step runs:
 *   scrape  — scripts/crm/tiktok.ts sweep (06:00 · 18:00), the reader + its rental gate (tiktok-pure.ts),
 *             Twenty → Prisma draft copy, the 09:00 demand match + broker directory
 *   enhance — tt:run's pick gate (tiktok-post-pure.ts), the strip render, the strict no-text check
 *   post    — the 07:00 · 12:30 · 18:30 uploads (tiktok-upload.ts), the TikTokPost ledger, 21:00 stats
 *   chat    — /find + WhatsApp turn, broker gate + outbox (08:00–20:00, hand-on after 3 h), deal sheet,
 *             booking, after-viewing reply, PAID → COMMISSION
 * Labels live in the dictionary (monetize.flows.<block>.<id>: t = text, when = schedule, n = number).
 * A node's number is a live metric key (readMetrics, the same keys the sprint loop measures).
 */
import { readMetrics } from "./metrics";
import type { MonetizeOverview } from "./load";
import type { BlockKey, Unit } from "./types";

export type FlowKind = "start" | "step" | "decision" | "end";

export interface FlowNum {
  key: string;
  unit: Unit;
}

/** A decision's other way out: a loss (the item stops), a wait (it is held), a loop (it goes round again). */
export interface FlowExit {
  id: string;
  tone: "loss" | "wait" | "loop";
  num?: FlowNum;
}

export interface FlowNode {
  id: string;
  kind: FlowKind;
  num?: FlowNum;
  exit?: FlowExit;
  /** The answer that carries on down the chart (the exit takes the other). Default "yes". */
  main?: "yes" | "no";
}

const n = (key: string, unit: Unit = "count"): FlowNum => ({ key, unit });

export const FLOWS: Record<BlockKey, FlowNode[]> = {
  scrape: [
    { id: "sweep", kind: "start", num: n("found") },
    { id: "fetch", kind: "step" },
    { id: "read", kind: "step", num: n("read") },
    { id: "rental", kind: "decision", exit: { id: "skipped", tone: "loss", num: n("skipRate", "pct") } },
    { id: "save", kind: "step", num: n("newHomes") },
    { id: "copied", kind: "decision", exit: { id: "failed", tone: "loss" } },
    { id: "directory", kind: "end", num: n("brokersTotal") },
  ],
  enhance: [
    { id: "pick", kind: "start", num: n("readyNew") },
    { id: "fit", kind: "decision", exit: { id: "waits", tone: "wait" } },
    { id: "consent", kind: "decision", exit: { id: "ask", tone: "wait" } },
    { id: "strip", kind: "step", num: n("videosFeatured") },
    { id: "mute", kind: "step" },
    { id: "text", kind: "decision", main: "no", exit: { id: "rejected", tone: "loss", num: n("videoRejectRate", "pct") } },
    { id: "clean", kind: "end", num: n("videosClean") },
  ],
  post: [
    { id: "slots", kind: "start", num: n("postedDays7") },
    { id: "upload", kind: "step" },
    { id: "confirmed", kind: "decision", exit: { id: "retry", tone: "loop", num: n("failedUploads7") } },
    { id: "row", kind: "step", num: n("postsListing") },
    { id: "stats", kind: "step", num: n("viewsPerPost") },
    { id: "code", kind: "decision", exit: { id: "viewOnly", tone: "wait" } },
    { id: "chat", kind: "end", num: n("tiktokChats7") },
  ],
  chat: [
    { id: "writes", kind: "start", num: n("stage.chats") },
    { id: "reads", kind: "step", num: n("p50", "ms") },
    { id: "shortlist", kind: "step", num: n("stage.shortlisted") },
    { id: "picked", kind: "decision", exit: { id: "askNumber", tone: "wait" } },
    { id: "ask", kind: "step", num: n("brokersAsked") },
    { id: "answered", kind: "decision", num: n("brokerAnswerRate", "pct"), exit: { id: "nextBroker", tone: "loop" } },
    { id: "available", kind: "decision", num: n("brokersAvailable"), exit: { id: "taken", tone: "loss" } },
    { id: "sheet", kind: "step" },
    { id: "book", kind: "step", num: n("viewingsBooked") },
    { id: "signed", kind: "decision", exit: { id: "lost", tone: "loss" } },
    { id: "paid", kind: "end", num: n("paidDeals") },
  ],
};

/** Every node and exit id per block — the dictionary must label each (tests/monetize/flows.test.ts). */
export function flowIds(block: BlockKey): string[] {
  return FLOWS[block].flatMap((x) => [x.id, ...(x.exit ? [x.exit.id] : [])]);
}

/** The live numbers the charts show, by metric key. */
export function flowNumbers(data: MonetizeOverview): Record<string, number | null> {
  const m = readMetrics(data as Parameters<typeof readMetrics>[0]);
  const out: Record<string, number | null> = {};
  for (const nodes of Object.values(FLOWS)) {
    for (const x of nodes) {
      for (const num of [x.num, x.exit?.num]) {
        if (!num) continue;
        const v = m[num.key];
        out[num.key] = typeof v === "number" && Number.isFinite(v) ? v : null;
      }
    }
  }
  return out;
}

/** The hand-off between two blocks: the share of one block's output that the next one takes in. */
export interface Handoff {
  from: BlockKey;
  to: BlockKey;
  rate: number | null;
  /** The weakest hand-off (bottleneck.ts) sits here. */
  weakest: boolean;
}

const STAGE_PAIRS: { from: BlockKey; to: BlockKey; a: string; b: string }[] = [
  { from: "scrape", to: "enhance", a: "homes", b: "ready" },
  { from: "enhance", to: "post", a: "ready", b: "posted" },
  { from: "post", to: "chat", a: "views", b: "chats" },
];

export function handoffs(data: Pick<MonetizeOverview, "stages" | "bottleneck">): Handoff[] {
  const count = (k: string) => data.stages.find((s) => s.key === k)?.count ?? null;
  const bn = data.bottleneck.kind === "step" ? data.bottleneck : null;
  return STAGE_PAIRS.map(({ from, to, a, b }) => {
    const x = count(a);
    const y = count(b);
    return { from, to, rate: x && y != null ? y / x : null, weakest: !!bn && bn.from === a && bn.to === b };
  });
}

/** The block a reader should open first: the one holding the weakest hand-off, else Chat (the money). */
export function firstBlock(data: Pick<MonetizeOverview, "bottleneck">): BlockKey {
  const b = data.bottleneck.kind === "step" ? data.bottleneck.block : null;
  return b === "scrape" || b === "enhance" || b === "post" || b === "chat" ? b : "chat";
}
