import "server-only";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { STUCK_AFTER_MS } from "./task-view";
import type { AgentMessage } from "./types";

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
}): Promise<{ taskId: string } | { busy: true }> {
  const { current, message, lang, profileId } = input;
  if (current) {
    if (current.status === "RUNNING" && Date.now() - current.updatedAt.getTime() < STUCK_AFTER_MS) return { busy: true };
    const messages = [...((current.messages as unknown as AgentMessage[]) ?? []), message];
    await db.agentTask.update({
      where: { id: current.id },
      data: { messages: messages as unknown as Prisma.InputJsonValue, status: "RUNNING", locale: lang, profileId },
    });
    return { taskId: current.id };
  }
  const created = await db.agentTask.create({
    data: {
      profileId,
      userId: input.userId,
      title: (input.seed?.messages.find((m) => m.role === "user") as { text?: string } | undefined)?.text?.slice(0, 80) ?? message.text.slice(0, 80),
      locale: lang,
      messages: [...(input.seed?.messages ?? []), message] as unknown as Prisma.InputJsonValue,
      ...(input.seed?.requirements ? { requirements: input.seed.requirements as Prisma.InputJsonValue } : {}),
    },
    select: { id: true },
  });
  return { taskId: created.id };
}
