import "server-only";

/**
 * One agent turn: read the tenant's message, then search → group → filter →
 * (widen) → rank → shortlist. Nothing is asked before the first homes: a
 * search without a stay type runs as monthly rent and offers the stay
 * question under the cards. Every step writes
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
  clearFields,
  coerceRequirements,
  EMPTY_REQUIREMENTS,
  inferStay,
  mergeRequirements,
  parseAdjustments,
  parseRequirements,
  reconcile,
  type Requirements,
} from "./requirements";
import { relaxations, type Relaxed } from "./relax";
import { searchKigali, toShortlist } from "./search";
import { requestConfirmations } from "./broker";
import type { AgentMessage, EventKind, StepStatus } from "./types";

const json = (v: unknown) => v as Prisma.InputJsonValue;
/** Rows loaded once for the zero-match widening; Kigali holds ~4.7k homes in all. */
const WIDE_POOL = 2_000;

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
    await this.recordMany([[kind, status, payload]]);
  }

  /** Several finished steps in one round trip; seqs are taken before the write, in order. */
  async recordMany(rows: [EventKind, StepStatus, Record<string, unknown>][]) {
    const data = rows.map(([kind, status, payload]) => ({ taskId: this.taskId, seq: ++this.seq, kind, status, payload: json(payload) }));
    await db.agentEvent.createMany({ data });
  }
}

