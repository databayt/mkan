/**
 * The deal steps and the deal's key — pure, shared by deal-event.ts, the feed and the CRM sync (2026-11-15).
 */

/** Where a deal stands, from a tenant's pick to Mkan's share in hand. Twenty's `deal.stage` uses the same words. */
export const DEAL_STEPS = [
  "PICKED", //          a tenant picked a home (a digit, "check", a K-code then yes)
  "BROKER_ASKED", //    the line asked the home's broker if it is free
  "BROKER_YES", //      the broker said it is (or "taken" → LOST)
  "TIME_PROPOSED", //   a viewing time is on the table (the tenant's or the broker's)
  "VIEWING_BOOKED", //  both agreed: a ListingVisit and a Deal exist
  "VIEWED", //          the viewing took place
  "SIGNED", //          the lease is signed: the share request goes out
  "PAID", //            the broker paid Mkan's share
  "LOST", //            it will not happen (and why)
  "STALLED", //         nobody moved: a quiet tenant, a silent broker, a chat that failed
] as const;
export type DealStep = (typeof DEAL_STEPS)[number];

export interface DealEventCtx {
  listingId: number;
  /** The chat (AgentTask) the deal grew from — with the listing, the deal's key before a Deal row exists. */
  taskId?: string | null;
  /** The Deal row, once a viewing is booked. */
  dealId?: string | null;
  /** The tenant's number, "+250…", when there is one. */
  tenantPhone?: string | null;
  tenantName?: string | null;
  brokerId?: string | null;
  /** When the step happened (default: now). */
  at?: Date;
  /** The viewing's time, on TIME_PROPOSED / VIEWING_BOOKED. */
  viewingAt?: Date | null;
  meetingPoint?: string | null;
  /** Free words for the step: a lost reason, why it stalled, the rep's note. */
  note?: string | null;
  /** How long the step took, in hours (a broker's answer). */
  hours?: number | null;
  /** Which time this step is reported (a stall the line followed up twice): each one is its own feed line. */
  n?: number | null;
  /** Money on SIGNED / PAID, RWF. */
  rent?: number | null;
  share?: number | null;
}

/**
 * The deal's one key, stable from the pick to the payment: "<taskId>:<listingId>" while there is a chat
 * (a Deal carries both, so the booked deal keeps the key of its pick), else "deal:<dealId>", else the home.
 */
export function dealKey(ctx: Pick<DealEventCtx, "taskId" | "dealId" | "listingId">): string {
  if (ctx.taskId) return `${ctx.taskId}:${ctx.listingId}`;
  if (ctx.dealId) return `deal:${ctx.dealId}`;
  return `home:${ctx.listingId}`;
}
