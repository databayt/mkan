import "server-only";

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STUCK_AFTER_MS } from "./task-view";
import type { AgentMessage } from "./types";

/** STUCK_AFTER_MS as SQL: a turn lost that long ago no longer holds the chat. */
const STUCK_INTERVAL = Prisma.raw(`interval '${Math.round(STUCK_AFTER_MS / 1000)} seconds'`);

/** A task the message may continue: the viewer's own, already looked up. */
export interface CurrentTask {
  id: string;
  status: string;
  messages: Prisma.JsonValue;
  updatedAt: Date;
}

/**
 * Put the tenant's message on the chat — the next turn of `current`, or a new
 * task — and mark it RUNNING. Shared by the web send and WhatsApp. A turn lost
 * mid-way is not "busy": the next message simply runs.
 */
export async function appendUserMessage(input: {
  profileId: string;
  userId: string | null;
  current: CurrentTask | null;
  message: Extract<AgentMessage, { role: "user" }>;
  lang: string;
  /** A new task starts from these (the web chat a WhatsApp ref carries over). */
  seed?: { messages: AgentMessage[]; requirements: Prisma.JsonValue };
  /**
   * Where a NEW chat came from — "web", or whatsapp-format refSourceOf's tiktok / k_page / organic —
   * so every chat is attributed (2026-11-07: all 90 had none; only TikTok-coded ones were stamped).
   */
  refSource?: string | null;
}): Promise<{ taskId: string } | { busy: true }> {
  const { current, message, lang, profileId } = input;
  if (current) {
    if (current.status === "RUNNING" && Date.now() - current.updatedAt.getTime() < STUCK_AFTER_MS) return { busy: true };
    // One conditional statement, not read-then-write: of two sends at once (two tabs, a web send and a
    // WhatsApp one) the first lands and runs, the other is "busy" and its caller keeps the text
    // (2026-11-06: the second write replaced the first's array, and that message was gone).
    const said = JSON.stringify([message]);
    const landed = await db.$executeRaw`UPDATE "AgentTask" SET "messages" = COALESCE("messages", '[]'::jsonb) || ${said}::jsonb, "status" = 'RUNNING', "locale" = ${lang}, "profileId" = ${profileId}, "updatedAt" = now() WHERE "id" = ${current.id} AND ("status" <> 'RUNNING' OR "updatedAt" < now() - ${STUCK_INTERVAL})`;
    return landed > 0 ? { taskId: current.id } : { busy: true };
  }
  const created = await db.agentTask.create({
    data: {
      profileId,
      userId: input.userId,
      title: (input.seed?.messages.find((m) => m.role === "user") as { text?: string } | undefined)?.text?.slice(0, 80) ?? message.text.slice(0, 80),
      locale: lang,
      messages: [...(input.seed?.messages ?? []), message] as unknown as Prisma.InputJsonValue,
      ...(input.seed?.requirements ? { requirements: input.seed.requirements as Prisma.InputJsonValue } : {}),
      ...(input.refSource ? { refSource: input.refSource } : {}),
    },
    select: { id: true },
  });
  return { taskId: created.id };
}

/**
 * Take a chat back for one more turn on the tenant's last message — a WhatsApp retry whose turn died (a
 * restart) or left only the error, which nobody sent. Trailing error replies are dropped so the new turn's
 * answer stands in their place. Conditional on the row being as it was read and not live-RUNNING, so a
 * second pass, or a new message landing meanwhile, wins instead (2026-11-08).
 */
export async function reopenForTurn(taskId: string): Promise<boolean> {
  const t = await db.agentTask.findUnique({ where: { id: taskId }, select: { status: true, updatedAt: true, messages: true } });
  if (!t) return false;
  if (t.status === "RUNNING" && Date.now() - t.updatedAt.getTime() < STUCK_AFTER_MS) return false;
  const list = (t.messages as unknown as AgentMessage[]) ?? [];
  let end = list.length;
  while (end > 0 && list[end - 1]!.role === "agent" && (list[end - 1] as { kind?: string }).kind === "error") end -= 1;
  const res = await db.agentTask.updateMany({
    where: { id: taskId, updatedAt: t.updatedAt },
    data: { status: "RUNNING", messages: list.slice(0, end) as unknown as Prisma.InputJsonValue },
  });
  return res.count === 1;
}
