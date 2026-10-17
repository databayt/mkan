"use server";

import { after } from "next/server";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { i18n, type Locale } from "@/components/internationalization/config";
import { runTurn } from "./run";
import { CLEARABLE, coerceRequirements, type Requirements } from "./requirements";
import type { AgentEventView, AgentMessage, AgentTaskView, ShortlistItem } from "./types";

const COOKIE = "mkan_agent";
const MAX_TEXT = 600;
/** Groq's free tier is ~5 turns a minute site-wide; one tenant gets a share of it. */
const MAX_TURNS_PER_HOUR = 30;
/** A reload within this window resumes the last task. */
const RESUME_DAYS = 7;

async function sessionKey(create: boolean): Promise<string | null> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  if (!create) return null;
  const key = crypto.randomUUID();
  jar.set(COOKIE, key, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
  return key;
}

function toView(task: {
  id: string;
  status: AgentTaskView["status"];
  locale: string;
  messages: Prisma.JsonValue;
  requirements: Prisma.JsonValue;
  shortlist: Prisma.JsonValue;
  createdAt: Date;
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
  events: { orderBy: { seq: "asc" }, select: { seq: true, kind: true, status: true, payload: true, createdAt: true } },
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

/** The task this browser owns, or null. Used by the page and by polling. */
export async function getAgentTask(taskId?: string): Promise<AgentTaskView | null> {
  const key = await sessionKey(false);
  if (!key) return null;
  const task = taskId
    ? await db.agentTask.findFirst({ where: { id: taskId, sessionKey: key }, select: TASK_SELECT })
    : await db.agentTask.findFirst({
        where: { sessionKey: key, createdAt: { gte: new Date(Date.now() - RESUME_DAYS * 86_400_000) } },
        orderBy: { createdAt: "desc" },
        select: TASK_SELECT,
      });
  return task ? withViewings(toView(task), task) : null;
}

export type SendResult = { ok: true; taskId: string } | { ok: false; error: "empty" | "busy" | "rate" };

/**
 * Send a tenant message. Continues the current task (a follow-up refines the
 * same search) unless `fresh` starts a new one. Returns at once; the turn runs
 * in `after()` and the client polls `getAgentTask`.
 */
export async function sendAgentMessage(input: {
  text: string;
  lang: string;
  taskId?: string;
  fresh?: boolean;
  /** Badge picks — validated here, merged over the parsed text by runTurn. */
  filters?: Partial<Requirements>;
  /** Fields a refine chip empties ("Anywhere in Kigali"). */
  clear?: string[];
}): Promise<SendResult> {
  const text = input.text.trim().slice(0, MAX_TEXT);
  if (!text) return { ok: false, error: "empty" };
  const lang = (i18n.locales as readonly string[]).includes(input.lang) ? (input.lang as Locale) : i18n.defaultLocale;
  const key = (await sessionKey(true))!;

  const recent = await db.agentTask.findMany({
    where: { sessionKey: key, updatedAt: { gte: new Date(Date.now() - 3_600_000) } },
    select: { messages: true },
  });
  const turns = recent.reduce((n, t) => n + ((t.messages as unknown as AgentMessage[]) ?? []).filter((m) => m.role === "user").length, 0);
  if (turns >= MAX_TURNS_PER_HOUR) return { ok: false, error: "rate" };

  const session = await auth().catch(() => null);
  const filters = coerceRequirements(input.filters);
  const clear = (input.clear ?? []).filter((k) => (CLEARABLE as readonly string[]).includes(k));
  const userMsg: AgentMessage = {
    role: "user",
    text,
    at: new Date().toISOString(),
    ...(Object.keys(filters).length ? { filters: filters as Record<string, unknown> } : {}),
    ...(clear.length ? { clear } : {}),
  };

  let taskId: string;
  const current = !input.fresh && input.taskId
    ? await db.agentTask.findFirst({ where: { id: input.taskId, sessionKey: key }, select: { id: true, status: true, messages: true } })
    : null;
  if (current) {
    if (current.status === "RUNNING") return { ok: false, error: "busy" };
    const messages = [...((current.messages as unknown as AgentMessage[]) ?? []), userMsg];
    await db.agentTask.update({
      where: { id: current.id },
      data: { messages: messages as unknown as Prisma.InputJsonValue, status: "RUNNING", locale: lang },
    });
    taskId = current.id;
  } else {
    const created = await db.agentTask.create({
      data: {
        sessionKey: key,
        userId: session?.user?.id ?? null,
        locale: lang,
        messages: [userMsg] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    taskId = created.id;
  }

  after(() => runTurn(taskId));
  return { ok: true, taskId };
}
