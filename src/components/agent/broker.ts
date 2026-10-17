import "server-only";

/**
 * The broker loop: ask the people who can speak for a shortlisted home whether
 * it is still available, apply their answers to every task waiting on them,
 * and give up honestly after 24 h of silence.
 *
 * Silence is never confirmation, and a request is never repeated to the same
 * broker for the same home within 24 h — a later tenant's task joins the
 * pending request instead.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicAppUrl } from "../../../scripts/crm/public-links";
import { availabilityMessage, needSummary, type BrokerHomeLine } from "./broker-message";
import { CONFIRMATION_TTL_DAYS } from "./rank";
import type { Requirements } from "./requirements";
import type { EventKind, ShortlistItem, StepStatus } from "./types";
import { sendToBroker } from "./whatsapp";

export const REQUEST_TTL_HOURS = 24;
const json = (v: unknown) => v as Prisma.InputJsonValue;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const brokerLink = (token: string, lang = "en") => `${publicAppUrl()}/${lang}/b/${token}`;

/** Append an event at the task's next seq (tasks are written by one turn or one answer at a time). */
export async function appendTaskEvent(taskId: string, kind: EventKind, status: StepStatus, payload: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.agentEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
    try {
      await db.agentEvent.create({ data: { taskId, seq: (last?.seq ?? 0) + 1, kind, status, payload: json(payload) } });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

/** Latest broker answer per listing: AVAILABLE within the TTL, or RENTED within 30 days. */
export async function brokerAnswers(listingIds: number[]): Promise<Map<number, { status: "AVAILABLE" | "RENTED"; at: Date }>> {
  if (listingIds.length === 0) return new Map();
  const rows = await db.brokerRequest.findMany({
    where: {
      listingId: { in: listingIds },
      OR: [
        { status: "AVAILABLE", respondedAt: { gte: new Date(Date.now() - CONFIRMATION_TTL_DAYS * 86_400_000) } },
        { status: "RENTED", respondedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      ],
    },
    orderBy: { respondedAt: "desc" },
    select: { listingId: true, status: true, respondedAt: true },
  });
  const out = new Map<number, { status: "AVAILABLE" | "RENTED"; at: Date }>();
  for (const r of rows) if (!out.has(r.listingId) && r.respondedAt) out.set(r.listingId, { status: r.status as "AVAILABLE" | "RENTED", at: r.respondedAt });
  return out;
}

/**
 * For every unconfirmed home on the shortlist that has a reachable broker,
 * make sure a request is out. One WhatsApp per broker, listing all their homes.
 * Returns the listing ids now awaiting an answer.
 */
export async function requestConfirmations(taskId: string, shortlist: ShortlistItem[], r: Requirements, lang: string): Promise<number[]> {
  const unconfirmed = shortlist.filter((s) => s.availability === "unconfirmed");
  if (unconfirmed.length === 0) return [];
  const links = await db.listingBroker.findMany({
    where: { listingId: { in: unconfirmed.map((s) => s.id) }, user: { phoneNumber: { not: null } } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }], // OWNER first, then the earliest broker
    select: { listingId: true, userId: true, user: { select: { phoneNumber: true, username: true, sourceHostId: true } } },
  });
  const brokerFor = new Map<number, (typeof links)[number]>();
  for (const l of links) if (!brokerFor.has(l.listingId) && l.user.phoneNumber) brokerFor.set(l.listingId, l);

  const need = needSummary(r);
  const since = new Date(Date.now() - REQUEST_TTL_HOURS * 3_600_000);
  const toSend = new Map<string, { phone: string; handle: string | null; homes: BrokerHomeLine[]; ids: string[] }>();
  const waiting: number[] = [];

  for (const item of unconfirmed) {
    const b = brokerFor.get(item.id);
    if (!b) continue;
    const recent = await db.brokerRequest.findFirst({
      where: { listingId: item.id, brokerUserId: b.userId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, expiresAt: true, taskId: true },
    });
    if (recent?.status === "PENDING") {
      // Already asked today: this task joins the same question (a row of its
      // own so the answer reaches it), and nothing is sent again.
      waiting.push(item.id);
      if (recent.taskId !== taskId) {
        await db.brokerRequest.create({
          data: {
            tokenHash: hashToken(randomBytes(18).toString("base64url")),
            listingId: item.id,
            brokerUserId: b.userId,
            taskId,
            locale: lang,
            need: json({ requirements: r, summary: need }),
            channel: "joined",
            expiresAt: recent.expiresAt,
          },
        });
      }
      await appendTaskEvent(taskId, "broker_contact_started", "waiting_person", { listingId: item.id, title: item.title, reused: true });
      continue;
    }
    if (recent) continue; // answered or expired today — don't ask again
    const token = randomBytes(18).toString("base64url");
    const req = await db.brokerRequest.create({
      data: {
        tokenHash: hashToken(token),
        listingId: item.id,
        brokerUserId: b.userId,
        taskId,
        locale: lang,
        need: json({ requirements: r, summary: need }),
        expiresAt: new Date(Date.now() + REQUEST_TTL_HOURS * 3_600_000),
      },
      select: { id: true },
    });
    const handle = b.user.sourceHostId?.startsWith("tiktok:") ? b.user.sourceHostId.slice(7) : null;
    const entry = toSend.get(b.userId) ?? { phone: b.user.phoneNumber!, handle, homes: [], ids: [] };
    entry.homes.push({ title: item.title, link: brokerLink(token, "en") });
    entry.ids.push(req.id);
    toSend.set(b.userId, entry);
    waiting.push(item.id);
  }

  for (const [, m] of toSend) {
    const channel = await sendToBroker(m.phone, availabilityMessage(m.handle, need, m.homes), m.handle ? `@${m.handle}` : m.phone);
    await db.brokerRequest.updateMany({
      where: { id: { in: m.ids } },
      data: { channel, sentAt: channel === "evolution" ? new Date() : null },
    });
    await appendTaskEvent(taskId, "broker_contact_started", "waiting_person", {
      broker: m.handle ? `@${m.handle}` : null,
      count: m.homes.length,
      channel,
    });
  }
  return waiting;
}

type Answer = "AVAILABLE" | "RENTED" | "NO_REPLY";

/** Re-derive a task's status: WAITING while any of its homes still has a pending request. */
async function settleTask(taskId: string) {
  const pending = await db.brokerRequest.count({ where: { taskId, status: "PENDING" } });
  const task = await db.agentTask.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task || task.status === "RUNNING") return;
  await db.agentTask.update({ where: { id: taskId }, data: { status: pending > 0 ? "WAITING" : "DONE" } });
}

/**
 * Write a broker's answer onto every task whose shortlist holds the home and
 * that is still waiting — not just the task that sent the request.
 */
export async function applyAnswer(listingId: number, answer: Answer) {
  // Every open question about this home has its answer now.
  if (answer !== "NO_REPLY") {
    await db.brokerRequest.updateMany({ where: { listingId, status: "PENDING" }, data: { status: answer, respondedAt: new Date() } });
  }
  const tasks = await db.agentTask.findMany({
    where: { status: { in: ["WAITING", "DONE"] }, updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, brokerRequests: { some: { listingId } } },
    select: { id: true, shortlist: true },
  });
  const availability = answer === "AVAILABLE" ? "confirmed" : answer === "RENTED" ? "rented" : "no_reply";
  for (const t of tasks) {
    const list = ((t.shortlist as unknown as ShortlistItem[]) ?? []).map((s) =>
      s.id === listingId ? { ...s, availability: availability as ShortlistItem["availability"] } : s,
    );
    const item = list.find((s) => s.id === listingId);
    await db.agentTask.update({ where: { id: t.id }, data: { shortlist: json(list) } });
    await appendTaskEvent(t.id, "broker_replied", answer === "AVAILABLE" ? "done" : answer === "RENTED" ? "failed" : "uncertain", {
      listingId,
      title: item?.title ?? null,
      answer: availability,
    });
    await settleTask(t.id);
  }
  if (answer === "AVAILABLE") await db.listing.update({ where: { id: listingId }, data: { lastAvailabilityConfirmedAt: new Date() } });
}

/** Cron: requests unanswered past their expiry become NO_REPLY. */
export async function expireRequests(now = new Date()): Promise<number> {
  const stale = await db.brokerRequest.findMany({ where: { status: "PENDING", expiresAt: { lt: now } }, select: { id: true, listingId: true } });
  for (const r of stale) {
    await db.brokerRequest.update({ where: { id: r.id }, data: { status: "NO_REPLY" } });
    const stillPending = await db.brokerRequest.count({ where: { listingId: r.listingId, status: "PENDING", expiresAt: { gte: now } } });
    if (stillPending === 0) await applyAnswer(r.listingId, "NO_REPLY");
  }
  return stale.length;
}
