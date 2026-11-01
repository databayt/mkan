import "server-only";

/**
 * From a broker's yes to a signed lease, with Mkan in the middle (Abdout,
 * 2026-11-01). The tenant never gets the broker's number:
 *
 *   broker says available ─► sendDealSheet: the WhatsApp tenant gets the deal
 *                            (deal-pure.ts) and is asked when they can come
 *   tenant names a time    ─► proposeViewing: a #mkan card for the person from
 *                            Mkan, who confirms the time with the broker
 *   that person books it   ─► bookViewing (`pnpm deal:book`): a three-party
 *                            ListingVisit + a Deal, and the tenant's confirmation
 *   the hourly cron        ─► viewingReminders: 24 h and 2 h before, and "how did
 *                            it go?" after
 *   the lease is signed    ─► setDealStatus (`pnpm deal:status`)
 *
 * The person confirms with the broker by hand on purpose: a broker hears from
 * a person, not a machine, about the time they show their home.
 */
import { db } from "@/lib/db";
import { publicAppUrl, waLink } from "../../../scripts/crm/public-links";
import { viewingRep } from "./broker-message";
import {
  afterViewingMessage,
  dealSheetMessage,
  viewingConfirmedMessage,
  viewingLabel,
  viewingProposedMessage,
  viewingReminderMessage,
  type DealLang,
} from "./deal-pure";
import type { ShortlistItem } from "./types";
import { postSlackCard, sendMessages } from "./whatsapp";

/** The deal sheet asked this tenant for a time; their next message may be one (WaState). */
const askKey = (address: string) => `viewing-ask:${address.replace(/\D/g, "")}`;
const ASK_TTL_MS = 72 * 3_600_000;
export type ViewingAsk = { taskId: string; listingId: number; at: string; proposedAt?: string };

const langOf = (l: string): DealLang => (l === "ar" || l === "rw" ? l : "en");

async function nextSeq(taskId: string): Promise<number> {
  const last = await db.agentEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
  return (last?.seq ?? 0) + 1;
}

