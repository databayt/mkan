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
   * Cloudflare: mkan's share of the shared Workers Paid plan ($1 of $5) plus its own always-on
   * Container — standard-1 (½ vCPU, 4 GiB, 8 GB) billed on provisioned memory and disk every
   * second: 4 GiB × 720 h − 25 included = $25.70, ~5% CPU $2.14, disk $1.40 ≈ $29.24/month
   * (Cloudflare Containers pricing, 2026-10-05; docs/costs-2026-11.md). It was $1 until 2026-11-05,
   * which left the container out. Moving mkan to a plain Worker (OpenNext) would remove the $29.
   */
  cloudflare: Math.round((1 + 29.24) * USD_TO_RWF),
  /**
   * The database (Neon, Launch plan): its compute never slept — 0.25 CU around the clock since 10-26,
   * 6 CU-hours a day × $0.106 ≈ $19.4/month, measured 2026-11-07 (get_project_consumption). It was
   * shown as free. Branches cost nothing since 11-07: the 9 archived ones were deleted, and the 3 restore
   * points left are inside the plan's 9 free child branches (they cost ≈ $4.5/month before). Re-estimate
   * once the event-driven outbox and the Mac's beats on the app's ticks show how long it now sleeps.
   */
  neon: Math.round(19.4 * USD_TO_RWF),
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
    // Merged over the defaults: an override that names one bill must not drop the others (2026-11-06).
    const out: Record<string, number> = { ...DEFAULT_FIXED_RWF };
    for (const [k, v] of Object.entries(parsed)) if (typeof v === "number" && v >= 0) out[k] = v;
    return out;
  } catch {
    return DEFAULT_FIXED_RWF;
  }
}

export const fixedEstimated = (env: string | undefined = process.env.MONETIZE_FIXED_COSTS_RWF) => !env;
