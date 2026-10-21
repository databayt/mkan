import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ownedBy, type Viewer } from "./profile";
import { coerceRequirements } from "./requirements";
import { SILENT_EVENTS, type AgentEventView, type AgentMessage, type AgentTaskView, type ShortlistItem } from "./types";

/**
 * Loading a task for its owner — shared by the server actions (page render,
 * send) and the GET poll route. Polling lives on a route handler, not a server
 * action: Next runs a client's actions one at a time, so a poll every second
 * queued in front of every tap on a chip, an answer or a viewing time.
 */

/**
 * A turn takes 2–3 s. One still RUNNING after this lost its `after()` (the
 * Worker was recycled mid-turn) and would answer "busy" to every message.
 */
export const STUCK_AFTER_MS = 90_000;
/** The panel draws the latest turn only; older turns' steps are not sent on every poll. */
const EVENTS_PER_POLL = 60;

function toView(task: {
  id: string;
  status: AgentTaskView["status"];
  locale: string;
  messages: Prisma.JsonValue;
  requirements: Prisma.JsonValue;
  shortlist: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  events: { seq: number; kind: string; status: string; payload: Prisma.JsonValue; createdAt: Date }[];
}): AgentTaskView {
  const req = coerceRequirements(task.requirements);
  return {
    id: task.id,
    status: task.status,
    locale: task.locale,
    messages: (task.messages as unknown as AgentMessage[]) ?? [],
    requirements: task.requirements ? (req as AgentTaskView["requirements"]) : null,
    shortlist: (task.shortlist as unknown as ShortlistItem[]) ?? [],
    events: task.events.map(
      (e): AgentEventView => ({
        seq: e.seq,
        kind: e.kind as AgentEventView["kind"],
        status: e.status as AgentEventView["status"],
        payload: (e.payload as Record<string, unknown>) ?? {},
        at: e.createdAt.toISOString(),
      }),
    ),
    startedAt: task.createdAt.toISOString(),
    version: taskVersion(task.status, task.updatedAt, task.events.at(-1)?.seq ?? 0),
  };
}

