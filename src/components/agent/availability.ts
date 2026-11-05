import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { waLink } from "../../../scripts/crm/public-links";
import { appendTaskEvent, homeLink, requestConfirmations } from "./broker";
import { gateForTask } from "./broker-sends";
import { coerceRequirements } from "./requirements";
import type { ShortlistItem } from "./types";
import { postSlackCard } from "./whatsapp";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * Why a pick did not become a broker message:
 *   handed  — broker sends are off, or the tenant is on the team's list: a
 *             person got a #mkan card with the home and the broker, and the
 *             tenant hears that we are checking;
 *   web     — /find in a browser never reaches a broker: the card offers the
 *             same chat on WhatsApp instead;
 *   none    — nobody to ask (no broker with a number, or this broker was asked
 *             about it lately and has not answered).
 */
export type AskOutcome = { ok: boolean; asked: boolean; why?: "handed" | "web" | "none" };

/**
 * The tenant picked a broker home — a digit on WhatsApp, "yes" to "want me to
 * check it?" — and that is the consent: the one-message broker loop runs for
 * this one home, as Mkan (broker-message.ts). The caller has already checked
 * the task is the tenant's.
 */
export async function askAvailabilityFor(taskId: string, listingId: number): Promise<AskOutcome> {
  const task = await db.agentTask.findUnique({
    where: { id: taskId },
    select: { id: true, locale: true, requirements: true, shortlist: true, status: true },
  });
  if (!task || task.status === "RUNNING") return { ok: false, asked: false };
  const shortlist = (task.shortlist as unknown as ShortlistItem[] | null) ?? [];
  const item = shortlist.find((s) => s.id === listingId);
  if (!item?.lead || item.availability !== "unconfirmed") return { ok: false, asked: false };

  const outcome = await askBroker(task.id, item, task.requirements, task.locale);
  if (outcome.asked) {
    await db.agentTask.update({
      where: { id: task.id },
      data: { status: "WAITING", shortlist: json(shortlist.map((s) => (s.id === item.id ? { ...s, availability: "asked" } : s))) },
    });
  }
  return outcome;
}

/**
 * The check itself, for one unconfirmed broker home the tenant chose: the gate,
 * then the broker (or a person at Mkan). It writes no shortlist, so a running
 * turn calls it too — "Check K1234 for me" sent from /find's card is the pick
 * (run.ts) — and marks the home asked with the rest of its writes.
 */
export async function askBroker(taskId: string, item: ShortlistItem, requirementsJson: unknown, locale: string): Promise<AskOutcome> {
  const gate = await gateForTask(taskId);
  if (!gate.ok) {
    if (gate.why === "not-whatsapp") return { ok: true, asked: false, why: "web" };
    await handToPerson(taskId, item, gate.waPhone, gate.why === "test-phone");
    await appendTaskEvent(taskId, "availability_asked", "waiting_person", { listingId: item.id, handed: true });
    return { ok: true, asked: false, why: "handed" };
  }

  // Picking it means a monthly rent: the broker is asked about one.
  const requirements = { ...coerceRequirements(requirementsJson), stay: "long" as const };
  const asked = await requestConfirmations(taskId, [item], requirements as never, locale);
  if (asked.length === 0) return { ok: true, asked: false, why: "none" };
  await Promise.all([
    appendTaskEvent(taskId, "availability_asked", "waiting_person", { listingId: item.id }),
    // The tenant chose this home on their own phone: the request records when (schema: BrokerRequest.consentAt).
    // The answer reaches them through the task's WhatsApp profile (broker.ts applyAnswer); their number is
    // shared with the broker only when they pick a viewing time.
    db.brokerRequest.updateMany({ where: { taskId, listingId: item.id, consentAt: null }, data: { consentAt: new Date() } }),
  ]);
  return { ok: true, asked: true };
}

/** The pick, for a person: who asked, which home, which broker — and the chats one tap away. */
async function handToPerson(taskId: string, item: ShortlistItem, tenant: string | null, test: boolean) {
  const brokers = await db.listingBroker.findMany({
    where: { listingId: item.id, user: { phoneNumber: { not: null } } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: { sourceUrl: true, user: { select: { phoneNumber: true, username: true } }, listing: { select: { id: true, sourceUrl: true, isPublished: true, code: true, sourceListingId: true } } },
    take: 3,
  });
  const ad = homeLink(brokers[0]?.sourceUrl, brokers[0]?.listing) ?? item.path;
  const who = brokers.map((b) => `${b.user.username ?? "broker"} <${waLink(b.user.phoneNumber!, "")}|${b.user.phoneNumber}>`).join(" · ") || "no broker number on file";
  const head = test ? "🧪 TEST (team number, not sent)" : "🙋 A tenant wants a home checked — broker sends are paused, so a person does it";
  await postSlackCard(
    `${head}\n*${item.title}* (#${item.id}) — ${ad}\nTenant: ${tenant ? `<${waLink(tenant, "")}|${tenant}>` : "web"} · chat ${taskId}\nBroker: ${who}`,
  ).catch(() => {});
}
