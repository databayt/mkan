import "server-only"

import { randomUUID } from "node:crypto"

import { db } from "@/lib/db"
import { logger } from "@/lib/logger"
import { SETUP_STATE_KEY, stepDone, type SetupState } from "@/lib/monetize/setup"

import { getRequestToPayStatus, MomoError, requestToPay } from "./client"
import { getMomoConfig, isSandbox, toMomoPayer, type MomoConfig } from "./config"

/**
 * Mkan's share by MoMo request-to-pay. One attempt = one MoMo reference (a UUID), kept in WaState
 * `momo-rtp:<ref>` so no migration is needed. The callback body is never trusted: it only names the
 * reference, and the status is re-read from MTN. The first writer to move an attempt PENDING →
 * SUCCESSFUL (one atomic UPDATE) marks the deal paid and records COMMISSION; a repeated callback finds
 * nothing to move and does nothing. A failure moves PENDING → FAILED/REJECTED/TIMEOUT and the deal
 * stays SIGNED, so a new request can follow.
 */
export const attemptKey = (ref: string) => `momo-rtp:${ref}`;
/** A deal written for the sandbox proof carries this marker: the sandbox never settles a real deal. */
export const SANDBOX_DEAL_MARK = "[sandbox-test]";

export type Attempt = {
  dealId: string;
  amount: number;
  sandbox: boolean;
  status: "PENDING" | "SUCCESSFUL" | "FAILED" | "REJECTED" | "TIMEOUT";
  financialTransactionId?: string | null;
  reason?: string | null;
  at: string;
  settledAt?: string;
};

export class MomoShareError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = "MomoShareError";
  }
}

/** Sandbox always; production only after Abdout ticked "MoMo API live" (setup.momoApi). */
export async function momoGate(config: MomoConfig | null = getMomoConfig()): Promise<{ config: MomoConfig; sandbox: boolean }> {
  if (!config) throw new MomoShareError("MOMO_NOT_CONFIGURED");
  const sandbox = isSandbox(config);
  if (!sandbox) {
    const row = await db.waState.findUnique({ where: { key: SETUP_STATE_KEY }, select: { value: true } }).catch(() => null);
    if (!stepDone(row?.value as SetupState | null | undefined, "momoApi")) throw new MomoShareError("MOMO_PRODUCTION_BLOCKED");
  }
  return { config, sandbox };
}

/** The mode the Deals card shows: null (off), "sandbox", or "production" once setup.momoApi is ticked. */
export async function momoMode(): Promise<"sandbox" | "production" | null> {
  try {
    const { sandbox } = await momoGate();
    return sandbox ? "sandbox" : "production";
  } catch {
    return null;
  }
}

/** Sends the prompt for a signed deal's share. Returns the MoMo reference. */
export async function sendShareByMomo(dealId: string, amountRwf?: number | null): Promise<{ ref: string; sandbox: boolean; amount: number }> {
  const { config, sandbox } = await momoGate();
  const deal = await db.deal.findUnique({
    where: { id: dealId },
    select: { status: true, mkanShare: true, notes: true, listingId: true, broker: { select: { phones: true, whatsapp: true } } },
  });
  if (!deal || deal.status !== "SIGNED") throw new MomoShareError("DEAL_NOT_SIGNED");
  if (sandbox && !deal.notes?.includes(SANDBOX_DEAL_MARK)) throw new MomoShareError("SANDBOX_REAL_DEAL");
  const amount = Math.round(amountRwf ?? deal.mkanShare ?? 0);
  if (!(amount > 0)) throw new MomoShareError("NO_SHARE");
  const payer = toMomoPayer(deal.broker?.whatsapp ?? deal.broker?.phones?.[0], sandbox);
  if (!payer) throw new MomoShareError("NO_MTN_PAYER");

  // One prompt at a time: a pending request for this deal is answered first.
  const open = await db.waState.findMany({ where: { key: { startsWith: "momo-rtp:" } }, select: { value: true } });
  const cutoff = Date.now() - 24 * 3_600_000;
  if (open.some((r) => { const a = r.value as unknown as Attempt; return a.dealId === dealId && a.status === "PENDING" && Date.parse(a.at) > cutoff; })) {
    throw new MomoShareError("REQUEST_PENDING");
  }

  const ref = randomUUID();
  const attempt: Attempt = { dealId, amount, sandbox, status: "PENDING", at: new Date().toISOString() };
  await db.waState.create({ data: { key: attemptKey(ref), value: attempt as never } });
  try {
    await requestToPay(config, {
      referenceId: ref,
      amount,
      payer,
      externalId: `K${deal.listingId}`,
      message: `Mkan share K${deal.listingId}`,
    });
  } catch (e) {
    // No prompt went out: the attempt is dead, not pending.
    await db.waState.update({ where: { key: attemptKey(ref) }, data: { value: { ...attempt, status: "FAILED", reason: e instanceof MomoError ? e.code : "ERROR" } as never } });
    throw e;
  }
  if (amount !== deal.mkanShare) await db.deal.update({ where: { id: dealId }, data: { mkanShare: amount } });
  logger.info("momo:share-request", { dealId, ref, amount, sandbox });
  return { ref, sandbox, amount };
}

export type SettleResult = "paid" | "already" | "failed" | "pending" | "unknown";

/** Re-reads the request from MTN and settles it once. Safe to call any number of times. */
export async function settleByReference(ref: string): Promise<SettleResult> {
  const row = await db.waState.findUnique({ where: { key: attemptKey(ref) }, select: { value: true } });
  if (!row) return "unknown";
  const attempt = row.value as unknown as Attempt;
  if (attempt.status !== "PENDING") return attempt.status === "SUCCESSFUL" ? "already" : "failed";

  const { config } = await momoGate();
  const state = await getRequestToPayStatus(config, ref);
  if (state.status === "PENDING") return "pending";

  const next: Attempt = { ...attempt, status: state.status, financialTransactionId: state.financialTransactionId, reason: state.reason, settledAt: new Date().toISOString() };
  // The claim: only the writer that still sees PENDING moves it. A repeated callback gets 0 rows.
  const n = await db.$executeRaw`UPDATE "WaState" SET value = ${JSON.stringify(next)}::jsonb, "updatedAt" = now() WHERE key = ${attemptKey(ref)} AND value->>'status' = 'PENDING'`;
  // Lost the race: someone else settled it a moment ago.
  if (n !== 1) return "already";
  if (state.status !== "SUCCESSFUL") {
    logger.info("momo:share-failed", { dealId: attempt.dealId, ref, status: state.status, reason: state.reason });
    return "failed";
  }
  try {
    const { setDealStatus } = await import("@/components/agent/deal");
    // setDealStatus writes the COMMISSION entry once per deal (it checks first); the claim above makes it one call.
    await setDealStatus(attempt.dealId, "PAID", { mkanShare: attempt.amount, notes: `paid by MoMo ${attempt.sandbox ? "(sandbox) " : ""}ref ${ref.slice(0, 8)}` });
  } catch (e) {
    // Hand the claim back so MTN's retry (or the next callback) finishes the job.
    await db.$executeRaw`UPDATE "WaState" SET value = ${JSON.stringify(attempt)}::jsonb WHERE key = ${attemptKey(ref)}`;
    throw e;
  }
  logger.info("momo:share-paid", { dealId: attempt.dealId, ref, amount: attempt.amount, sandbox: attempt.sandbox });
  return "paid";
}