const TASK_SELECT = {
  id: true,
  status: true,
  locale: true,
  messages: true,
  requirements: true,
  shortlist: true,
  createdAt: true,
  updatedAt: true,
  // The tenant's own taps (SILENT_EVENTS) are kept for counting, never drawn or compared.
  events: {
    where: { kind: { notIn: [...SILENT_EVENTS] } },
    orderBy: { seq: "desc" },
    take: EVENTS_PER_POLL,
    select: { seq: true, kind: true, status: true, payload: true, createdAt: true },
  },
  brokerRequests: {
    where: { status: "AVAILABLE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, listingId: true, viewingSlots: true, chosenSlot: true, visitId: true },
  },
} satisfies Prisma.AgentTaskSelect;

type TaskRow = Prisma.AgentTaskGetPayload<{ select: typeof TASK_SELECT }>;

/** Lay the viewing state (broker's times, the tenant's pick, the booked visit) onto the cards. */
async function withViewings(view: AgentTaskView, task: TaskRow): Promise<AgentTaskView> {
  if (task.brokerRequests.length === 0) return view;
  const visitIds = task.brokerRequests.map((r) => r.visitId).filter((v): v is number => v != null);
  const visits = visitIds.length
    ? await db.listingVisit.findMany({ where: { id: { in: visitIds } }, select: { id: true, scheduledFor: true, outcome: true, notes: true } })
    : [];
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const byListing = new Map<number, TaskRow["brokerRequests"][number]>();
  for (const r of task.brokerRequests) if (!byListing.has(r.listingId)) byListing.set(r.listingId, r);
  return {
    ...view,
    shortlist: view.shortlist.map((item) => {
      const r = byListing.get(item.id);
      if (!r) return item;
      const visit = r.visitId ? visitById.get(r.visitId) : undefined;
      const outcome = visit && visit.outcome !== "Scheduled" ? visit.notes?.replace(/^Tenant outcome \(\/find\): /, "") ?? visit.outcome : null;
      return {
        ...item,
        availability: "confirmed",
        viewing: {
          requestId: r.id,
          slots: ((r.viewingSlots as string[] | null) ?? []).filter((s) => typeof s === "string"),
          chosen: r.chosenSlot?.toISOString() ?? null,
          confirmed: !!visit,
          scheduledFor: visit?.scheduledFor.toISOString() ?? null,
          outcome,
        },
      };
    }),
  };
}

/** The latest turn's events, oldest first (the query reads newest first, bounded). */
function latestTurnEvents(events: TaskRow["events"]): TaskRow["events"] {
  const asc = [...events].reverse();
  for (let i = asc.length - 1; i >= 0; i--) if (asc[i]!.kind === "requirements_extracted") return asc.slice(i);
  return asc;
}

/**
 * Unlock a turn that can no longer finish. One that already answered (its
 * cards are up, the broker step was lost) is simply done; one that never
 * answered gets the error reply, so the chat does not end on the tenant.
 */
async function recoverStuck(task: TaskRow): Promise<TaskRow> {
  if (task.status !== "RUNNING" || Date.now() - task.updatedAt.getTime() < STUCK_AFTER_MS) return task;
  const before = (task.messages as unknown as AgentMessage[]) ?? [];
  const answered = before.at(-1)?.role === "agent";
  const messages = answered ? before : [...before, { role: "agent", kind: "error", at: new Date().toISOString() } as AgentMessage];
  const status = answered ? "DONE" : "FAILED";
  const { count } = await db.agentTask.updateMany({
    where: { id: task.id, status: "RUNNING", updatedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } },
    data: { status, messages: messages as unknown as Prisma.InputJsonValue },
  });
  return count ? { ...task, status, messages: messages as unknown as Prisma.JsonValue } : task;
}

/**
 * What a poll compares: every change a tenant can see moves the status, the
 * row's updatedAt or the event sequence (broker answers and viewings append
 * events), so an equal version means nothing to send.
 */
export function taskVersion(status: string, updatedAt: Date, lastSeq: number): string {
  return `${status}.${updatedAt.getTime()}.${lastSeq}`;
}

/** The task, if this viewer owns it. Chats open by id (`/find?c=`); a bare /find is a new chat. */
export async function loadTask(viewer: Viewer, taskId: string): Promise<AgentTaskView | null> {
  const task = await db.agentTask.findFirst({ where: { id: taskId, ...ownedBy(viewer) }, select: TASK_SELECT });
  if (!task) return null;
  const live = await recoverStuck({ ...task, events: latestTurnEvents(task.events) });
  return withViewings(toView(live), live);
}

/**
 * The poll: one indexed read of status, updatedAt and the last seq. Unchanged
 * → "same" (the route answers 204) — a running turn's poll no longer reads
 * the messages, shortlist and 60 events every second just to find no change.
 * A RUNNING task past STUCK_AFTER_MS takes the full path so it is recovered.
 */
export async function pollTask(viewer: Viewer, taskId: string, version: string | null): Promise<AgentTaskView | "same" | null> {
  if (version) {
    const head = await db.agentTask.findFirst({
      where: { id: taskId, ...ownedBy(viewer) },
      select: { status: true, updatedAt: true, events: { where: { kind: { notIn: [...SILENT_EVENTS] } }, orderBy: { seq: "desc" }, take: 1, select: { seq: true } } },
    });
    if (!head) return null;
    const stuck = head.status === "RUNNING" && Date.now() - head.updatedAt.getTime() >= STUCK_AFTER_MS;
    if (!stuck && taskVersion(head.status, head.updatedAt, head.events[0]?.seq ?? 0) === version) return "same";
  }
  return loadTask(viewer, taskId);
}
