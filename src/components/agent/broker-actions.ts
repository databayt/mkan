"use server";

/**
 * Both sides of a viewing, by one-tap links — no account on either side.
 *
 * Broker (token from the WhatsApp message): answer available / rented, offer
 * viewing times, confirm the time a tenant chose. Tenant (cookie-owned task):
 * pick an offered time with name + phone + consent, then say how it went.
 *
 * A viewing exists (ListingVisit, Scheduled) only once the broker confirms the
 * tenant's chosen time; until then both sides see "waiting".
 */
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { appendTaskEvent, applyAnswer, brokerLink, hashToken } from "./broker";
import { viewingChosenMessage } from "./broker-message";
import { ownedBy, resolveViewer } from "./profile";
import { sendToBroker } from "./whatsapp";

const MAX_SLOTS = 3;

async function requestByToken(token: string) {
  if (!token || token.length > 64) return null;
  return db.brokerRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, listingId: true, brokerUserId: true, taskId: true, status: true, expiresAt: true, chosenSlot: true, visitId: true, tenantName: true, tenantPhone: true },
  });
}

const SlotsSchema = z.array(z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/))).max(MAX_SLOTS);

export type BrokerAnswerResult = { ok: true } | { ok: false; error: "invalid" | "expired" | "answered" | "slots" };

/** The broker's answer. Slots are optional and only meaningful with "available". */
export async function answerAvailability(token: string, answer: "available" | "rented", slotsInput: string[] = []): Promise<BrokerAnswerResult> {
  const req = await requestByToken(token);
  if (!req) return { ok: false, error: "invalid" };
  if (req.status !== "PENDING" && req.status !== "NO_REPLY") return { ok: false, error: "answered" };
  const parsed = SlotsSchema.safeParse(slotsInput.filter(Boolean));
  if (!parsed.success) return { ok: false, error: "slots" };
  // datetime-local has no zone; the broker means Kigali time (UTC+2).
  const slots = parsed.data
    .map((s) => (/[zZ]|[+-]\d{2}:\d{2}$/.test(s) ? new Date(s) : new Date(`${s}:00+02:00`)))
    .filter((d) => d.getTime() > Date.now())
    .map((d) => d.toISOString());

  const status = answer === "available" ? "AVAILABLE" : "RENTED";
  await db.brokerRequest.update({
    where: { id: req.id },
    data: { status, respondedAt: new Date(), ...(slots.length ? { viewingSlots: slots as Prisma.InputJsonValue } : {}) },
  });
  if (slots.length) {
    // The broker's times belong to the home, so every task asking about it sees them.
    await db.brokerRequest.updateMany({ where: { listingId: req.listingId, status: "PENDING" }, data: { viewingSlots: slots as Prisma.InputJsonValue } });
  }
  const broker = status === "AVAILABLE" ? await db.user.findUnique({ where: { id: req.brokerUserId }, select: { phoneNumber: true } }) : null;
  await applyAnswer(req.listingId, status, broker?.phoneNumber);
  return { ok: true };
}

/** The broker confirms the time the tenant picked — this is what books the viewing. */
export async function confirmViewing(token: string): Promise<BrokerAnswerResult> {
  const req = await requestByToken(token);
  if (!req) return { ok: false, error: "invalid" };
  if (!req.chosenSlot || req.visitId) return { ok: false, error: "answered" };
  // A signed-in tenant's viewing is theirs: it shows in their account, not only on the chat.
  const owner = req.taskId
    ? await db.agentTask.findUnique({ where: { id: req.taskId }, select: { userId: true, profile: { select: { userId: true } } } })
    : null;
  const guestUserId = owner?.profile?.userId ?? owner?.userId ?? null;
  const visit = await db.listingVisit.create({
    data: {
      listingId: req.listingId,
      ...(guestUserId ? { guestUserId } : {}),
      contactName: req.tenantName,
      contactPhone: req.tenantPhone,
      scheduledFor: req.chosenSlot,
      outcome: "Scheduled",
      notes: "Booked by the rental agent (/find)",
      recordedById: req.brokerUserId,
    },
    select: { id: true },
  });
  await db.brokerRequest.update({ where: { id: req.id }, data: { visitId: visit.id } });
  if (req.taskId) {
    await appendTaskEvent(req.taskId, "viewing_confirmed", "done", { listingId: req.listingId, at: req.chosenSlot.toISOString() });
    await db.agentTask.update({ where: { id: req.taskId }, data: { status: "DONE" } });
  }
  return { ok: true };
}

