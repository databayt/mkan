"use server";

/**
 * Both ends of unmet demand, by one tap and no account: the tenant leaves a
 * WhatsApp number for an alert, and a broker answers "do you have one?" by
 * sending a home through `/b/d/<token>`. A sent home becomes an unpublished
 * lead (source WEB) the tenant's chat is matched against at once.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { createBrokerHome } from "./broker-home";
import { optInDemand } from "./demand";
import { normalisePhone } from "./demand-pure";
import { ownedBy, requireProfile } from "./profile";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type OptInResult = { ok: true } | { ok: false; error: "phone" | "missing" };

/** "WhatsApp me when it's found": the number goes on this chat's request only. */
export async function optInForDemand(input: { taskId: string; phone: string }): Promise<OptInResult> {
  const phone = normalisePhone(String(input.phone ?? ""));
  if (!phone) return { ok: false, error: "phone" };
  const viewer = await requireProfile();
  const task = await db.agentTask.findFirst({ where: { id: String(input.taskId), ...ownedBy(viewer) }, select: { id: true } });
  if (!task || !(await optInDemand(task.id, phone))) return { ok: false, error: "missing" };
  // Touch the task so an open tab's poll picks the change up.
  await db.agentTask.update({ where: { id: task.id }, data: { updatedAt: new Date() } });
  return { ok: true };
}

/** The ask behind a broker's link, with what the page and the submission need. */
export async function demandAskByToken(token: string) {
  if (!token || token.length > 64) return null;
  return db.outboundMessage.findFirst({
    where: { tokenHash: hash(token), kind: "BROKER_ASK" },
    select: {
      id: true,
      createdAt: true,
      broker: { select: { id: true, name: true, userId: true, phones: true, tiktokHandle: true } },
      tenantRequest: { select: { id: true, taskId: true, requirements: true, locale: true, phone: true, matchedListingIds: true, status: true, expiresAt: true } },
    },
  });
}

const OfferSchema = z.object({
  priceMonth: z.coerce.number().int().min(10_000).max(15_000_000),
  bedrooms: z.coerce.number().int().min(0).max(10),
  bathrooms: z.coerce.number().int().min(1).max(10).optional(),
  place: z.string().trim().min(2).max(80),
  furnished: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
  // The money terms that decide a Kigali deal (all optional).
  homeType: z.enum(["apartment", "house", "room", "studio"]).optional(),
  viewingFee: z.coerce.number().int().min(0).max(100_000).optional(),
  depositMonths: z.coerce.number().min(0).max(12).optional(),
  commissionPct: z.coerce.number().min(0).max(100).optional(),
  waterIncluded: z.boolean().optional(),
  electricityIncluded: z.boolean().optional(),
});

export type OfferResult = { ok: true; matched: boolean } | { ok: false; error: "invalid" | "expired" | "form" | "limit" };

/** A broker's home for a tenant's request: a lead, linked to the broker, matched now. */
export async function submitDemandHome(token: string, input: z.input<typeof OfferSchema>): Promise<OfferResult> {
  const ask = await demandAskByToken(token);
  if (!ask?.broker || !ask.tenantRequest) return { ok: false, error: "invalid" };
  if (ask.tenantRequest.expiresAt < new Date() || !["OPEN", "MATCHED"].includes(ask.tenantRequest.status)) return { ok: false, error: "expired" };
  const parsed = OfferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "form" };
  const res = await createBrokerHome(ask, parsed.data);
  if (!res.ok) return res;
  return { ok: true, matched: res.matched };
}

