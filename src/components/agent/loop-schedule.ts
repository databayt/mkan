import "server-only";
/**
 * The viewing schedule to Mkan's person (loop-schedule-pure.ts has the words), run twice a day by
 * /api/cron/loop-schedule: 07:00 Kigali today's viewings, 20:00 tomorrow's, Sunday 20:00 also the week's
 * numbers. Each goes once per slot (the outbox label), to MKAN_REP_WHATSAPP, whatever the daily cap.
 */
import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";
import { startOfKigaliDay } from "../../../scripts/wa/outbox-pure";
import { termsToAsk } from "./deal-pure";
import { feedMode } from "./loop-feed-pure";
import { numbersReport, loadNumbers } from "./loop-numbers";
import { numbersShort } from "./loop-numbers-pure";
import { dayLine, numbersLabel, scheduleLabel, scheduleMessage, scheduleSlot, type DayCounts, type ScheduleViewing } from "./loop-schedule-pure";
import { repDigits } from "./rep-word-pure";
import type { ShortlistItem } from "./types";
import { sendMessages } from "./whatsapp";

/** The coming viewings of one day, joined to their deal, home, broker and chat. */
async function viewingsBetween(from: Date, to: Date): Promise<ScheduleViewing[]> {
  const visits = await db.listingVisit.findMany({
    where: { outcome: "Scheduled", scheduledFor: { gte: from, lt: to } },
    orderBy: { scheduledFor: "asc" },
    select: {
      scheduledFor: true,
      listingId: true,
      meetingPoint: true,
      contactPhone: true,
      taskId: true,
      listing: { select: { title: true, priceMonth: true, location: { select: { neighbourhood: true, sector: true } } } },
      deal: { select: { tenantName: true, tenantPhone: true, brokerCommission: true, rentMonthly: true, broker: { select: { name: true, contactName: true, phones: true, whatsapp: true } } } },
    },
  });
  const out: ScheduleViewing[] = [];
  for (const v of visits) {
    const task = v.taskId ? await db.agentTask.findUnique({ where: { id: v.taskId }, select: { locale: true, shortlist: true } }).catch(() => null) : null;
    const item = ((task?.shortlist as unknown as ShortlistItem[] | null) ?? []).find((s) => s.id === v.listingId);
    const b = v.deal?.broker;
    const phone = b?.whatsapp ?? b?.phones?.[0] ?? null;
    out.push({
      at: v.scheduledFor,
      listingId: v.listingId,
      title: scrubTitle(v.listing.title) || `Home ${v.listingId}`,
      area: v.listing.location?.neighbourhood ?? v.listing.location?.sector ?? null,
      rent: v.deal?.rentMonthly ?? v.listing.priceMonth ?? null,
      meetingPoint: v.meetingPoint,
      tenantName: v.deal?.tenantName ?? null,
      tenantPhone: v.deal?.tenantPhone ?? v.contactPhone,
      tenantLang: task?.locale ?? null,
      brokerName: b?.contactName?.trim() || b?.name || null,
      brokerPhone: phone ? `+${phone.replace(/\D/g, "")}` : null,
      terms: termsToAsk(item?.cost ?? null),
      commission: v.deal?.brokerCommission ?? null,
    });
  }
  return out;
}

/** What moved today, counted from the rows. */
async function dayCounts(now: Date): Promise<DayCounts> {
  const from = startOfKigaliDay(now);
  const day = { gte: from };
  const [picked, yes, booked, viewed, signed, paid, lost] = await Promise.all([
    db.brokerRequest.count({ where: { consentAt: day } }),
    db.brokerRequest.count({ where: { respondedAt: day, status: "AVAILABLE" } }),
    db.listingVisit.count({ where: { createdAt: day } }),
    db.listingVisit.count({ where: { occurredAt: day } }),
    db.deal.count({ where: { signedAt: day } }),
    db.deal.count({ where: { paidAt: day } }),
    db.deal.count({ where: { status: "LOST", updatedAt: day } }),
  ]);
  return { picked, yes, booked, viewed, signed, paid, lost };
}

/** Send this slot's schedule (and, Sunday evening, the numbers). Returns what went into the outbox. */
export async function sendSchedule(now = new Date()): Promise<{ sent: string[]; viewings: number }> {
  const rep = repDigits();
  if (!rep) return { sent: [], viewings: 0 };
  const slot = scheduleSlot(now);
  const viewings = await viewingsBetween(slot.from, slot.to);
  const to = `+${rep}`;
  const sent: string[] = [];
  // The evening message carries the day in one line: always on an empty day, and in the digest, where it
  // replaces the per-step feed. An empty day also gets the numbers' one-liner — he wants to know.
  let extra: string | null = null;
  if (slot.part === "pm") {
    const paid = await db.deal.count({ where: { status: "PAID" } }).catch(() => 0);
    const digest = feedMode(paid) === "digest";
    if (digest || viewings.length === 0) extra = dayLine(await dayCounts(now).catch(() => ({ picked: 0, yes: 0, booked: 0, viewed: 0, signed: 0, paid: 0, lost: 0 })));
  }
  if (viewings.length === 0) {
    const line = numbersShort(await loadNumbers(now).catch(() => []));
    extra = [extra, line || null].filter(Boolean).join("\n") || null;
  }
  const label = scheduleLabel(slot);
  if (!(await db.outboundMessage.findFirst({ where: { label }, select: { id: true } }))) {
    await sendMessages([{ kind: "TENANT_ALERT", to, body: scheduleMessage(slot, viewings, extra), label }], `Schedule → Mkan's person (${slot.forDay})`);
    sent.push(label);
  }
  if (slot.weekly) {
    const nl = numbersLabel(slot);
    if (!(await db.outboundMessage.findFirst({ where: { label: nl }, select: { id: true } }))) {
      await sendMessages([{ kind: "TENANT_ALERT", to, body: await numbersReport(now), label: nl }], "Numbers → Mkan's person (Sunday)");
      sent.push(nl);
    }
  }
  return { sent, viewings: viewings.length };
}
