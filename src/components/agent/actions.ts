"use server";

import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { i18n, type Locale } from "@/components/internationalization/config";
import { runTurn } from "./run";
import { CLEARABLE, coerceRequirements, type Requirements } from "./requirements";
import { loadTask, sessionKey, STUCK_AFTER_MS } from "./task-view";
import type { AgentMessage, AgentTaskView } from "./types";

const MAX_TEXT = 600;
/** Groq's free tier is ~5 turns a minute site-wide; one tenant gets a share of it. */
const MAX_TURNS_PER_HOUR = 30;

/** The task this browser owns, or null. Used by the page and by polling. */
export async function getAgentTask(taskId?: string): Promise<AgentTaskView | null> {
  const key = await sessionKey(false);
  if (!key) return null;
  return loadTask(key, taskId);
}

/** `task` is the view right after the send, so the client skips a second round trip. */
export type SendResult = { ok: true; taskId: string; task: AgentTaskView | null } | { ok: false; error: "empty" | "busy" | "rate" };

/**
 * Send a tenant message. Continues the current task (a follow-up refines the
 * same search) unless `fresh` starts a new one. Returns at once; the turn runs
 * in `after()` and the client polls `/api/agent/task`.
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

  // Counted in Postgres: loading every recent task's whole transcript to count
  // its user turns grew with the conversation on every send.
  const [row] = await db.$queryRaw<{ turns: number }[]>`
    SELECT COALESCE(SUM((SELECT COUNT(*) FROM jsonb_array_elements(t.messages) m WHERE m->>'role' = 'user')), 0)::int AS turns
    FROM "AgentTask" t
    WHERE t."sessionKey" = ${key} AND t."updatedAt" >= ${new Date(Date.now() - 3_600_000)}`;
  if ((row?.turns ?? 0) >= MAX_TURNS_PER_HOUR) return { ok: false, error: "rate" };

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
    ? await db.agentTask.findFirst({ where: { id: input.taskId, sessionKey: key }, select: { id: true, status: true, messages: true, updatedAt: true } })
    : null;
  if (current) {
    // A turn lost mid-way is not "busy": the next message simply runs.
    if (current.status === "RUNNING" && Date.now() - current.updatedAt.getTime() < STUCK_AFTER_MS) return { ok: false, error: "busy" };
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
  return { ok: true, taskId, task: await loadTask(key, taskId).catch(() => null) };
}
