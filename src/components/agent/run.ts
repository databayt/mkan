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
import { DISTRICTS } from "@/lib/geo/rwanda-places";
import { coerceMemory, memoryChanged, rememberTurn, type AgentMemory, type PrefField } from "./memory";
import { rankCandidates } from "./rank";
import { readRequirements, type Reading } from "./reader";
import { canWrite, writeAnswer, writeReply, writerFacts, type WriterFacts } from "./writer";
import {
  clarifyFields,
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
import { openDemand } from "./demand";
import { requestConfirmations } from "./broker";
import type { AgentMessage, EventKind, ShortlistItem, StepStatus } from "./types";

const json = (v: unknown) => v as Prisma.InputJsonValue;
/**
 * What the rules may still fill beside Claude's reading: words they rarely
 * misread. Never money — any figure ≥ 1,000 reads as a budget to a regex, so a
 * phone number or a year would become one — and never nights: "moving in 10
 * days" reads as a 10-night stay.
 */
const RULES_FILL_BESIDE_CLAUDE: readonly (keyof Requirements)[] = [
  "stay",
  "district",
  "neighbourhood",
  "bedrooms",
  "bathrooms",
  "furnished",
  "homeType",
  "area",
  "purpose",
  "waterIncluded",
  "noCommission",
  "cheap",
  "guests",
];
/** Rows loaded once for the zero-match widening; Kigali holds ~4.7k homes in all. */
const WIDE_POOL = 2_000;
/**
 * A turn with no reply by now answers with the error (and the tenant's "Try
 * again") instead of leaving the chat silent: one sat 27 s on a starved
 * container and the database before it failed (2026-10-22).
 */
const TURN_DEADLINE_MS = 15_000;

/** One turn's write gate: once the deadline has answered, nothing from the turn writes. */
interface Gate {
  /** The first reply is being written — the deadline stands down. */
  claimed: boolean;
  /** The deadline wrote the error reply — every later write of this turn is dropped. */
  abandoned: boolean;
}

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
    private gate?: Gate,
  ) {
    this.seq = lastSeq;
  }

  async start(kind: EventKind, payload: Record<string, unknown> = {}): Promise<number> {
    if (this.gate?.abandoned) return -1;
    this.seq += 1;
    const row = await db.agentEvent.create({
      data: { taskId: this.taskId, seq: this.seq, kind, status: "running", payload: json(payload) },
      select: { id: true },
    });
    return row.id;
  }

  async finish(id: number, status: StepStatus, payload: Record<string, unknown> = {}) {
    if (id < 0 || this.gate?.abandoned) return;
    await db.agentEvent.update({ where: { id }, data: { status, payload: json(payload) } });
  }

  async record(kind: EventKind, status: StepStatus, payload: Record<string, unknown> = {}) {
    await this.recordMany([[kind, status, payload]]);
  }

  /** Several finished steps in one round trip; seqs are taken before the write, in order. */
  async recordMany(rows: [EventKind, StepStatus, Record<string, unknown>][]) {
    if (this.gate?.abandoned) return;
    const data = rows.map(([kind, status, payload]) => ({ taskId: this.taskId, seq: ++this.seq, kind, status, payload: json(payload) }));
    await db.agentEvent.createMany({ data });
  }
}

const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Groq (a 20B model) names places the tenant never wrote — "near Kigali
 * Heights" came back as Kicukiro. A place it reads counts only when the
 * message names it (in English, Kinyarwanda or Arabic).
 */
function groundGroqPlaces(set: Partial<Requirements>, text: string): Partial<Requirements> {
  const said = plain(text);
  const out = { ...set };
  if (out.neighbourhood && !said.includes(plain(out.neighbourhood))) delete out.neighbourhood;
  if (out.district) {
    const d = DISTRICTS.find((x) => x.code === out.district);
    if (!d || !(said.includes(plain(d.code)) || text.includes(d.nameAr))) delete out.district;
  }
  return out;
}

