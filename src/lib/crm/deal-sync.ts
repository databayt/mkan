import "server-only";
/**
 * A deal step → a CrmOp for Twenty, the CRM of record — STUB (2026-11-15), filled by the CRM lane.
 * Callers never wait on Twenty: each function only queues a CrmOp (and kicks the drain).
 */
import type { DealEventCtx, DealStep } from "@/components/agent/deal-event-pure";

/** A deal moved: upsert Twenty's `deal` (stage + the facts in ctx), and its viewing Task on VIEWING_BOOKED. */
export async function crmStep(_step: DealStep, _ctx: DealEventCtx, _key: string): Promise<void> {}

/** Mkan's person wrote a note on a deal ("note K5811 …"): a Twenty note on that deal. */
export async function crmNote(_key: string, _text: string): Promise<void> {}

/** Fields on the deal that are not a step ("cost K5811 3000" → tripCostRwf). */
export async function crmDealPatch(_key: string, _fields: { tripCostRwf?: number | null; notes?: string | null }): Promise<void> {}
