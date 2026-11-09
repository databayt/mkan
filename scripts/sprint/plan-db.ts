/**
 * Writing a plan into Sprint / SprintTask / SprintPrompt — shared by `pnpm sprint:plan` (by hand)
 * and `pnpm sprint:cycle` (auto). A prompt with `unblockWhen` starts blocked, its `needsYou` line
 * as the result, and the cycle sends it to pending once the condition holds.
 */
import type { Metrics } from '../../src/lib/monetize/metrics';
import { pickMetrics, type PlanPrompt, type PlanSprint } from '../../src/lib/monetize/sprint-auto';
import { pickActive, type SprintKind, type SprintRow } from '../../src/lib/monetize/sprint-shape';

type Db = (typeof import('../../src/lib/db'))['db'];

/** A hand-written plan may leave out the metric; the auto plan never does (sprint-auto.ts validatePlan). */
export type LoosePlanSprint = Omit<PlanSprint, 'prompts' | 'tasks'> & {
  tasks: { key: string; title: string; block?: string }[];
  prompts: (Omit<PlanPrompt, 'metric'> & { metric?: string })[];
};

/** Where appended rows start: one past the highest order the sprint already holds (0 when it holds none). */
export const nextOrder = (rows: { order: number }[]): number => rows.reduce((m, r) => Math.max(m, r.order + 1), 0);

/**
 * `append` adds the plan's tasks and prompts to the ACTIVE sprint of that kind (pickActive — the one the
 * runner and the page already use) after what it holds, instead of closing it: a hand-written batch
 * then sits beside the [auto] week's own tasks, whose blocked "needs you" items stay on the page
 * (2026-11-09). The file's title, goal and dates are ignored then; only `kind` picks the sprint.
 */
export async function createSprint(db: Db, s: LoosePlanSprint, opts: { auto: boolean; metrics?: Metrics; append?: boolean }) {
  const now = new Date();
  return db.$transaction(
    async (tx) => {
      let sprint: { id: string; title: string };
      let base = { task: 0, prompt: 0 };
      if (opts.append) {
        const open = await tx.sprint.findMany({
          where: { kind: s.kind, status: { not: 'closed' } },
          include: { tasks: { select: { order: true } }, prompts: { select: { order: true } } },
        });
        const active = pickActive(open as unknown as SprintRow[], s.kind as SprintKind, now);
        if (!active) throw new Error(`no open ${s.kind} sprint to append to — plan one without --append`);
        sprint = active;
        base = { task: nextOrder(active.tasks), prompt: nextOrder(active.prompts) };
      } else {
        // One open sprint per kind: a new plan closes the one it replaces.
        await tx.sprint.updateMany({ where: { kind: s.kind, status: { not: 'closed' } }, data: { status: 'closed' } });
        sprint = await tx.sprint.create({
          data: {
            kind: s.kind,
            title: s.title,
            goal: s.goal,
            startsAt: new Date(s.startsAt),
            endsAt: new Date(s.endsAt),
            auto: opts.auto,
            // The numbers at the start, so the close can say what moved.
            ...(opts.metrics ? { retro: JSON.stringify({ start: pickMetrics(opts.metrics) }) } : {}),
          },
        });
      }
      const ids = new Map<string, string>();
      for (const [i, t] of s.tasks.entries()) {
        const row = await tx.sprintTask.create({ data: { sprintId: sprint.id, title: t.title, block: t.block, order: base.task + i } });
        ids.set(t.key, row.id);
      }
      for (const [i, p] of s.prompts.entries()) {
        if (p.task && !ids.has(p.task)) throw new Error(`prompt ${i + 1} names an unknown task "${p.task}"`);
        const gated = !!p.unblockWhen;
        await tx.sprintPrompt.create({
          data: {
            sprintId: sprint.id,
            taskId: p.task ? ids.get(p.task) : null,
            text: p.text.trim(),
            order: base.prompt + i,
            metric: p.metric ?? null,
            unblockWhen: p.unblockWhen ?? null,
            auto: opts.auto,
            ...(gated ? { status: 'blocked', blockedAt: now, processedAt: now, result: (p.needsYou ?? `Waiting until ${p.unblockWhen}.`).slice(0, 500) } : {}),
          },
        });
      }
      return sprint;
      // Over the Mac's phone hotspot one round trip to Neon is ~3.5 s: Prisma's 2 s default to start
      // a transaction never succeeds there (11-04).
    },
    { maxWait: 30_000, timeout: 180_000 },
  );
}
