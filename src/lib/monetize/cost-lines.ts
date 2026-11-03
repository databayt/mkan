import { USD_TO_RWF } from "./costs";
import type { BlockKey } from "./types";

/**
 * Every line the chatbot business pays for — or deliberately does not — with the
 * block it serves, so /monetize can show where each franc goes.
 *
 *   fixed    a monthly bill (estimate until invoices replace it), accrued by the
 *            share of the month elapsed
 *   metered  model calls counted as they happen (ApiSpend lanes, the TikTok reader)
 *   free     used every day but charged elsewhere or costing nothing — listed so
 *            the total is honest about what it leaves out
 */
export type CostKind = "fixed" | "metered" | "free";
export interface CostLine {
  key: string;
  kind: CostKind;
  /** Blocks this line serves; the cost is split evenly between them. */
  blocks: BlockKey[];
  /** Full month, RWF (fixed: the bill; metered: projected at this pace; free: 0). */
  monthlyRwf: number;
  /** Charged so far this month, RWF. */
  soFarRwf: number;
  usd?: number;
  calls?: number;
  tokensIn?: number;
  tokensOut?: number;
}

/** Which blocks a fixed line serves. An unknown key (env override) is shared by all four. */
const FIXED_BLOCKS: Record<string, BlockKey[]> = {
  cloudflare: ["chat"],
  whatsappLine: ["chat"],
  macAndInternet: ["scrape", "enhance", "post"],
};

/** ApiSpend lanes → block. Every agent lane is the chat block; eval is testing the chat. */
const LANE_BLOCKS: Record<string, BlockKey[]> = {
  "agent-read": ["chat"],
  "agent-write": ["chat"],
  "agent-eval": ["chat"],
};

/** Used daily, charged nowhere in this business — shown at 0 with the reason. */
export const FREE_LINES: { key: string; blocks: BlockKey[] }[] = [
  { key: "claudeMax", blocks: ["scrape", "enhance", "post", "chat"] },
  { key: "neon", blocks: ["chat"] },
  { key: "waBridge", blocks: ["chat"] },
  { key: "groq", blocks: ["scrape", "chat"] },
  { key: "appleOcr", blocks: ["scrape"] },
];

const ALL: BlockKey[] = ["scrape", "enhance", "post", "chat"];

export interface SpendRow {
  lane: string;
  usd: number;
  calls: number;
  tokensIn: number;
  tokensOut: number;
}

export function costLines(input: {
  fixed: Record<string, number>;
  spend: SpendRow[];
  tiktokUsd: number;
  /** Fraction of the month elapsed, 0–1. */
  monthElapsed: number;
}): CostLine[] {
  const elapsed = Math.min(1, Math.max(input.monthElapsed, 1 / 31));
  const lines: CostLine[] = [];
  for (const [key, monthly] of Object.entries(input.fixed)) {
    lines.push({ key, kind: "fixed", blocks: FIXED_BLOCKS[key] ?? ALL, monthlyRwf: monthly, soFarRwf: Math.round(monthly * elapsed) });
  }
  // One line per lane; "capped" rows are refusals at the cap, not spend.
  const byLane = new Map<string, SpendRow>();
  for (const r of input.spend) {
    if (r.lane === "capped") continue;
    const a = byLane.get(r.lane) ?? { lane: r.lane, usd: 0, calls: 0, tokensIn: 0, tokensOut: 0 };
    byLane.set(r.lane, { lane: r.lane, usd: a.usd + r.usd, calls: a.calls + r.calls, tokensIn: a.tokensIn + r.tokensIn, tokensOut: a.tokensOut + r.tokensOut });
  }
  for (const r of [...byLane.values()].sort((a, b) => b.usd - a.usd)) {
    const soFar = r.usd * USD_TO_RWF;
    lines.push({
      key: r.lane,
      kind: "metered",
      blocks: LANE_BLOCKS[r.lane] ?? ["chat"],
      monthlyRwf: Math.round(soFar / elapsed),
      soFarRwf: Math.round(soFar),
      usd: r.usd,
      calls: r.calls,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
    });
  }
  const tiktok = input.tiktokUsd * USD_TO_RWF;
  lines.push({ key: "tiktokReader", kind: "metered", blocks: ["scrape"], monthlyRwf: Math.round(tiktok / elapsed), soFarRwf: Math.round(tiktok), usd: input.tiktokUsd });
  for (const f of FREE_LINES) lines.push({ key: f.key, kind: "free", blocks: f.blocks, monthlyRwf: 0, soFarRwf: 0 });
  return lines;
}

/** Each block's share of the month's cost so far (lines split evenly over the blocks they serve). */
export function costByBlock(lines: CostLine[]): Record<BlockKey, { soFarRwf: number; monthlyRwf: number }> {
  const out = Object.fromEntries(ALL.map((b) => [b, { soFarRwf: 0, monthlyRwf: 0 }])) as Record<BlockKey, { soFarRwf: number; monthlyRwf: number }>;
  for (const l of lines) {
    if (l.kind === "free" || l.blocks.length === 0) continue;
    for (const b of l.blocks) {
      out[b].soFarRwf += l.soFarRwf / l.blocks.length;
      out[b].monthlyRwf += l.monthlyRwf / l.blocks.length;
    }
  }
  for (const b of ALL) {
    out[b].soFarRwf = Math.round(out[b].soFarRwf);
    out[b].monthlyRwf = Math.round(out[b].monthlyRwf);
  }
  return out;
}
