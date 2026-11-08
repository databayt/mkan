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
 *   taken   — a broker already said it is rented: the tenant hears so, and picks another;
 *   person  — nothing for the line to ask (a host's own home, a broker who went
 *             quiet on it, no broker with a number): a person got a #mkan card.
 *             Until 2026-11-08 these were "none" and the tenant heard "I'll tell
 *             you here if the broker writes back" with no broker asked.
 */
export type AskOutcome = { ok: boolean; asked: boolean; why?: "handed" | "web" | "none" | "busy" | "already" | "confirmed" | "taken" | "person" };

/** How long a pick waits for the turn that showed the homes to finish writing. */
const PICK_WAIT_MS = 10_000;

/**
 * The tenant picked a broker home — a digit on WhatsApp, "yes" to "want me to
 * check it?" — and that is the consent: the one-message broker loop runs for
 * this one home, as Mkan (broker-message.ts). The caller has already checked
 * the task is the tenant's.
 */
export async function askAvailabilityFor(taskId: string, listingId: number): Promise<AskOutcome> {
  const read = () =>
    db.agentTask.findUnique({
      where: { id: taskId },
      select: { id: true, locale: true, requirements: true, shortlist: true, status: true },
    });
  let task = await read();
  // The turn that showed these homes may still be writing its tail (the writer, a broker ask): a pick
  // sent in the meantime waits for it instead of being refused (2026-11-06).
  for (const until = Date.now() + PICK_WAIT_MS; task?.status === "RUNNING" && Date.now() < until; ) {
    await new Promise((r) => setTimeout(r, 500));
    task = await read();
  }
  if (!task) return { ok: false, asked: false };
  if (task.status === "RUNNING") return { ok: false, asked: false, why: "busy" };
  const shortlist = (task.shortlist as unknown as ShortlistItem[] | null) ?? [];
  const item = shortlist.find((s) => s.id === listingId);
  // Already asked (this chat or another's) — the answer comes here; a yes already in — book the viewing.
  if (item?.availability === "asked") return { ok: true, asked: false, why: "already" };
  if (item?.availability === "confirmed") return { ok: true, asked: false, why: "confirmed" };
  if (item?.availability === "rented") return { ok: true, asked: false, why: "taken" };
  if (!item) return { ok: false, asked: false };
  if (!item.lead || item.availability !== "unconfirmed") {
    // Nothing for the line to ask: a host's own home, or a broker who went quiet on this one.
    await handPickToPerson(task.id, item, item.lead ? "no-reply" : "not-a-lead");
    return { ok: true, asked: false, why: "person" };
  }

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
    await handPickToPerson(taskId, item, gate.why === "test-phone" ? "test" : "paused", gate.waPhone);
    return { ok: true, asked: false, why: "handed" };
  }

  // Picking it means a monthly rent: the broker is asked about one.
  const requirements = { ...coerceRequirements(requirementsJson), stay: "long" as const };
  const asked = await requestConfirmations(taskId, [item], requirements as never, locale);
  if (asked.length === 0) {
    // No broker with a number, or this one was asked lately and has not answered: a person checks.
    await handPickToPerson(taskId, item, "no-broker", gate.waPhone);
    return { ok: true, asked: false, why: "person" };
  }
  await Promise.all([
    appendTaskEvent(taskId, "availability_asked", "waiting_person", { listingId: item.id }),
    // The tenant chose this home on their own phone: the request records when (schema: BrokerRequest.consentAt).
    // The answer reaches them through the task's WhatsApp profile (broker.ts applyAnswer); their number is
    // shared with the broker only when they pick a viewing time.
    db.brokerRequest.updateMany({ where: { taskId, listingId: item.id, consentAt: null }, data: { consentAt: new Date() } }),
  ]);
  return { ok: true, asked: true };
}

/** Why a pick went to a person instead of a broker message — the card's first line. */
export type PickToPerson = "paused" | "test" | "no-broker" | "not-a-lead" | "no-reply" | "check-failed" | "no-sheet";
const HEAD: Record<PickToPerson, string> = {
  paused: "🙋 A tenant wants a home checked — broker sends are paused, so a person does it",
  test: "🧪 TEST (team number, not sent)",
  "no-broker": "🙋 A tenant wants a home checked — no broker with a number to ask, or the broker was asked lately and has not answered; a person checks",
  "not-a-lead": "🙋 A tenant picked a home that is not a broker's lead (a host's own) — a person answers them",
  "no-reply": "🙋 A tenant picked a home whose broker went quiet on it — a person checks",
  "check-failed": "⚠️ A tenant's pick could not be checked (an error) — a person checks it",
  "no-sheet": "🙋 A tenant wants to view a home the broker confirmed, but no deal sheet could be written — a person sets up the viewing",
};

/**
 * The pick, for a person: who asked, which home, which broker — and the chats one tap away. The tenant
 * hears that a person will reply (whatsapp-format.ts checkText "person"). `tenant` defaults to the task's
 * own number (the WhatsApp chat's, or the one a web tenant left).
 */
export async function handPickToPerson(taskId: string, item: ShortlistItem, why: PickToPerson, tenant?: string | null): Promise<void> {
  const phone = tenant !== undefined ? tenant : ((await gateForTask(taskId).catch(() => null))?.waPhone ?? null);
  const brokers = await db.listingBroker.findMany({
    where: { listingId: item.id, user: { phoneNumber: { not: null } } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: { sourceUrl: true, user: { select: { phoneNumber: true, username: true } }, listing: { select: { id: true, sourceUrl: true, isPublished: true, code: true, sourceListingId: true } } },
    take: 3,
  });
  const ad = homeLink(brokers[0]?.sourceUrl, brokers[0]?.listing) ?? item.path;
  const who = brokers.map((b) => `${b.user.username ?? "broker"} <${waLink(b.user.phoneNumber!, "")}|${b.user.phoneNumber}>`).join(" · ") || "no broker number on file";
  await postSlackCard(
    `${HEAD[why]}\n*${item.title}* (#${item.id}) — ${ad}\nTenant: ${phone ? `<${waLink(phone, "")}|${phone}>` : "web"} · chat ${taskId}\nBroker: ${who}`,
  ).catch(() => {});
  await appendTaskEvent(taskId, "availability_asked", "waiting_person", { listingId: item.id, handed: true, why }).catch(() => {});
}
