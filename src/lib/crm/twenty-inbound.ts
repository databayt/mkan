import "server-only";
/**
 * Twenty → mkan (2026-11-15): the webhook's handlers for the objects mkan owns jointly with Twenty. A
 * person's edit acts here and now; the nightly `crm:reconcile` is only the safety net.
 *
 * Twenty gives a webhook 5 seconds and no retries: each handler is a few indexed queries and one write.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { phonesFromTwenty } from "@/lib/phone";
import type { TwentyEvent } from "@/lib/twenty-webhook";
import { isEcho } from "./crm-ops-pure";
import { parseDealKey } from "./deal-sync-pure";
import { bySystem, dealEdits, dealKeyOf, dealStatusAction, digitsOf, isOptOutOn, withTermsNote } from "./inbound-pure";
import { twentyBrokerState } from "./broker-edit-pure";
import { humanEdit } from "../../../scripts/crm/brokers-pure";

export type Handled = Record<string, unknown>;

const linkByTwentyId = (object: string, twentyId: string) => db.crmLink.findFirst({ where: { object, twentyId } });

async function dealRowFor(key: string) {
  const p = parseDealKey(key);
  if (!p) return null;
  const select = { id: true, status: true, visitId: true, notes: true, mkanShare: true, listingId: true } as const;
  if (p.kind === "deal") return db.deal.findUnique({ where: { id: p.dealId }, select });
  if (p.kind === "task") return db.deal.findFirst({ where: { taskId: p.taskId, listingId: p.listingId }, select });
  return db.deal.findFirst({ where: { listingId: p.listingId }, orderBy: { createdAt: "desc" }, select });
}

/** deal.updated — stage, terms, viewing time, Mkan's share, trip cost. */
export async function onDealUpdated(evt: TwentyEvent): Promise<Handled> {
  const { record, updatedFields } = evt;
  const link = await linkByTwentyId("deal", String(record.id));
  if (isEcho(updatedFields, link)) return { received: true, ignored: "echo" };
  const key = dealKeyOf(link?.key, record);
  if (!key) return { received: true, matched: false, reason: "no mkanKey" };
  const deal = await dealRowFor(key);
  // Before a viewing is booked there is no Deal row — the pick lives in the chat; nothing to act on yet.
  if (!deal) return { received: true, matched: false, reason: "no Deal row yet", key };

  const edits = dealEdits(record, updatedFields);
  const data: Prisma.DealUpdateInput = {};
  if (edits.mkanShare !== undefined) data.mkanShare = edits.mkanShare;
  if (edits.tripCost !== undefined) data.tripCost = edits.tripCost;
  if (edits.terms !== undefined) data.notes = withTermsNote(deal.notes, edits.terms);
  if (Object.keys(data).length) await db.deal.update({ where: { id: deal.id }, data });
  if (edits.viewingAt && deal.visitId) {
    // The new time restarts the reminders (24 h / 2 h) that the old one may already have used up.
    await db.listingVisit.update({ where: { id: deal.visitId }, data: { scheduledFor: edits.viewingAt, reminders: [] } });
  }

  let status: string | null = null;
  if (updatedFields.includes("stage")) {
    const word = dealStatusAction(record.stage, deal.status);
    if (word) {
      const { setDealStatus } = await import("@/components/agent/deal");
      try {
        await setDealStatus(deal.id, word, {
          mkanShare: edits.mkanShare ?? (record.mkanShareRwf != null ? Number(record.mkanShareRwf) : null),
          notes: word === "LOST" && typeof record.lostReason === "string" ? record.lostReason : null,
        });
        status = word;
      } catch (e) {
        // SIGNED / PAID with no share anywhere: setDealStatus throws before writing. Tell a person instead of dropping it.
        const { postSlackCard } = await import("@/components/agent/whatsapp");
        await postSlackCard(`⚠ Twenty moved K${deal.listingId} to ${word}, but mkan could not follow: ${(e as Error).message}. Set the share on the deal in Twenty (or the broker's agreement) and move it again.`).catch(() => {});
        logger.warn("twenty_webhook_deal_status_refused", { dealId: deal.id, word, error: (e as Error).message });
        return { received: true, matched: true, dealId: deal.id, refused: word };
      }
    }
  }
  return { received: true, matched: true, dealId: deal.id, status, fields: Object.keys(edits) };
}

/** tenant.updated — optOut ON is a STOP: the same writes the line makes when a tenant sends STOP. */
export async function onTenantUpdated(evt: TwentyEvent): Promise<Handled> {
  const { record, updatedFields } = evt;
  const link = await linkByTwentyId("tenant", String(record.id));
  if (isEcho(updatedFields, link)) return { received: true, ignored: "echo" };
  if (!isOptOutOn(record, updatedFields)) return { received: true, matched: true, acted: false };
  const phones = [...phonesFromTwenty(record.whatsapp, "RW"), ...phonesFromTwenty(record.phone, "RW")];
  const digits = digitsOf(phones);
  if (digits.length === 0) return { received: true, matched: false, reason: "no phone" };
  // wa-tenant.ts does `addToList("tenant-stop", m.phone)` then `silenceTenant(m.phone)` (whatsapp-chat.ts); same here.
  const { addToList } = await import("@/components/agent/wa-state");
  const { silenceTenant } = await import("@/components/agent/whatsapp-chat");
  for (const d of digits) {
    await addToList("tenant-stop", d);
    await silenceTenant(d);
  }
  logger.info("twenty_webhook_tenant_stop", { count: digits.length });
  return { received: true, matched: true, acted: "stop", phones: digits.length };
}

/** broker.updated — relationship, share, agreement and opt-out reach Prisma now, not with the daily crm:brokers run. */
export async function onBrokerUpdated(evt: TwentyEvent): Promise<Handled> {
  const { record } = evt;
  // crm:brokers PATCHes brokers through the API; a script's write is not an edit to copy back.
  if (bySystem(record)) return { received: true, ignored: "system" };
  const row = await db.broker.findFirst({
    where: { OR: [{ twentyId: String(record.id) }, ...(record.mkanBrokerId ? [{ id: String(record.mkanBrokerId) }] : [])] },
    select: { id: true, kind: true, name: true, phones: true, whatsapp: true, optOut: true, optOutAt: true, zoneSlugs: true, lockedFields: true, syncedAt: true, relationship: true, sharePct: true, shareFlatRwf: true, agreementNote: true, agreedAt: true },
  });
  if (!row) return { received: true, matched: false };
  // The event is the edit: stamp it now. No junction rows are in the payload, so zones are left to crm:brokers.
  const state = twentyBrokerState({ ...record, updatedAt: new Date().toISOString() }, null, null);
  const edit = humanEdit(state, { ...row, sharePct: row.sharePct == null ? null : Number(row.sharePct), relationship: row.relationship as never });
  if (edit.changed.length === 0) return { received: true, matched: true, changed: [] };
  await db.broker.update({ where: { id: row.id }, data: edit.data as Prisma.BrokerUpdateInput });
  logger.info("twenty_webhook_broker_updated", { brokerId: row.id, changed: edit.changed });
  return { received: true, matched: true, brokerId: row.id, changed: edit.changed };
}
