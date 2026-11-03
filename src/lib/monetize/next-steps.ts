import type { Bottleneck } from "./bottleneck";
import type { MoneyView } from "./money";
import type { BlockKey, BlockView } from "./types";

/**
 * "What to do next to make money" — a to-do list derived from the live numbers,
 * not typed by hand: every item names the evidence that raised it and the
 * condition that clears it, so it falls off the list by itself once the data
 * says it is done. Ordered by how directly it moves cash.
 *
 *   1 money   — revenue is waiting on this
 *   2 unblock — a block is broken or the funnel is cut
 *   3 grow    — the weakest step, more reach
 *   4 books   — keeping the numbers honest
 */
export type StepPriority = 1 | 2 | 3 | 4;
export interface NextStep {
  key: string;
  priority: StepPriority;
  block: BlockKey | null;
  /** Placeholder values for the dictionary text ({n}, {job}, …). */
  vars: Record<string, string | number>;
}

export interface NextStepInput {
  money: MoneyView;
  blocks: BlockView[];
  bottleneck: Bottleneck;
  gates: { brokerSends: string; capped: boolean };
  fixedEstimated: boolean;
  /** Chats that reached a shortlist this window — tenants a viewing could come from. */
  shortlisted: number;
  paidDealsMonth: number;
}

const kpi = (b: BlockView | undefined, key: string) => b?.kpis.find((k) => k.key === key)?.value ?? null;

export function nextSteps(i: NextStepInput): NextStep[] {
  const out: NextStep[] = [];
  const block = (k: BlockKey) => i.blocks.find((b) => b.key === k);

  // ── 1 money ───────────────────────────────────────────────────────────
  if (i.money.unrecordedRwf > 0) out.push({ key: "recordMoney", priority: 1, block: "chat", vars: { amount: i.money.unrecordedRwf } });
  if (i.gates.brokerSends !== "gated") out.push({ key: "brokerSends", priority: 1, block: "chat", vars: { mode: i.gates.brokerSends } });
  if (i.paidDealsMonth === 0) out.push({ key: "firstDeal", priority: 1, block: "chat", vars: { n: i.shortlisted } });
  if (i.money.revenueRwf < i.money.breakEvenRwf) {
    out.push({ key: "breakEven", priority: 1, block: null, vars: { need: i.money.breakEvenRwf, have: i.money.revenueRwf } });
  }

  // ── 2 unblock ─────────────────────────────────────────────────────────
  for (const b of i.blocks) {
    for (const j of b.jobs) {
      if (j.status === "fail" || j.status === "stale") {
        out.push({ key: j.status === "fail" ? "jobFailed" : "jobStale", priority: 2, block: b.key, vars: { job: j.job.replace(/^hermes_/, ""), detail: j.summary ?? "" } });
      }
    }
  }
  if (i.gates.capped) out.push({ key: "capped", priority: 2, block: "chat", vars: {} });
  const failRate = kpi(block("chat"), "failRate");
  if (failRate != null && failRate > 0.2) out.push({ key: "failRate", priority: 2, block: "chat", vars: { pct: Math.round(failRate * 100) } });

  // ── 3 grow ────────────────────────────────────────────────────────────
  const bn = i.bottleneck;
  if (bn.kind === "step" && bn.rate != null && bn.floor != null && bn.rate < bn.floor) {
    out.push({ key: "bottleneck", priority: 3, block: (bn.block as BlockKey) ?? null, vars: { from: bn.from ?? "", to: bn.to ?? "", rate: Math.round(bn.rate * 100), floor: Math.round(bn.floor * 100) } });
  }
  const postedDays = kpi(block("post"), "postedDays7");
  if (postedDays != null && postedDays < 7) out.push({ key: "postDaily", priority: 3, block: "post", vars: { n: postedDays } });

  // ── 4 books ───────────────────────────────────────────────────────────
  if (i.fixedEstimated) out.push({ key: "invoices", priority: 4, block: null, vars: {} });

  return out.sort((a, b) => a.priority - b.priority);
}
