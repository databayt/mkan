/**
 * The sprint loop, live — what /monetize's top card shows and polls (GET /api/monetize/live every 15 s).
 * Pure: built from the open sprints (sprint-shape.ts) and two WaState rows — 'sprint-loop' (the runner's
 * beat on every state change, scripts/sprint/beat.ts) and 'mac-beat' (kun's supervisor, every 15 min).
 * A Mac that sleeps writes neither, so "offline" is read from their age, never written.
 */
import { redactPublic } from "@/lib/redact";

import type { DecisionRecord } from "./actions";
import type { SprintPromptView, SprintsView } from "./sprint-shape";

export type LoopState = "checking" | "planning" | "running" | "idle" | "waiting" | "parked" | "stopped" | "offline";

export interface LiveTask {
  id: string;
  title: string;
  block: string | null;
  /** The full prompt (admins only; null on the public card). */
  text: string | null;
  /** Running: when it started. Done: when it ended. */
  at: string | null;
  /** The run's own report (admins only). */
  result: string | null;
  status: SprintPromptView["status"];
  /** A one-tap decision waiting on this step (admins only): the ask, what Yes does, and the answer so far. */
  decision?: { ask: string; effect: string; answer: "yes" | "no" | null; done: boolean; ok: boolean | null; output: string | null } | null;
}

export interface LiveView {
  state: LoopState;
  /** When the loop entered this state. */
  since: string | null;
  /** Parked: when it resumes by itself. */
  until: string | null;
  /** Why (admins only). */
  note: string | null;
  running: LiveTask | null;
  next: LiveTask | null;
  last: LiveTask | null;
  /** Waiting on Abdout: the task and the one thing he must do (admins see the ask). */
  needsYou: LiveTask[];
  doneToday: number;
  doneWeek: number;
  generatedAt: string;
}

export interface Beat {
  state?: string;
  since?: string | null;
  at?: string | null;
  until?: string | null;
  note?: string | null;
  promptId?: string | null;
}

const MIN = 60_000;
const STATES = new Set(["checking", "planning", "running", "idle", "waiting", "parked", "stopped"]);
/** No beat from the Mac for this long and nothing says it is parked or stopped: it is asleep or off. */
const OFFLINE_AFTER = 40 * MIN;

const firstLine = (t: string) => t.replace(/^In ~\/mkan[^:]*:\s*/, "").split("\n")[0]!.slice(0, 140);

function task(p: SprintPromptView, blockOf: Map<string, string | null>, decisions?: Record<string, DecisionRecord>): LiveTask {
  const d = decisions?.[p.id];
  return {
    decision: d
      ? { ask: d.ask, effect: d.effect, answer: d.decision ?? null, done: !!d.consumedAt, ok: d.outcome ? d.outcome.ok : null, output: d.outcome?.output?.slice(0, 200) ?? null }
      : null,
    id: p.id,
    title: p.taskTitle ?? firstLine(p.text),
    block: p.taskId ? (blockOf.get(p.taskId) ?? null) : null,
    text: p.text,
    at: p.processedAt,
    result: p.result,
    status: p.status,
  };
}

export function liveView(sprints: SprintsView, beat: Beat | null, macBeatAt: string | null, now = new Date(), decisions?: Record<string, DecisionRecord>): LiveView {
  const blockOf = new Map<string, string | null>();
  for (const s of [sprints.week, sprints.month]) for (const t of s?.tasks ?? []) blockOf.set(t.id, t.block);
  const prompts = sprints.prompts;
  const running = prompts.find((p) => p.status === "running");
  const next = prompts.find((p) => p.status === "pending");
  const done = prompts.filter((p) => (p.status === "processed" || p.status === "skipped") && p.processedAt).sort((a, b) => (b.processedAt! < a.processedAt! ? -1 : 1));
  const dayAgo = now.getTime() - 24 * 60 * MIN;
  const weekAgo = now.getTime() - 7 * 24 * 60 * MIN;

  const ages = [beat?.at, macBeatAt].filter((x): x is string => !!x).map((x) => now.getTime() - Date.parse(x));
  const freshest = ages.length ? Math.min(...ages) : Infinity;
  let state: LoopState = beat?.state && STATES.has(beat.state) ? (beat.state as LoopState) : "stopped";
  // A run in flight beats less than every 15 min, so "running" holds on the Mac's own beat; parked and
  // stopped are decisions, not liveness, and stand until they change.
  if (state !== "parked" && state !== "stopped" && freshest > OFFLINE_AFTER) state = "offline";
  if (state === "parked" && beat?.until && Date.parse(beat.until) < now.getTime() - 15 * MIN) state = freshest > OFFLINE_AFTER ? "offline" : "checking";

  return {
    state,
    since: beat?.since ?? null,
    until: state === "parked" ? (beat?.until ?? null) : null,
    note: beat?.note ?? null,
    running: running ? task(running, blockOf) : null,
    next: next ? task(next, blockOf) : null,
    last: done[0] ? task(done[0], blockOf) : null,
    needsYou: prompts.filter((p) => p.status === "blocked").map((p) => task(p, blockOf, decisions)),
    doneToday: done.filter((p) => Date.parse(p.processedAt!) >= dayAgo && p.status === "processed").length,
    doneWeek: done.filter((p) => Date.parse(p.processedAt!) >= weekAgo && p.status === "processed").length,
    generatedAt: now.toISOString(),
  };
}

/** What an anonymous visitor may see: the state and the task titles, never a prompt, a result or a note. */
export function publicLive(v: LiveView): LiveView {
  const t = (x: LiveTask | null): LiveTask | null => (x ? { ...x, title: redactPublic(x.title), text: null, result: null, decision: null } : null);
  return { ...v, note: null, running: t(v.running), next: t(v.next), last: t(v.last), needsYou: v.needsYou.map((x) => t(x)!) };
}
