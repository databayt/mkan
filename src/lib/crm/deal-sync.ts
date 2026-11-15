import "server-only";
/**
 * A deal step → a CrmOp for Twenty, the CRM of record — STUB (2026-11-15), filled by the CRM lane.
 */
import type { DealEventCtx, DealStep } from "@/components/agent/deal-event-pure";

export async function crmStep(_step: DealStep, _ctx: DealEventCtx, _key: string): Promise<void> {}