/**
 * Fields the reader set from memory rather than from the message: equal to a
 * remembered value, and nothing in the message itself (the rules found none).
 */
function fromMemory(reading: Reading | null, memory: AgentMemory, rules: Partial<Requirements>): string[] {
  if (!reading) return [];
  return Object.entries(reading.set)
    .filter(([k, v]) => {
      const pref = memory.prefs[k as keyof AgentMemory["prefs"]];
      return pref && JSON.stringify(pref.value) === JSON.stringify(v) && rules[k as keyof Requirements] == null;
    })
    .map(([k]) => k);
}

/** What this turn teaches the profile's memory — read, merged and written in one transaction. */
async function remember(profileId: string | null, turn: Parameters<typeof rememberTurn>[1]): Promise<void> {
  if (!profileId) return;
  await db
    .$transaction(async (tx) => {
      const row = await tx.agentProfile.findUnique({ where: { id: profileId }, select: { memory: true } });
      if (!row) return;
      const before = coerceMemory(row.memory);
      const after = rememberTurn(before, turn);
      if (!memoryChanged(before, after)) return;
      await tx.agentProfile.update({
        where: { id: profileId },
        data: { memory: json(after), ...(turn.shown.length ? { lastSearchAt: turn.now } : {}) },
      });
    })
    .catch((err) => console.warn(`[agent] memory not saved: ${(err as Error).message}`));
}

/** The agent's reply and the task's new state in one write. */
async function reply(taskId: string, messages: AgentMessage[], msg: AgentMessage, data: Prisma.AgentTaskUpdateInput = {}) {
  await db.agentTask.update({ where: { id: taskId }, data: { ...data, messages: json([...messages, msg]) } });
}

/** Append one agent message without reading the task first — the deadline's error, written even if the task never loaded. */
async function appendReply(taskId: string, msg: AgentMessage, status: "FAILED") {
  await db.$executeRaw`UPDATE "AgentTask" SET "messages" = "messages" || ${JSON.stringify([msg])}::jsonb, "status" = ${status}::"AgentTaskStatus", "updatedAt" = now() WHERE "id" = ${taskId}`;
}

/**
 * Start a turn now — not after the send's response — and say when its first
 * reply is written. The send action waits on `shown` (a few seconds at most),
 * so a normal turn's cards come back in the send itself; `done` is everything,
 * broker asks included, and is handed to `after()` so the request outlives it.
 */
export function startTurn(taskId: string): { shown: Promise<void>; done: Promise<void> } {
  let show!: () => void;
  const shown = new Promise<void>((resolve) => (show = resolve));
  const done = runTurn(taskId, () => show()).finally(() => show());
  return { shown, done };
}

export async function runTurn(taskId: string, onShown: () => void = () => {}): Promise<void> {
  const gate: Gate = { claimed: false, abandoned: false };
  const deadline = setTimeout(() => {
    if (gate.claimed) return;
    gate.abandoned = true;
    console.warn(`[agent] turn ${taskId} had no reply after ${TURN_DEADLINE_MS} ms; answering with the error`);
    void appendReply(taskId, { role: "agent", kind: "error", at: new Date().toISOString() }, "FAILED")
      .catch((err) => console.error("[agent] deadline reply not written", err))
      .finally(onShown);
  }, TURN_DEADLINE_MS);
  try {
    await turn(taskId, gate, onShown);
  } finally {
    clearTimeout(deadline);
  }
}

