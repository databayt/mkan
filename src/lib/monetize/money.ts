import { USD_TO_RWF } from "./costs";

export const REVENUE_LINES = ["COMMISSION", "VIEWING_FEE", "SUBSCRIPTION", "LICENSE"] as const;
export type RevenueLineKey = (typeof REVENUE_LINES)[number];

export interface MoneyInput {
  /** RWF received this month, per line (RevenueEntry). */
  received: Partial<Record<RevenueLineKey, number>>;
  /** RWF the Deal table says is owed or earned (PAID deals' mkanShare + viewing fees) — the cross-check. */
  dealEarnedRwf: number;
  apiUsd: number;
  tiktokUsd: number;
  fixedRwf: number;
  chats: number;
  leads: number;
  paidDeals: number;
  /** Fraction of the month elapsed, 0–1, for the run-rate. */
  monthElapsed: number;
}

export interface MoneyView {
  revenueRwf: number;
  byLine: Record<RevenueLineKey, number>;
  variableCostRwf: number;
  fixedCostRwf: number;
  costRwf: number;
  netRwf: number;
  /** revenue ÷ cost; null with no cost to divide by. */
  roi: number | null;
  costPerChatRwf: number | null;
  costPerLeadRwf: number | null;
  costPerDealRwf: number | null;
  /** Deal-table earnings not yet recorded as received — money to chase. */
  unrecordedRwf: number;
  /** Revenue needed per month to break even at the current cost run-rate. */
  breakEvenRwf: number;
  /** Projected month-end net at the current pace. */
  projectedNetRwf: number;
}

const per = (cost: number, n: number) => (n > 0 ? Math.round(cost / n) : null);

export function money(i: MoneyInput): MoneyView {
  const byLine = Object.fromEntries(REVENUE_LINES.map((l) => [l, Math.max(0, i.received[l] ?? 0)])) as Record<RevenueLineKey, number>;
  const revenueRwf = REVENUE_LINES.reduce((s, l) => s + byLine[l], 0);
  const variableCostRwf = Math.round((i.apiUsd + i.tiktokUsd) * USD_TO_RWF);
  const elapsed = Math.min(1, Math.max(i.monthElapsed, 1 / 31));
  // Fixed costs accrue through the month; charge the elapsed share so ROI isn't punished on day 1.
  const fixedCostRwf = Math.round(i.fixedRwf * elapsed);
  const costRwf = variableCostRwf + fixedCostRwf;
  const deals = byLine.COMMISSION + byLine.VIEWING_FEE;
  return {
    revenueRwf,
    byLine,
    variableCostRwf,
    fixedCostRwf,
    costRwf,
    netRwf: revenueRwf - costRwf,
    roi: costRwf > 0 ? revenueRwf / costRwf : null,
    costPerChatRwf: per(costRwf, i.chats),
    costPerLeadRwf: per(costRwf, i.leads),
    costPerDealRwf: per(costRwf, i.paidDeals),
    unrecordedRwf: Math.max(0, i.dealEarnedRwf - deals),
    breakEvenRwf: Math.round(i.fixedRwf + variableCostRwf / elapsed),
    projectedNetRwf: Math.round(revenueRwf / elapsed - (i.fixedRwf + variableCostRwf / elapsed)),
  };
}
