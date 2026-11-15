import "server-only";
/**
 * One deal step, told once (2026-11-15). Every function that moves a deal calls `dealEvent` — the pick,
 * the broker's ask and answer, the viewing time, the booking, the close words — and it does two things:
 *
 *   1. the feed: one line to Mkan's person (MKAN_REP_WHATSAPP), live until 10 deals are PAID
 *      (loop-feed.ts) — Abdout watches every deal and goes to every viewing;
 *   2. the record: a CrmOp for Twenty, the CRM of record (src/lib/crm/deal-sync.ts).
 *
 * One place, so the feed and Twenty can never tell two stories. It never throws: a Slack, WhatsApp or
 * Twenty failure must not fail the step that called it.
 */
import { feedStep } from "./loop-feed";
import { crmStep } from "@/lib/crm/deal-sync";
import { dealKey, type DealEventCtx, type DealStep } from "./deal-event-pure";

export { dealKey, DEAL_STEPS, type DealEventCtx, type DealStep } from "./deal-event-pure";

export async function dealEvent(step: DealStep, ctx: DealEventCtx): Promise<void> {
  const full: DealEventCtx = { ...ctx, at: ctx.at ?? new Date() };
  const key = dealKey(full);
  const results = await Promise.allSettled([feedStep(step, full, key), crmStep(step, full, key)]);
  for (const r of results) {
    if (r.status === "rejected") console.error(`[deal-event] ${step} ${key}:`, r.reason);
  }
}