async function turn(taskId: string, gate: Gate, onShown: () => void): Promise<void> {
  const task = await db.agentTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      locale: true,
      messages: true,
      requirements: true,
      shortlist: true,
      profileId: true,
      profile: { select: { memory: true } },
      events: { select: { seq: true }, orderBy: { seq: "desc" }, take: 1 },
    },
  });
  if (!task) return;
  const messages = (task.messages as unknown as AgentMessage[]) ?? [];
  const trace = new Trace(task.id, task.events[0]?.seq ?? 0, gate);
  const lang = task.locale as Locale;
  const now = () => new Date().toISOString();
  // The server's own clock for this turn (ms from its start), read by `pnpm agent:latency`.
  const t0 = Date.now();
  const ms: Record<string, number> = {};
  const mark = (step: string) => (ms[step] = Date.now() - t0);
  /** The turn's first reply — unless the deadline has already answered. True when written. */
  const firstReply = async (msg: AgentMessage, data: Prisma.AgentTaskUpdateInput = {}): Promise<boolean> => {
    if (gate.abandoned) return false;
    gate.claimed = true;
    try {
      await reply(task.id, messages, msg, data);
    } catch (err) {
      // Not written after all: the deadline (or the catch below) still answers.
      gate.claimed = false;
      throw err;
    }
    onShown();
    return true;
  };

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
    const memory = coerceMemory(task.profile?.memory);
    const shown = (task.shortlist as unknown as ShortlistItem[] | null) ?? [];
    // The step's "running" row and the model call overlap: neither waits on the other.
    const [understandId, reading] = await Promise.all([
      trace.start("requirements_extracted"),
      tapped
        ? null
        : readRequirements({ latest, current: base, history: messages.slice(0, -1), shown, memory, newChat: userMessages.length === 1 }),
    ]);
    mark("read");
    // Who wins a field: taps (picks, refine chips) are exact and beat everything.
    // Claude's reading is trusted whole — the rules only fill what it left
    // alone, and its own "cheaper" / "anywhere" replace the rules' phrases. With
    // Groq (a 20B model that misreads "400k") the rules win every field they
    // found, as before. With no model, the rules read alone.
    const rules = coerceRequirements(parsed);
    const byClaude = reading?.by === "claude";
    const llmSet = reading?.by === "groq" ? groundGroqPlaces(reading.set, latest) : reading?.set ?? {};
    const filled: Partial<Requirements> = byClaude
      ? Object.fromEntries(
          Object.entries(rules).filter(
            ([k]) => RULES_FILL_BESIDE_CLAUDE.includes(k as keyof Requirements) && !(k in llmSet) && !reading.clear.includes(k as never),
          ),
        )
      : { ...rules, ...adjust.set };
    const stated: Partial<Requirements> = byClaude ? { ...filled, ...llmSet, ...picked } : { ...filled, ...picked };
    let requirements: Requirements = mergeRequirements(byClaude ? base : mergeRequirements(base, llmSet), stated);
    const clears = [...(reading?.clear ?? []), ...(byClaude ? [] : adjust.clear)].filter((k) => stated[k] == null);
    requirements = clearFields(requirements, [...clears, ...(lastUser?.clear ?? [])]);
    requirements = inferStay(reconcile(base, requirements, stated));
    const remembered = fromMemory(reading, memory, rules);
    // Homes the tenant passed on never come back — remembered ones, and the one this message rejects.
    const rejected = reading?.notLike ? shown[Number(reading.notLike.slice(1)) - 1]?.id : undefined;
    const excludeIds = [...new Set([...memory.dismissed, ...(rejected ? [rejected] : [])])];
    // No stay type yet: search monthly rent (every home, nightly ones priced by
    // the month) and ask months-or-nights under the cards instead of before them.
    const assumed = !requirements.stay;
    const query: Requirements = assumed ? { ...requirements, stay: "long" } : requirements;
    // memory_used takes its seq now, before the search step starts, so the trace reads in order.
    const understood = Promise.all([
      trace.finish(understandId, "done", {
        requirements,
        reader: tapped ? "taps" : reading?.by ?? "rules",
        ...(reading?.intent && reading.intent !== "search" ? { intent: reading.intent } : {}),
        ...(reading?.unplaced ? { unplaced: reading.unplaced } : {}),
        ...(reading?.like ? { like: reading.like } : {}),
        ...(reading?.notLike ? { notLike: reading.notLike } : {}),
      }),
      remembered.length ? trace.record("memory_used", "done", { fields: remembered }) : null,
    ]);
    // Memory keeps only what a trusted reader found: Claude's reading, the rules, or a tap —
    // never a field the 20B fallback model alone proposed.
    const trusted = new Set<string>(byClaude ? Object.keys(requirements) : [...Object.keys(rules), ...Object.keys(adjust.set), ...Object.keys(picked)]);
    const learn = (shownIds: number[]) =>
      remember(task.profileId, {
        requirements: Object.fromEntries(Object.entries(requirements).filter(([k]) => trusted.has(k))) as Partial<Record<PrefField, unknown>>,
        stayGuessed: !requirements.stay,
        tapped,
        remember: reading?.remember ?? [],
        forget: reading?.forget ?? [],
        shown: shownIds,
        now: new Date(),
      });

    // A question about renting, or a greeting, that changes nothing: answer it, no search.
    const asksOnly = byClaude && reading.intent !== "search" && Object.keys(reading.set).length === 0 && reading.clear.length === 0 && !tapped;
    if (asksOnly) {
      const writeLang = (reading.lang ?? lang) as WriterFacts["lang"];
      const text =
        reading.intent === "question" && reading.question && (await canWrite(writeLang)) ? await writeAnswer(reading.question, writeLang) : null;
      await Promise.all([understood, learn([]), text ? trace.record("reply_written", "done", { answer: true }) : null]);
      await firstReply(
        { role: "agent", kind: "answer", topic: reading.intent === "question" ? "question" : "other", ...(text ? { text } : {}), at: now() },
        { status: "DONE" },
      );
      return;
    }

    // A vague first message ("I need a house"): ask what is missing in one card before searching.
    const clarify = clarifyFields(requirements, { first: userMessages.length === 1, tapped });
    if (clarify) {
      await Promise.all([
        understood,
        learn([]),
        trace.record("asked", "waiting_person", { fields: clarify.join(", ") }),
      ]);
      await firstReply({ role: "agent", kind: "clarify", fields: clarify, at: now() }, { status: "DONE", requirements: json(requirements) });
      return;
    }

    // 2. Search mkan — the bookkeeping writes ride alongside the query.
    const [searchId, { candidates }] = await Promise.all([
      trace.start("search_done"),
      searchKigali(query, { excludeIds }),
      understood,
      db.agentTask.update({ where: { id: task.id }, data: { requirements: json(requirements) } }),
    ]);
    mark("search");

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
          : searchKigali(widest.requirements, { take: WIDE_POOL, excludeIds }).then(async (pool) =>
              pool.truncated
                ? Promise.all(
                    attempts.map(async (attempt) => {
                      const found = await searchKigali(attempt.requirements, { excludeIds });
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
    mark("rank");
    if (result.ranked.length === 0) {
      // Nothing on Mkan fits: keep the demand and ask the brokers who work the area.
      await Promise.all([trace.record("ranked", "done", { top: 0 }), learn([])]);
      // Past the deadline the tenant already has the error: no broker is asked on its behalf.
      if (gate.abandoned) return;
      const demand = await openDemand(task.id, task.profileId, query, lang).catch((err) => {
        console.warn(`[agent] demand not opened: ${(err as Error).message}`);
        return null;
      });
      trace.resync(await lastSeq(task.id));
      await firstReply(
        { role: "agent", kind: "none", stay: query.stay ?? undefined, ...(demand ? { demand: true, asked: demand.asked } : {}), at: now() },
        { shortlist: json([]), status: "DONE" },
      );
      return;
    }

    // 5. The cards go up now; the brokers are asked after, while the tenant reads.
    const [cards] = await Promise.all([toShortlist(result.ranked, lang, query.near?.name), trace.record("ranked", "done", { top: result.ranked.length })]);
    let shortlist = cards;
    const unconfirmed = shortlist.filter((s) => s.availability === "unconfirmed").length;
    // Claude writes the words when it can (language allowed, credits left); the cards never wait for it.
    const writeLang = (reading?.lang ?? lang) as WriterFacts["lang"];
    const willWrite = await canWrite(writeLang);
    const refine = assumed ? ("stay" as const) : !requirements.maxPrice && !requirements.cheap ? ("maxPrice" as const) : undefined;
    const answer: Extract<AgentMessage, { kind: "shortlist" }> = {
      role: "agent",
      kind: "shortlist",
      count: shortlist.length,
      ...(relaxed.length ? { relaxed } : {}),
      // One follow-up at a time: months-or-nights first, then a ceiling.
      ...(refine ? { refine } : {}),
      ...(willWrite ? { pendingText: true } : {}),
      at: now(),
    };
    const [, shownCards] = await Promise.all([
      unconfirmed > 0 ? trace.record("needs_confirmation", "uncertain", { count: unconfirmed }) : null,
      firstReply(answer, { shortlist: json(shortlist) }),
      learn(shortlist.map((s) => s.id)),
    ]);
    mark("cards");
    // Past the deadline the tenant already has the error: no broker is asked, nothing more is written.
    if (!shownCards) return;
    // The writer and the broker asks run side by side.
    const writing = willWrite
      ? writeReply(writerFacts({ lang: writeLang, requirements, relaxed, shortlist, refine, unplaced: reading?.unplaced })).catch(() => null)
      : Promise.resolve(null);
    // A guessed stay type does not reach a broker: they are asked once the tenant says months.
    const asked = new Set(assumed ? [] : await requestConfirmations(task.id, shortlist, requirements, lang));
    // Only widened homes fit: show them, and also ask the area's brokers for the real thing.
    const demand = relaxed.length && !assumed
      ? await openDemand(task.id, task.profileId, requirements, lang).catch((err) => {
          console.warn(`[agent] demand not opened: ${(err as Error).message}`);
          return null;
        })
      : null;
    const written = await writing;
    trace.resync(await lastSeq(task.id));
    if (asked.size > 0) {
      shortlist = shortlist.map((s) => (asked.has(s.id) ? { ...s, availability: "asked" as const } : s));
    }
    if (written?.why.size) shortlist = shortlist.map((s, i) => (written.why.has(`h${i + 1}`) ? { ...s, why: written.why.get(`h${i + 1}`) } : s));
    // The reply message, finished: the written text (when it passed the guard) replaces the pending mark.
    const finalAnswer: AgentMessage = { ...answer, pendingText: undefined, ...(written?.reply ? { text: written.reply } : {}), ...(demand ? { demand: true, asked: demand.asked } : {}) };

    await trace.recordMany([
      ...(written?.reply || written?.why.size ? [["reply_written", "done", { lines: written.why.size }] as [EventKind, StepStatus, Record<string, unknown>]] : []),
      ["shortlist_ready", "done", { count: shortlist.length, ms }],
    ]);
    await db.agentTask.update({
      where: { id: task.id },
      data: {
        ...(asked.size > 0 || written?.why.size ? { shortlist: json(shortlist) } : {}),
        ...(willWrite || demand ? { messages: json([...messages, finalAnswer]) } : {}),
        status: asked.size > 0 ? "WAITING" : "DONE",
      },
    });
  } catch (err) {
    console.error("[agent] turn failed", err);
    if (gate.abandoned) return;
    await trace.record("failed", "failed", {}).catch(() => {});
    if (gate.claimed) {
      // The reply is up; a later step (the writer, a broker ask) failed. Keep what the tenant sees.
      await db.agentTask.update({ where: { id: task.id }, data: { status: "DONE" } }).catch(() => {});
    } else {
      await firstReply({ role: "agent", kind: "error", at: now() }, { status: "FAILED" }).catch(() => {});
    }
  }
}
