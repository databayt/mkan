import "server-only";
/**
 * The live feed to Mkan's person — STUB (2026-11-15), filled by the loop lane: one line per deal step to
 * MKAN_REP_WHATSAPP while fewer than 10 deals are PAID (loop-feed-pure.ts), a digest after.
 */
import type { DealEventCtx, DealStep } from "./deal-event-pure";

export async function feedStep(_step: DealStep, _ctx: DealEventCtx, _key: string): Promise<void> {}