// ── Tenant side ──────────────────────────────────────────────────────────────

async function ownedTask(taskId: string) {
  const viewer = await resolveViewer({ write: false });
  if (viewer.ids.length === 0 && !viewer.legacyKey) return null;
  return db.agentTask.findFirst({ where: { id: taskId, ...ownedBy(viewer) }, select: { id: true, locale: true } });
}

const ChooseSchema = z.object({
  taskId: z.string().min(1),
  listingId: z.number().int().positive(),
  slot: z.string().datetime(),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[\d\s-]{9,16}$/),
  consent: z.literal(true),
});

export type TenantResult = { ok: true } | { ok: false; error: "invalid" | "notFound" | "slot" };

/** The tenant picks one of the broker's times and agrees to share name + phone with that broker. */
export async function chooseViewing(input: z.input<typeof ChooseSchema>): Promise<TenantResult> {
  const parsed = ChooseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { taskId, listingId, slot, name, phone } = parsed.data;
  const task = await ownedTask(taskId);
  if (!task) return { ok: false, error: "notFound" };
  const req = await db.brokerRequest.findFirst({
    where: { taskId, listingId, status: "AVAILABLE", visitId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, viewingSlots: true, broker: { select: { phoneNumber: true, sourceHostId: true } }, listing: { select: { title: true } } },
  });
  const slots = (req?.viewingSlots as string[] | null) ?? [];
  if (!req || !slots.includes(slot)) return { ok: false, error: "slot" };

  // A fresh link for the confirmation message; the old one stops working.
  const token = randomBytes(18).toString("base64url");
  await db.brokerRequest.update({
    where: { id: req.id },
    data: { chosenSlot: new Date(slot), tenantName: name, tenantPhone: phone.replace(/[\s-]/g, ""), tokenHash: hashToken(token) },
  });
  const when = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" }).format(new Date(slot));
  const handle = req.broker.sourceHostId?.startsWith("tiktok:") ? `@${req.broker.sourceHostId.slice(7)}` : "broker";
  if (req.broker.phoneNumber) {
    await sendToBroker(req.broker.phoneNumber, viewingChosenMessage(req.listing.title ?? "your home", when, brokerLink(token, "en")), handle);
  }
  await appendTaskEvent(taskId, "viewing_proposed", "waiting_person", { listingId, at: slot });
  await db.agentTask.update({ where: { id: taskId }, data: { status: "WAITING" } });
  return { ok: true };
}

const OUTCOMES = ["rented", "notForMe", "differentFromAd", "notAvailable", "tooExpensive", "brokerNoShow", "iMissedIt"] as const;
export type ViewingOutcome = (typeof OUTCOMES)[number];

/** After the viewing time: what happened. Feeds broker reliability and matching. */
export async function recordViewingOutcome(taskId: string, listingId: number, outcome: ViewingOutcome): Promise<TenantResult> {
  if (!OUTCOMES.includes(outcome)) return { ok: false, error: "invalid" };
  const task = await ownedTask(taskId);
  if (!task) return { ok: false, error: "notFound" };
  const req = await db.brokerRequest.findFirst({ where: { taskId, listingId, visitId: { not: null } }, select: { visitId: true } });
  if (!req?.visitId) return { ok: false, error: "notFound" };
  const visit = await db.listingVisit.findUnique({ where: { id: req.visitId }, select: { scheduledFor: true } });
  if (!visit || visit.scheduledFor.getTime() > Date.now()) return { ok: false, error: "invalid" };
  const visitOutcome = outcome === "brokerNoShow" ? "Cancelled" : outcome === "iMissedIt" ? "NoShow" : "Completed";
  await db.listingVisit.update({
    where: { id: req.visitId },
    data: { outcome: visitOutcome, occurredAt: visitOutcome === "Completed" ? visit.scheduledFor : null, notes: `Tenant outcome (/find): ${outcome}` },
  });
  await appendTaskEvent(taskId, "outcome_recorded", outcome === "rented" ? "done" : "uncertain", { listingId, outcome });
  return { ok: true };
}
