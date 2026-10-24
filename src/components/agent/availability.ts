import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appendTaskEvent, requestConfirmations } from "./broker";
import { coerceRequirements } from "./requirements";
import type { ShortlistItem } from "./types";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/**
 * "Check availability" on a broker home the agent did not ask about (the stay
 * type was a guess): the tenant's tap — or their digit on WhatsApp — is the
 * consent, and the same one-message broker loop runs for this one home.
 * The caller has already checked the task is the tenant's.
 */
export async function askAvailabilityFor(taskId: string, listingId: number): Promise<{ ok: boolean; asked: boolean }> {
  const task = await db.agentTask.findUnique({
    where: { id: taskId },
    select: { id: true, locale: true, requirements: true, shortlist: true, status: true },
  });
  if (!task || task.status === "RUNNING") return { ok: false, asked: false };
  const shortlist = (task.shortlist as unknown as ShortlistItem[] | null) ?? [];
  const item = shortlist.find((s) => s.id === listingId);
  if (!item?.lead || item.availability !== "unconfirmed") return { ok: false, asked: false };
  // Tapping it means a monthly rent: the broker is asked about one.
  const requirements = { ...coerceRequirements(task.requirements), stay: "long" as const };
  const asked = await requestConfirmations(task.id, [item], requirements as never, task.locale);
  if (asked.length === 0) return { ok: true, asked: false };
  await appendTaskEvent(task.id, "availability_asked", "waiting_person", { listingId: item.id });
  await db.agentTask.update({
    where: { id: task.id },
    data: { status: "WAITING", shortlist: json(shortlist.map((s) => (s.id === item.id ? { ...s, availability: "asked" } : s))) },
  });
  return { ok: true, asked: true };
}
