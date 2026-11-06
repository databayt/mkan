/**
 * The sprint plan as /monetize shows it — pure, so the page, the CLI and the
 * tests share one shape. Rows come from Sprint / SprintTask / SprintPrompt.
 */
export type SprintKind = "WEEK" | "MONTH";
/** pending → running (the Mac runner took it) → processed | blocked (needs Abdout) | skipped */
export type PromptStatus = "pending" | "running" | "processed" | "skipped" | "blocked";
export const PROMPT_STATUSES: PromptStatus[] = ["pending", "running", "processed", "skipped", "blocked"];

export interface SprintTaskView {
  id: string;
  title: string;
  block: string | null;
  done: boolean;
  doneAt: string | null;
}
export interface SprintPromptView {
  id: string;
  sprintId: string;
  kind: SprintKind;
  taskId: string | null;
  taskTitle: string | null;
  text: string;
  status: PromptStatus;
  processedAt: string | null;
  result: string | null;
  /** The metric key this prompt should move (src/lib/monetize/metrics.ts), and its value at claim. */
  metric: string | null;
  baseline: number | null;
  /** Blocked on Abdout: the condition that sends it back to pending by itself ("brokerSends == gated"). */
  unblockWhen: string | null;
  blockedAt: string | null;
  retries: number;
  /** Written by the sprint cycle, not by hand. */
  auto: boolean;
}
export interface SprintView {
  id: string;
  kind: SprintKind;
  title: string;
  goal: string | null;
  startsAt: string;
  endsAt: string;
  /** Planned by the sprint cycle, not by hand. */
  auto: boolean;
  tasks: SprintTaskView[];
  prompts: SprintPromptView[];
  doneTasks: number;
  processedPrompts: number;
}
export interface SprintsView {
  week: SprintView | null;
  month: SprintView | null;
  /** The carousel: the week's prompts, then the month's. */
  prompts: SprintPromptView[];
  /** Where the carousel opens: the prompt running now, else one that needs Abdout, else the next pending, else 0. */
  startIndex: number;
}

export interface SprintRow {
  id: string;
  kind: string;
  title: string;
  goal: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  auto?: boolean;
  tasks: { id: string; title: string; block: string | null; order: number; done: boolean; doneAt: Date | null }[];
  prompts: {
    id: string;
    taskId: string | null;
    order: number;
    text: string;
    status: string;
    processedAt: Date | null;
    result: string | null;
    // Optional: rows selected before the auto-sprint fields existed still shape.
    metric?: string | null;
    baseline?: number | null;
    unblockWhen?: string | null;
    blockedAt?: Date | null;
    retries?: number;
    auto?: boolean;
  }[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * The active sprint of a kind: open, not yet ended, and the latest whose window holds `now` (else the
 * latest open one that starts later). An expired sprint is never active — the cycle closes it and plans
 * the next (scripts/sprint-cycle.ts).
 */
export function pickActive(rows: SprintRow[], kind: SprintKind, now = new Date()): SprintRow | null {
  const open = rows
    .filter((r) => r.kind === kind && r.status !== "closed" && now < r.endsAt)
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return open.find((r) => r.startsAt <= now) ?? open.at(-1) ?? null;
}

export function shapeSprint(r: SprintRow): SprintView {
  const kind = r.kind as SprintKind;
  const tasks = [...r.tasks].sort((a, b) => a.order - b.order);
  const titleOf = new Map(tasks.map((t) => [t.id, t.title]));
  const prompts = [...r.prompts]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      id: p.id,
      sprintId: r.id,
      kind,
      taskId: p.taskId,
      taskTitle: p.taskId ? (titleOf.get(p.taskId) ?? null) : null,
      text: p.text,
      status: (PROMPT_STATUSES as string[]).includes(p.status) ? (p.status as PromptStatus) : "pending",
      processedAt: iso(p.processedAt),
      result: p.result,
      metric: p.metric ?? null,
      baseline: p.baseline ?? null,
      unblockWhen: p.unblockWhen ?? null,
      blockedAt: iso(p.blockedAt ?? null),
      retries: p.retries ?? 0,
      auto: p.auto ?? false,
    }));
  return {
    id: r.id,
    kind,
    title: r.title,
    goal: r.goal,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    auto: r.auto ?? false,
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, block: t.block, done: t.done, doneAt: iso(t.doneAt) })),
    prompts,
    doneTasks: tasks.filter((t) => t.done).length,
    // Run, not skipped: "8 of 13 processed" counted the skipped ones as done (2026-11-06).
    processedPrompts: prompts.filter((p) => p.status === "processed").length,
  };
}

export function shapeSprints(rows: SprintRow[], now = new Date()): SprintsView {
  const w = pickActive(rows, "WEEK", now);
  const m = pickActive(rows, "MONTH", now);
  const week = w ? shapeSprint(w) : null;
  const month = m ? shapeSprint(m) : null;
  const prompts = [...(week?.prompts ?? []), ...(month?.prompts ?? [])];
  const at = (st: PromptStatus) => prompts.findIndex((p) => p.status === st);
  const first = [at("running"), at("blocked"), at("pending")].find((i) => i >= 0);
  return { week, month, prompts, startIndex: first ?? 0 };
}

/** What the sprint loop learned — one prompt or sprint, the metric it aimed at, before → after. */
export type LessonVerdict = "moved" | "flat" | "worse" | "unknown";
export interface LessonRow {
  id: string;
  promptId: string | null;
  sprintId: string | null;
  metric: string | null;
  before: number | null;
  after: number | null;
  verdict: string;
  text: string;
  measureAt: Date | null;
  createdAt: Date;
}
export interface LessonView {
  id: string;
  promptId: string | null;
  sprintId: string | null;
  metric: string | null;
  before: number | null;
  after: number | null;
  verdict: LessonVerdict;
  text: string;
  /** When the 24 h measurement is (or was) due; null for a sprint retro. */
  measureAt: string | null;
  createdAt: string;
}
const VERDICTS: LessonVerdict[] = ["moved", "flat", "worse", "unknown"];
export function shapeLesson(r: LessonRow): LessonView {
  return {
    id: r.id,
    promptId: r.promptId,
    sprintId: r.sprintId,
    metric: r.metric,
    before: r.before,
    after: r.after,
    verdict: (VERDICTS as string[]).includes(r.verdict) ? (r.verdict as LessonVerdict) : "unknown",
    text: r.text,
    measureAt: iso(r.measureAt),
    createdAt: r.createdAt.toISOString(),
  };
}

export const EMPTY_SPRINTS: SprintsView = { week: null, month: null, prompts: [], startIndex: 0 };
