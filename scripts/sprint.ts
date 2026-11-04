/**
 * The /monetize sprint plan from the terminal — how a Claude Code session picks
 * up the next prompt and reports it done (the page shows the same rows).
 *
 *   pnpm sprint:show                                   week + month: tasks ✓, prompts and their state
 *   pnpm sprint:next                                   the next pending prompt (id, sprint, task, text)
 *   pnpm sprint:done <promptId> [--result="…"] [--task-done] [--skip]
 *   pnpm sprint:task <taskId> [--undo]                 tick (or untick) a task
 *   pnpm sprint:plan --file=plan.json                  create a WEEK / MONTH sprint from JSON (replaces an open one of that kind)
 *
 * plan.json: { "sprints": [{ "kind": "WEEK", "title", "goal", "startsAt": "2026-11-02", "endsAt": "2026-11-09",
 *              "tasks": [{ "key": "brokers", "title", "block": "chat" }],
 *              "prompts": [{ "task": "brokers", "text": "…" }] }] }
 */
import { config } from 'dotenv';
config({ override: true });
// Errors only from Prisma: the query log would bury the prompt text.
process.env.PRISMA_QUIET ??= '1';

import { readFileSync } from 'node:fs';

import { shapeSprints, type SprintRow } from '../src/lib/monetize/sprint-shape';

type Db = (typeof import('../src/lib/db'))['db'];

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);

async function rows(db: Db): Promise<SprintRow[]> {
  return (await db.sprint.findMany({
    where: { status: { not: 'closed' } },
    orderBy: { startsAt: 'desc' },
    include: { tasks: true, prompts: true },
  })) as unknown as SprintRow[];
}

async function show(db: Db) {
  const s = shapeSprints(await rows(db));
  for (const sp of [s.week, s.month]) {
    if (!sp) continue;
    console.log(`\n${sp.kind}  ${sp.title}  (${sp.startsAt.slice(0, 10)} → ${sp.endsAt.slice(0, 10)})  id ${sp.id}`);
    if (sp.goal) console.log(`  goal: ${sp.goal}`);
    console.log(`  tasks ${sp.doneTasks}/${sp.tasks.length} · prompts ${sp.processedPrompts}/${sp.prompts.length}`);
    for (const t of sp.tasks) console.log(`  [${t.done ? 'x' : ' '}] ${t.title}${t.block ? `  (${t.block})` : ''}  ${t.id}`);
    sp.prompts.forEach((p, i) => console.log(`  ${String(i + 1).padStart(2)}. ${p.status.padEnd(9)} ${p.text.split('\n')[0].slice(0, 90)}  ${p.id}`));
  }
  if (!s.week && !s.month) console.log('No active sprint. Plan one: pnpm sprint:plan --file=plan.json');
}

async function next(db: Db) {
  const s = shapeSprints(await rows(db));
  if (!s.week && !s.month) return console.log('No active sprint. Plan one: pnpm sprint:plan --file=plan.json');
  const p = s.prompts.find((x) => x.status === 'pending');
  if (!p) return console.log('No pending prompt — the sprint is caught up.');
  console.log(`prompt ${p.id}  (${p.kind === 'WEEK' ? 'this week' : 'this month'}${p.taskTitle ? ` · task: ${p.taskTitle}` : ''}${p.taskId ? ` ${p.taskId}` : ''})\n`);
  console.log(p.text);
  console.log(`\nWhen done: pnpm sprint:done ${p.id} --result="what changed"${p.taskId ? ' --task-done' : ''}`);
}

async function done(db: Db, id: string) {
  const status = flag('skip') ? 'skipped' : 'processed';
  const p = await db.sprintPrompt.update({ where: { id }, data: { status, processedAt: new Date(), ...(arg('result') ? { result: arg('result')!.slice(0, 500) } : {}) } });
  if (flag('task-done') && p.taskId) await db.sprintTask.update({ where: { id: p.taskId }, data: { done: true, doneAt: new Date() } });
  console.log(`✓ prompt ${id} ${status}${flag('task-done') && p.taskId ? ` · task ${p.taskId} done` : ''}`);
}

async function task(db: Db, id: string) {
  const undo = flag('undo');
  await db.sprintTask.update({ where: { id }, data: { done: !undo, doneAt: undo ? null : new Date() } });
  console.log(`✓ task ${id} ${undo ? 'not done' : 'done'}`);
}

type PlanFile = {
  sprints: { kind: 'WEEK' | 'MONTH'; title: string; goal?: string; startsAt: string; endsAt: string; tasks: { key: string; title: string; block?: string }[]; prompts: { task?: string; text: string }[] }[];
};

async function plan(db: Db, file: string) {
  const json = JSON.parse(readFileSync(file, 'utf8')) as PlanFile;
  for (const s of json.sprints) {
    if (s.kind !== 'WEEK' && s.kind !== 'MONTH') throw new Error(`kind must be WEEK or MONTH: ${s.kind}`);
    const created = await db.$transaction(async (tx) => {
      // One open sprint per kind: a new plan closes the one it replaces.
      await tx.sprint.updateMany({ where: { kind: s.kind, status: { not: 'closed' } }, data: { status: 'closed' } });
      const sprint = await tx.sprint.create({ data: { kind: s.kind, title: s.title, goal: s.goal, startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt) } });
      const ids = new Map<string, string>();
      for (const [order, t] of s.tasks.entries()) {
        const row = await tx.sprintTask.create({ data: { sprintId: sprint.id, title: t.title, block: t.block, order } });
        ids.set(t.key, row.id);
      }
      for (const [order, p] of s.prompts.entries()) {
        if (p.task && !ids.has(p.task)) throw new Error(`prompt ${order + 1} names an unknown task "${p.task}"`);
        await tx.sprintPrompt.create({ data: { sprintId: sprint.id, taskId: p.task ? ids.get(p.task) : null, text: p.text.trim(), order } });
      }
      return sprint;
      // Over the Mac's phone hotspot one round trip to Neon is ~3.5 s: Prisma's 2 s default to start
      // a transaction never succeeds there (11-04).
    }, { maxWait: 30_000, timeout: 180_000 });
    console.log(`✓ ${s.kind} sprint "${s.title}" — ${s.tasks.length} tasks, ${s.prompts.length} prompts  (${created.id})`);
  }
}

async function main() {
  const [cmd, id] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const { db } = await import('../src/lib/db');
  try {
    if (cmd === 'show') await show(db);
    else if (cmd === 'next') await next(db);
    else if (cmd === 'done' && id) await done(db, id);
    else if (cmd === 'task' && id) await task(db, id);
    else if (cmd === 'plan' && arg('file')) await plan(db, arg('file')!);
    else console.log('usage: pnpm sprint:show | sprint:next | sprint:done <promptId> [--result=…] [--task-done] [--skip] | sprint:task <taskId> [--undo] | sprint:plan --file=plan.json');
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
