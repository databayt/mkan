import "server-only";
/**
 * A chat the agent could not answer (the 15 s deadline, a throw before the first reply, a turn the cron
 * unlocked) shows the tenant the error and "Try again" — but a tenant who has left the tab got nothing and
 * nobody knew. Each such failure now posts one #mkan card with the chat and the tenant's last words, so a
 * person can answer by hand (2026-11-08). Never throws; a Slack outage must not fail the failure path.
 */
import { db } from "@/lib/db";
import { waLink } from "../../../scripts/crm/public-links";
import { TENANT_REACH, tenantNumber } from "./broker-gate";
import { postSlackCard } from "./whatsapp";
import type { AgentMessage } from "./types";

export type FailWhy = "deadline" | "threw" | "turn-failed" | "stuck";

/**
 * The card text — pure, so the test replays it. It carries the tenant's number when the chat has one (the
 * WhatsApp chat's, or one a web tenant left) — "answer by hand" with no way to reach them was no answer.
 */
export function failedChatCard(taskId: string, why: FailWhy, lastUserText: string | null, tenant: string | null = null): string {
  const said = (lastUserText ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  const who = tenant ? `\nTenant: <${waLink(tenant, "")}|${tenant}>` : "\nTenant: web chat, no number left";
  return `⚠️ A tenant wrote and the agent could not answer (${why}) — chat ${taskId}. Answer by hand:${said ? `\n> ${said}` : ""}${who}`;
}

/** The last thing the tenant said in a task's messages. */
export function lastUserText(messages: unknown): string | null {
  const list = Array.isArray(messages) ? (messages as AgentMessage[]) : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]!;
    if (m.role === "user") return typeof (m as { text?: unknown }).text === "string" ? (m as { text: string }).text : null;
  }
  return null;
}

export async function handOffFailedChat(taskId: string, why: FailWhy): Promise<void> {
  try {
    const task = await db.agentTask.findUnique({ where: { id: taskId }, select: { messages: true, ...TENANT_REACH } });
    await postSlackCard(failedChatCard(taskId, why, lastUserText(task?.messages), tenantNumber(task)));
  } catch (err) {
    console.warn(`[agent] failed-chat hand-off not posted for ${taskId}: ${(err as Error).message}`);
  }
}