/** One trace row on the task, so /find shows the step too. */
async function trace(taskId: string, kind: "viewing_proposed" | "viewing_confirmed" | "outcome_recorded", status: "done" | "waiting_person", payload: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.agentEvent.create({ data: { taskId, seq: await nextSeq(taskId), kind, status, payload: payload as never } });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

/** The broker said the home is free: the WhatsApp tenant gets the deal and is asked when they can come. */
export async function sendDealSheet(task: { id: string; locale: string; shortlist: unknown; profile: { waPhone: string | null } | null }, listingId: number): Promise<boolean> {
  const to = task.profile?.waPhone;
  if (!to) return false;
  const item = ((task.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId);
  const lang = langOf(task.locale);
  const body = dealSheetMessage(
    { title: item?.title?.trim() || `#${listingId}`, ref: `K${listingId}`, cost: item?.cost ?? null, rep: viewingRep(), link: `${publicAppUrl()}/${lang}/find?c=${task.id}` },
    lang,
  );
  await sendMessages([{ kind: "TENANT_ALERT", to, body, label: "tenant" }], `Deal sheet → tenant (home #${listingId})`);
  const value = { taskId: task.id, listingId, at: new Date().toISOString() } satisfies ViewingAsk;
  await db.waState.upsert({ where: { key: askKey(to) }, create: { key: askKey(to), value }, update: { value } });
  return true;
}

/** The open "when can you come?" for this number, if it is still fresh. */
export async function readViewingAsk(address: string | null | undefined): Promise<ViewingAsk | null> {
  if (!address) return null;
  const row = await db.waState.findUnique({ where: { key: askKey(address) }, select: { value: true } }).catch(() => null);
  const ask = row?.value as ViewingAsk | null | undefined;
  if (!ask?.taskId || !ask.at || Date.now() - Date.parse(ask.at) > ASK_TTL_MS) return null;
  return ask;
}

/** The tenant named a time: the person from Mkan gets it in #mkan with both chats one tap away; the tenant hears so. */
export async function proposeViewing(ask: ViewingAsk, at: Date, tenant: string, lang: DealLang): Promise<string> {
  const label = viewingLabel(at, lang);
  const [home, brokers] = await Promise.all([
    db.listing.findUnique({ where: { id: ask.listingId }, select: { title: true, location: { select: { address: true, neighbourhood: true, sector: true } } } }),
    db.listingBroker.findMany({ where: { listingId: ask.listingId }, select: { user: { select: { phoneNumber: true, username: true } } }, take: 3 }),
  ]);
  const broker = brokers.map((b) => (b.user.phoneNumber ? `${b.user.username ?? "broker"} <${waLink(b.user.phoneNumber, "")}|${b.user.phoneNumber}>` : null)).filter(Boolean).join(" · ") || "no broker number on file";
  const iso = at.toISOString();
  await postSlackCard(
    `📅 *Viewing asked* — ${home?.title ?? `#${ask.listingId}`} (K${ask.listingId}), *${viewingLabel(at, "en")}*\n` +
      `Tenant: <${waLink(tenant, "")}|${tenant}> · Broker: ${broker}\n` +
      `${viewingRep()}: confirm the time with the broker, then \`pnpm deal:book --task=${ask.taskId} --listing=${ask.listingId} --at=${iso} --place="…"\``,
  ).catch(() => {});
  await trace(ask.taskId, "viewing_proposed", "waiting_person", { listingId: ask.listingId, at: iso });
  const value = { ...ask, proposedAt: iso } satisfies ViewingAsk;
  await db.waState.update({ where: { key: askKey(tenant) }, data: { value } }).catch(() => {});
  return viewingProposedMessage(lang, label, viewingRep());
}

/**
 * The person from Mkan confirmed the time with the broker: one ListingVisit
 * with all three, a Deal, and the tenant's confirmation on WhatsApp.
 */
export async function bookViewing(input: { taskId: string; listingId: number; at: Date; place?: string | null; by?: string | null }): Promise<{ visitId: number; dealId: string }> {
  const task = await db.agentTask.findUnique({ where: { id: input.taskId }, select: { id: true, locale: true, shortlist: true, profile: { select: { waPhone: true } } } });
  if (!task) throw new Error(`no task ${input.taskId}`);
  const item = ((task.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === input.listingId);
  const link = await db.listingBroker.findFirst({ where: { listingId: input.listingId }, orderBy: [{ role: "desc" }, { createdAt: "asc" }], select: { brokerId: true } });
  const rep = input.by?.trim() || viewingRep();
  const tenant = task.profile?.waPhone ?? null;
  const cost = item?.cost ?? null;
  const viewingFee = cost?.lines.find((l) => l.key === "viewingFee")?.amount ?? null;
  const commission = cost?.lines.find((l) => l.key === "commission")?.amount ?? null;

  const visit = await db.listingVisit.create({
    data: {
      listingId: input.listingId,
      contactPhone: tenant,
      scheduledFor: input.at,
      recordedById: `mkan:${rep}`,
      brokerId: link?.brokerId ?? null,
      taskId: task.id,
      repName: rep,
      meetingPoint: input.place?.trim() || null,
    },
    select: { id: true },
  });
  const deal = await db.deal.create({
    data: {
      listingId: input.listingId,
      brokerId: link?.brokerId ?? null,
      visitId: visit.id,
      taskId: task.id,
      tenantPhone: tenant,
      rentMonthly: cost?.headline ?? null,
      upfront: cost ? cost.total - (viewingFee ?? 0) : null,
      brokerCommission: commission,
      viewingFeePaid: viewingFee,
    },
    select: { id: true },
  });
  await db.brokerRequest.updateMany({ where: { taskId: task.id, listingId: input.listingId, status: "AVAILABLE" }, data: { chosenSlot: input.at, visitId: visit.id } });
  await trace(task.id, "viewing_confirmed", "done", { listingId: input.listingId, at: input.at.toISOString(), visitId: visit.id });
  if (tenant) {
    const lang = langOf(task.locale);
    const body = viewingConfirmedMessage(lang, { title: item?.title?.trim() || `#${input.listingId}`, label: viewingLabel(input.at, lang), place: input.place?.trim() || null, rep });
    await sendMessages([{ kind: "TENANT_ALERT", to: tenant, body, label: "tenant" }], `Viewing confirmed → tenant (home #${input.listingId})`);
    await db.waState.delete({ where: { key: askKey(tenant) } }).catch(() => {});
  }
  await postSlackCard(`✅ *Viewing booked* — ${item?.title ?? `#${input.listingId}`}, *${viewingLabel(input.at, "en")}*${input.place ? ` · ${input.place}` : ""} · ${rep} · deal \`${deal.id}\``).catch(() => {});
  return { visitId: visit.id, dealId: deal.id };
}

/**
 * Hourly: the tenant is reminded 24 h and 2 h before (the person from Mkan
 * hears in #mkan), and asked how it went 3 h after. Each mark is sent once.
 */
export async function viewingReminders(now = new Date()): Promise<number> {
  const visits = await db.listingVisit.findMany({
    where: { outcome: "Scheduled", taskId: { not: null }, scheduledFor: { gte: new Date(now.getTime() - 6 * 3_600_000), lte: new Date(now.getTime() + 25 * 3_600_000) } },
    select: { id: true, scheduledFor: true, contactPhone: true, reminders: true, repName: true, meetingPoint: true, taskId: true, listing: { select: { title: true } } },
  });
  let sent = 0;
  for (const v of visits) {
    const ms = v.scheduledFor.getTime() - now.getTime();
    const mark = ms <= 25 * 3_600_000 && ms > 3 * 3_600_000 ? "24h" : ms <= 2.5 * 3_600_000 && ms > 0 ? "2h" : ms <= -3 * 3_600_000 ? "after" : null;
    if (!mark || v.reminders.includes(mark)) continue;
    const task = v.taskId ? await db.agentTask.findUnique({ where: { id: v.taskId }, select: { locale: true } }) : null;
    const lang = langOf(task?.locale ?? "en");
    const title = v.listing.title?.trim() || `#${v.id}`;
    const rep = v.repName || viewingRep();
    if (v.contactPhone) {
      const body = mark === "after" ? afterViewingMessage(lang, title) : viewingReminderMessage(lang, { title, label: viewingLabel(v.scheduledFor, lang), rep }, mark);
      await sendMessages([{ kind: "TENANT_ALERT", to: v.contactPhone, body, label: "tenant" }], `Viewing ${mark} → tenant`);
    }
    if (mark !== "after") await postSlackCard(`⏰ Viewing ${mark === "24h" ? "tomorrow" : "in 2 h"}: ${title}, ${viewingLabel(v.scheduledFor, "en")}${v.meetingPoint ? ` · ${v.meetingPoint}` : ""} · ${rep}`).catch(() => {});
    await db.listingVisit.update({ where: { id: v.id }, data: { reminders: { push: mark } } });
    sent += 1;
  }
  return sent;
}

/** How the deal ended up, written by the person who was there (`pnpm deal:status`). */
export async function setDealStatus(dealId: string, status: "VIEWED" | "SIGNED" | "PAID" | "LOST", extras: { mkanShare?: number | null; notes?: string | null } = {}) {
  const now = new Date();
  const deal = await db.deal.update({
    where: { id: dealId },
    data: {
      status,
      ...(status === "SIGNED" ? { signedAt: now } : {}),
      ...(status === "PAID" ? { paidAt: now } : {}),
      ...(extras.mkanShare != null ? { mkanShare: extras.mkanShare } : {}),
      ...(extras.notes ? { notes: extras.notes } : {}),
    },
    select: { id: true, visitId: true, listingId: true, brokerId: true },
  });
  if (deal.visitId && status !== "PAID") {
    // The viewing took place, whatever came of it.
    await db.listingVisit.update({ where: { id: deal.visitId }, data: { outcome: "Completed", occurredAt: now } }).catch(() => {});
  }
  // A signed lease: the home is no longer on the market, and the broker is a partner in practice.
  if (status === "SIGNED") {
    await db.listing.update({ where: { id: deal.listingId }, data: { lostAt: now, lostReason: "RENTED" } });
    if (deal.brokerId) await db.broker.updateMany({ where: { id: deal.brokerId, relationship: { in: ["NEW", "INTRODUCED", "ACTIVE"] } }, data: { relationship: "PARTNER" } });
  }
  return deal;
}
