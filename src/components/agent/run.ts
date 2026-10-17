import "server-only";

/**
 * One agent turn: read the tenant's message, then either ask for the missing
 * hard field or search → group → filter → rank → shortlist. Every step writes
 * an AgentEvent before and after it runs, so the panel shows exactly what the
 * system is doing — a step with no row did not happen.
 *
 * Runs inside `after()` from the server action, so the tenant's tab polls the
 * events while the work happens; closing the tab does not stop it.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Locale } from "@/components/internationalization/config";
import { readRequirementsWithGroq } from "./llm";
import { rankCandidates } from "./rank";
import {
  coerceRequirements,
  EMPTY_REQUIREMENTS,
  mergeRequirements,
  missingHardField,
  parseRequirements,
  type Requirements,
} from "./requirements";
import { searchKigali, toShortlist } from "./search";
import { requestConfirmations } from "./broker";
import type { AgentMessage, EventKind, StepStatus } from "./types";

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function lastSeq(taskId: string): Promise<number> {
  const last = await db.agentEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
  return last?.seq ?? 0;
}

class Trace {
  private seq: number;
  /** Other writers (the broker loop) append events too; continue after them. */
  resync(seq: number) {
    this.seq = Math.max(this.seq, seq);
  }

  constructor(
    private taskId: string,
    lastSeq: number,
  ) {
    this.seq = lastSeq;
  }

  async start(kind: EventKind, payload: Record<string, unknown> = {}): Promise<number> {
    this.seq += 1;
    const row = await db.agentEvent.create({
      data: { taskId: this.taskId, seq: this.seq, kind, status: "running", payload: json(payload) },
      select: { id: true },
    });
    return row.id;
  }

  async finish(id: number, status: StepStatus, payload: Record<string, unknown> = {}) {
    await db.agentEvent.update({ where: { id }, data: { status, payload: json(payload) } });
  }

  async record(kind: EventKind, status: StepStatus, payload: Record<string, unknown> = {}) {
    this.seq += 1;
    await db.agentEvent.create({
      data: { taskId: this.taskId, seq: this.seq, kind, status, payload: json(payload) },
    });
  }
}

async function appendAgentMessage(taskId: string, messages: AgentMessage[], msg: AgentMessage) {
  await db.agentTask.update({ where: { id: taskId }, data: { messages: json([...messages, msg]) } });
}

export async function runTurn(taskId: string): Promise<void> {
  const task = await db.agentTask.findUnique({
    where: { id: taskId },
    select: { id: true, locale: true, messages: true, requirements: true, events: { select: { seq: true }, orderBy: { seq: "desc" }, take: 1 } },
  });
  if (!task) return;
  const messages = (task.messages as unknown as AgentMessage[]) ?? [];
  const trace = new Trace(task.id, task.events[0]?.seq ?? 0);
  const lang = task.locale as Locale;
  const now = () => new Date().toISOString();

  try {
    // 1. Understand the request.
    const userMessages = messages.filter((m): m is Extract<AgentMessage, { role: "user" }> => m.role === "user");
    const userTexts = userMessages.map((m) => m.text);
    const latest = userTexts[userTexts.length - 1] ?? "";
    const picked = coerceRequirements(userMessages.at(-1)?.filters);
    const understandId = await trace.start("requirements_extracted");
    const base = mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements(task.requirements));
    const llm = await readRequirementsWithGroq(userTexts);
    // The model reads the whole conversation; the regex reader reads the
    // latest message and wins on every field it found.
    // Badges are exact, so they win over both readers.
    const requirements: Requirements = mergeRequirements(
      mergeRequirements(mergeRequirements(base, llm ?? {}), parseRequirements(latest)),
      picked,
    );
    await db.agentTask.update({ where: { id: task.id }, data: { requirements: json(requirements) } });
    await trace.finish(understandId, "done", { requirements, reader: llm ? "groq" : "rules" });

    const missing = missingHardField(requirements);
    if (missing) {
      await trace.record("asked", "waiting_person", { field: missing });
      await appendAgentMessage(task.id, messages, { role: "agent", kind: "ask", field: missing, at: now() });
      await db.agentTask.update({ where: { id: task.id }, data: { status: "DONE" } });
      return;
    }

    // 2. Search mkan.
    const searchId = await trace.start("search_done");
    const { rows, candidates } = await searchKigali(requirements);
    await trace.finish(searchId, "done", { candidates: candidates.length });

    // 3–4. Group duplicate ads, apply the hard filters, rank.
    const result = rankCandidates(candidates, requirements);
    await trace.record("dedup_grouped", "done", { removed: result.duplicatesRemoved });
    await trace.record("filtered", "done", { matching: result.matching });
    await trace.record("ranked", "done", { top: result.ranked.length });

    if (result.ranked.length === 0) {
      await db.agentTask.update({ where: { id: task.id }, data: { shortlist: json([]), status: "DONE" } });
      await appendAgentMessage(task.id, messages, { role: "agent", kind: "none", stay: requirements.stay ?? undefined, at: now() });
      return;
    }

    // 5. Availability: ask the brokers who can answer; say plainly which
    //    homes nobody can confirm.
    let shortlist = await toShortlist(result.ranked, rows, lang);
    const unconfirmed = shortlist.filter((s) => s.availability === "unconfirmed").length;
    if (unconfirmed > 0) await trace.record("needs_confirmation", "uncertain", { count: unconfirmed });
    await db.agentTask.update({ where: { id: task.id }, data: { shortlist: json(shortlist) } });
    const asked = new Set(await requestConfirmations(task.id, shortlist, requirements, lang));
    trace.resync(await lastSeq(task.id));
    if (asked.size > 0) {
      shortlist = shortlist.map((s) => (asked.has(s.id) ? { ...s, availability: "asked" as const } : s));
    }

    await trace.record("shortlist_ready", "done", { count: shortlist.length });
    await db.agentTask.update({ where: { id: task.id }, data: { shortlist: json(shortlist), status: asked.size > 0 ? "WAITING" : "DONE" } });
    await appendAgentMessage(task.id, messages, { role: "agent", kind: "shortlist", count: shortlist.length, at: now() });
  } catch (err) {
    console.error("[agent] turn failed", err);
    await trace.record("failed", "failed", {}).catch(() => {});
    await appendAgentMessage(task.id, messages, { role: "agent", kind: "error", at: now() }).catch(() => {});
    await db.agentTask.update({ where: { id: task.id }, data: { status: "FAILED" } }).catch(() => {});
  }
}
