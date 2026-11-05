/**
 * Fixed monthly costs the chatbot business carries, in RWF.
 *
 * Estimates until real invoices replace them — the page labels them so. The
 * Claude Max plan is shared engine-wide and is not charged to this business;
 * the agent's metered API spend (ApiSpend) and the TikTok reader's model spend
 * are counted separately as variable cost.
 *
 * Override without a deploy: MONETIZE_FIXED_COSTS_RWF='{"whatsappLine":5000,...}'
 */
export const USD_TO_RWF = Number(process.env.MONETIZE_USD_TO_RWF) > 0 ? Number(process.env.MONETIZE_USD_TO_RWF) : 1450;

export const DEFAULT_FIXED_RWF: Record<string, number> = {
  /**
   * Cloudflare Workers Paid ($5) is one plan shared by every Databayt Worker
   * (22 repos ship a wrangler.jsonc, about 10 carry real traffic). Mkan pays $1,
   * a heavy user's share, not the whole bill (it was charged 5 × 1450 until 2026-11-05).
   */
  cloudflare: 1 * 1450,
  /** The WhatsApp number's SIM and data bundle: the one bill mkan adds on its own. */
  whatsappLine: 5000,
  /**
   * The Mac stays on for engineering whatever mkan does. Mkan adds the minutes of
   * its sweeps, renders and posts each day, so roughly 3,000 a month in power and
   * data, not a share of the whole Mac (it was charged 15,000 until 2026-11-05).
   */
  macAndInternet: 3000,
};

export function fixedCostsRwf(env: string | undefined = process.env.MONETIZE_FIXED_COSTS_RWF): Record<string, number> {
  if (!env) return DEFAULT_FIXED_RWF;
  try {
    const parsed = JSON.parse(env) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "number" && v >= 0) out[k] = v;
    return Object.keys(out).length ? out : DEFAULT_FIXED_RWF;
  } catch {
    return DEFAULT_FIXED_RWF;
  }
}

export const fixedEstimated = (env: string | undefined = process.env.MONETIZE_FIXED_COSTS_RWF) => !env;
