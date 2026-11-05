import type { BlockKey, BlockView, Unit } from "./types";

/**
 * What success means for each block — the targets /monetize checks every number against.
 * Set from the break-even goal (two paid deals a week, a home posted every day); change them here.
 *
 *   op ">=": at least the target · "<=": at most
 *   per "week": the target is for 7 days and scales with the page's window; "sweep": per run
 */
export interface SuccessTarget {
  kpi: string;
  op: ">=" | "<=";
  target: number;
  per?: "week" | "sweep";
}

export const SUCCESS: Record<BlockKey, SuccessTarget[]> = {
  scrape: [
    { kpi: "newHomes", op: ">=", target: 35, per: "week" }, // 5 a day keeps /find fresh
    { kpi: "read", op: ">=", target: 20, per: "sweep" },
    { kpi: "skipRate", op: "<=", target: 0.5 },
    { kpi: "newBrokers", op: ">=", target: 1, per: "sweep" },
  ],
  enhance: [
    { kpi: "videosClean", op: ">=", target: 21, per: "week" }, // three clean broker videos for three posts a day
    { kpi: "videoRejectRate", op: "<=", target: 0.3 },
    { kpi: "brokerVideosPerDay", op: ">=", target: 3 },
  ],
  post: [
    { kpi: "postedDays7", op: ">=", target: 7 },
    { kpi: "viewsPerPost", op: ">=", target: 200 },
    { kpi: "likeRate", op: ">=", target: 0.03 },
    { kpi: "adChatRate", op: ">=", target: 0.01 },
    { kpi: "postsListing", op: ">=", target: 21, per: "week" }, // one listing per post, three a day
    { kpi: "contactsPerPost", op: ">=", target: 1 },
  ],
  chat: [
    { kpi: "paidDeals", op: ">=", target: 2, per: "week" }, // the month's goal: two paid deals a week
    { kpi: "chats", op: ">=", target: 20, per: "week" },
    { kpi: "shortlistRate", op: ">=", target: 0.8 },
    { kpi: "brokerAnswerRate", op: ">=", target: 0.3 },
    { kpi: "p50", op: "<=", target: 3000 },
    { kpi: "failRate", op: "<=", target: 0.05 },
  ],
};

export type SuccessStatus = "met" | "missed" | "unknown";
export interface SuccessView {
  kpi: string;
  op: ">=" | "<=";
  target: number;
  per?: "week" | "sweep";
  unit: Unit;
  value: number | null;
  status: SuccessStatus;
  /** How far toward the target, 0–1 (a ≤ target past its limit shrinks toward 0). */
  progress: number;
}

export function successFor(block: BlockView, days = 7): SuccessView[] {
  return SUCCESS[block.key].map((t) => {
    const k = block.kpis.find((x) => x.key === t.kpi);
    const value = k?.value ?? null;
    const target = t.per === "week" ? Math.round(t.target * (days / 7) * 100) / 100 : t.target;
    const unit = k?.unit ?? "count";
    if (value == null || !Number.isFinite(value)) return { ...t, target, unit, value: null, status: "unknown" as const, progress: 0 };
    const met = t.op === ">=" ? value >= target : value <= target;
    const progress = t.op === ">=" ? (target > 0 ? Math.min(1, value / target) : 1) : value <= target ? 1 : Math.max(0, Math.min(1, target / value));
    return { ...t, target, unit, value, status: met ? ("met" as const) : ("missed" as const), progress };
  });
}
