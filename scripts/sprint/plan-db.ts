/**
 * Writing a plan into Sprint / SprintTask / SprintPrompt — shared by `pnpm sprint:plan` (by hand)
 * and `pnpm sprint:cycle` (auto). A prompt with `unblockWhen` starts blocked, its `needsYou` line
 * as the result, and the cycle sends it to pending once the condition holds.
 */
import type { Metrics } from '../../src/lib/monetize/metrics';
import { pickMetrics, type PlanPrompt, type PlanSprint } from '../../src/lib/monetize/sprint-auto';

type Db = (typeof import('../../src/lib/db'))['db'];

/** A hand-written plan may leave out the metric; the auto plan never does (sprint-auto.ts validatePlan). */
export type LoosePlanSprint = Omit<PlanSprint, 'prompts' | 'tasks'> & {
  tasks: { key: string; title: string; block?: string }[];
  prompts: (Omit<PlanPrompt, 'metric'> & { metric?: string })[];
};

export async function createSprint(db: Db, s: LoosePlanSprint, opts: { auto: boolean; metrics?: Metrics }) {
  const now = new Date();
  return db.$transaction(
    async (tx) => {
      // One open sprint per kind: a new plan closes the one it replaces.
      await tx.sprint.updateMany({ where: { kind: s.kind, status: { not: 'closed' } }, data: { status: 'closed' } });
      const sprint = await tx.sprint.create({
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
      const ids = new Map<string, string>();
      for (const [order, t] of s.tasks.entries()) {
        const row = await tx.sprintTask.create({ data: { sprintId: sprint.id, title: t.title, block: t.block, order } });
        ids.set(t.key, row.id);
      }
      for (const [order, p] of s.prompts.entries()) {
        if (p.task && !ids.has(p.task)) throw new Error(`prompt ${order + 1} names an unknown task "${p.task}"`);
        const gated = !!p.unblockWhen;
        await tx.sprintPrompt.create({
          data: {
            sprintId: sprint.id,
            taskId: p.task ? ids.get(p.task) : null,
            text: p.text.trim(),
            order,
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
