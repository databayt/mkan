"use server";

import { after } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { assertRateLimit, getClientId, RateLimitError } from "@/lib/rate-limit";
import { i18n, type Locale } from "@/components/internationalization/config";
import { appendTaskEvent } from "./broker";
import { ownedBy, requireProfile, resolveViewer } from "./profile";
import { runTurn } from "./run";
import { CLEARABLE, coerceRequirements, type Requirements } from "./requirements";
import { loadTask, STUCK_AFTER_MS } from "./task-view";
import type { AgentMessage, AgentTaskView } from "./types";

const MAX_TEXT = 600;
/** Per tenant, across every chat they have. A person types far fewer; a loop does not. */
const MAX_TURNS_PER_HOUR = 30;

/** A chat this viewer owns (`/find?c=`, the bubble's last chat), or null. */
export async function getAgentTask(taskId?: string): Promise<AgentTaskView | null> {
  if (!taskId) return null;
  return loadTask(await resolveViewer({ write: false }), taskId);
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

  // Per address first: a turn can cost a Claude call, and a cookie is free to clear.
  // Keyed on Cloudflare's cf-connecting-ip — x-forwarded-for is whatever the client sends.
  try {
    await assertRateLimit("agent", (await headers()).get("cf-connecting-ip") ?? (await getClientId()));
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: "rate" };
    throw err;
  }
  const viewer = await requireProfile();
  const profileId = viewer.profile.id;

  // The turns this tenant typed in the last hour, by each message's own time —
  // a chat a broker's answer touched no longer counts its whole history.
  const since = new Date(Date.now() - 3_600_000);
  const [row] = await db.$queryRaw<{ turns: number }[]>`
    SELECT COUNT(*)::int AS turns
    FROM "AgentTask" t, jsonb_array_elements(t.messages) m
    WHERE t."profileId" = ${profileId} AND t."updatedAt" >= ${since}
      AND m->>'role' = 'user' AND m->>'at' >= ${since.toISOString()}`;
  if ((row?.turns ?? 0) >= MAX_TURNS_PER_HOUR) return { ok: false, error: "rate" };

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
    ? await db.agentTask.findFirst({ where: { id: input.taskId, ...ownedBy(viewer) }, select: { id: true, status: true, messages: true, updatedAt: true } })
    : null;
  if (current) {
    // A turn lost mid-way is not "busy": the next message simply runs.
    if (current.status === "RUNNING" && Date.now() - current.updatedAt.getTime() < STUCK_AFTER_MS) return { ok: false, error: "busy" };
    const messages = [...((current.messages as unknown as AgentMessage[]) ?? []), userMsg];
    await db.agentTask.update({
      where: { id: current.id },
      data: { messages: messages as unknown as Prisma.InputJsonValue, status: "RUNNING", locale: lang, profileId },
    });
    taskId = current.id;
  } else {
    const created = await db.agentTask.create({
      data: {
        profileId,
        userId: viewer.profile.userId,
        title: text.slice(0, 80),
        locale: lang,
        messages: [userMsg] as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    taskId = created.id;
  }

  after(() => runTurn(taskId));
  return { ok: true, taskId, task: await loadTask(viewer, taskId).catch(() => null) };
}

/** Delete a chat for good: its trace goes with it; a broker's open question keeps its row, unlinked. */
export async function deleteAgentChat(taskId: string): Promise<{ ok: boolean }> {
  if (!taskId) return { ok: false };
  const viewer = await requireProfile();
  const { count } = await db.agentTask.deleteMany({ where: { id: taskId, ...ownedBy(viewer) } });
  return { ok: count > 0 };
}

const FEEDBACK = ["good", "bad"] as const;

/** The 👍 / 👎 on an answer — kept as a silent trace row, so answer quality can be counted. */
export async function noteAgentFeedback(input: { taskId: string; at: string; kind: (typeof FEEDBACK)[number] | null }): Promise<{ ok: boolean }> {
  if (!input.taskId || (input.kind !== null && !FEEDBACK.includes(input.kind))) return { ok: false };
  const viewer = await requireProfile();
  const task = await db.agentTask.findFirst({ where: { id: input.taskId, ...ownedBy(viewer) }, select: { id: true } });
  if (!task) return { ok: false };
  await appendTaskEvent(task.id, "feedback", "done", { kind: input.kind, at: String(input.at).slice(0, 40) });
  return { ok: true };
}
