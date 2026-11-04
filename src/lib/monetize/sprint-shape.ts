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
}
export interface SprintView {
  id: string;
  kind: SprintKind;
  title: string;
  goal: string | null;
  startsAt: string;
  endsAt: string;
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
  tasks: { id: string; title: string; block: string | null; order: number; done: boolean; doneAt: Date | null }[];
  prompts: { id: string; taskId: string | null; order: number; text: string; status: string; processedAt: Date | null; result: string | null }[];
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The active sprint of a kind: open, and the latest whose window holds `now` (else the latest open one). */
export function pickActive(rows: SprintRow[], kind: SprintKind, now = new Date()): SprintRow | null {
  const open = rows.filter((r) => r.kind === kind && r.status !== "closed").sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return open.find((r) => r.startsAt <= now && now < r.endsAt) ?? open[0] ?? null;
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
    }));
  return {
    id: r.id,
    kind,
    title: r.title,
    goal: r.goal,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, block: t.block, done: t.done, doneAt: iso(t.doneAt) })),
    prompts,
    doneTasks: tasks.filter((t) => t.done).length,
    processedPrompts: prompts.filter((p) => p.status === "processed" || p.status === "skipped").length,
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

export const EMPTY_SPRINTS: SprintsView = { week: null, month: null, prompts: [], startIndex: 0 };