/** The agent's reply and the task's new state in one write. */
async function reply(taskId: string, messages: AgentMessage[], msg: AgentMessage, data: Prisma.AgentTaskUpdateInput = {}) {
  await db.agentTask.update({ where: { id: taskId }, data: { ...data, messages: json([...messages, msg]) } });
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
    const lastUser = userMessages.at(-1);
    const picked = coerceRequirements(lastUser?.filters);
    const base = mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements(task.requirements));
    const parsed = parseRequirements(latest);
    const adjust = parseAdjustments(latest, base);
    // A tap (picks, an answer card, a refine chip) sets exact fields, so the
    // model has nothing to add and its 0.3–3.5 s is skipped.
    const tapped = Object.keys(picked).length > 0 || (lastUser?.clear?.length ?? 0) > 0;
    // The step's "running" row and the model call overlap: neither waits on the other.
    const [understandId, llm] = await Promise.all([
      trace.start("requirements_extracted"),
      tapped ? null : readRequirementsWithGroq(latest, base, userTexts.slice(0, -1)),
    ]);
    // The model reads the newest message against the search so far; the regex
    // reader wins on every field it found; taps (picks, refine chips) are
    // exact, so they win over both. Clears apply last, except over a field this
    // turn stated outright.
    const stated: Partial<Requirements> = { ...coerceRequirements(parsed), ...adjust.set, ...picked };
    let requirements: Requirements = mergeRequirements(mergeRequirements(base, llm?.set ?? {}), stated);
    const clears = [...(llm?.clear ?? []), ...adjust.clear].filter((k) => stated[k] == null);
    requirements = clearFields(requirements, [...clears, ...(lastUser?.clear ?? [])]);
    requirements = inferStay(reconcile(base, requirements, stated));
    // No stay type yet: search monthly rent (every home, nightly ones priced by
    // the month) and ask months-or-nights under the cards instead of before them.
    const assumed = !requirements.stay;
    const query: Requirements = assumed ? { ...requirements, stay: "long" } : requirements;
    const understood = trace.finish(understandId, "done", { requirements, reader: tapped ? "taps" : llm ? "groq" : "rules" });

    // 2. Search mkan — the bookkeeping writes ride alongside the query.
    const [searchId, { candidates }] = await Promise.all([
      trace.start("search_done"),
      searchKigali(query),
      understood,
      db.agentTask.update({ where: { id: task.id }, data: { requirements: json(requirements) } }),
    ]);

    // 3–4. Group duplicate ads, apply the hard filters, rank.
    let result = rankCandidates(candidates, query);
    await Promise.all([
      trace.finish(searchId, "done", { candidates: candidates.length }),
      trace.recordMany([
        ["dedup_grouped", "done", { removed: result.duplicatesRemoved }],
        ["filtered", "done", { matching: result.matching }],
      ]),
    ]);

    // Nothing fits every detail: widen one detail at a time until homes appear,
    // and say which ones. The tenant's own requirements stay as they said them.
    let relaxed: Relaxed[] = [];
    if (result.ranked.length === 0) {
      // One wide load serves every attempt: the widest ladder step is a superset
      // of all the others, and rankCandidates re-applies each attempt's hard
      // filters in memory. This used to be one query per attempt — up to 13
      // searches (plus 13 broker-answer reads) on a single zero-match turn.
      // Only a pool that hit its cap can be missing rows; then the old way runs.
      const attempts = relaxations(query);
      const widest = attempts.reduce((w, a) => (a.steps.length > w.steps.length ? a : w), attempts[0]!);
      const [relaxId, tried] = await Promise.all([
        trace.start("relaxed"),
        attempts.length === 0
          ? Promise.resolve([])
          : searchKigali(widest.requirements, { take: WIDE_POOL }).then(async (pool) =>
              pool.truncated
                ? Promise.all(
                    attempts.map(async (attempt) => {
                      const found = await searchKigali(attempt.requirements);
                      return { attempt, ranked: rankCandidates(found.candidates, attempt.requirements) };
                    }),
                  )
                : attempts.map((attempt) => ({ attempt, ranked: rankCandidates(pool.candidates, attempt.requirements) })),
            ),
      ]);
      const best = tried
        .filter((t) => t.ranked.ranked.length > 0)
        .sort((x, y) => x.attempt.steps.length - y.attempt.steps.length)[0];
      if (best) {
        result = best.ranked;
        relaxed = best.attempt.steps;
      }
      await trace.finish(relaxId, relaxed.length ? "done" : "failed", { count: relaxed.length, keys: relaxed.map((s) => s.key), matching: result.matching });
    }
    if (result.ranked.length === 0) {
      await trace.record("ranked", "done", { top: 0 });
      await reply(task.id, messages, { role: "agent", kind: "none", stay: query.stay ?? undefined, at: now() }, { shortlist: json([]), status: "DONE" });
      return;
    }

    // 5. The cards go up now; the brokers are asked after, while the tenant reads.
    const [cards] = await Promise.all([toShortlist(result.ranked, lang), trace.record("ranked", "done", { top: result.ranked.length })]);
    let shortlist = cards;
    const unconfirmed = shortlist.filter((s) => s.availability === "unconfirmed").length;
    const answer: AgentMessage = {
      role: "agent",
      kind: "shortlist",
      count: shortlist.length,
      ...(relaxed.length ? { relaxed } : {}),
      // One follow-up at a time: months-or-nights first, then a ceiling.
      ...(assumed ? { refine: "stay" as const } : !requirements.maxPrice && !requirements.cheap ? { refine: "maxPrice" as const } : {}),
      at: now(),
    };
    await Promise.all([
      unconfirmed > 0 ? trace.record("needs_confirmation", "uncertain", { count: unconfirmed }) : null,
      reply(task.id, messages, answer, { shortlist: json(shortlist) }),
    ]);
    // A guessed stay type does not reach a broker: they are asked once the tenant says months.
    const asked = new Set(assumed ? [] : await requestConfirmations(task.id, shortlist, requirements, lang));
    trace.resync(await lastSeq(task.id));
    if (asked.size > 0) {
      shortlist = shortlist.map((s) => (asked.has(s.id) ? { ...s, availability: "asked" as const } : s));
    }

    await trace.record("shortlist_ready", "done", { count: shortlist.length });
    await db.agentTask.update({
      where: { id: task.id },
      data: { ...(asked.size > 0 ? { shortlist: json(shortlist) } : {}), status: asked.size > 0 ? "WAITING" : "DONE" },
    });
  } catch (err) {
    console.error("[agent] turn failed", err);
    await trace.record("failed", "failed", {}).catch(() => {});
    await reply(task.id, messages, { role: "agent", kind: "error", at: now() }, { status: "FAILED" }).catch(() => {});
  }
}
