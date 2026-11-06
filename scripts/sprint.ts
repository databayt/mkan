/**
 * The /monetize sprint plan from the terminal — how a Claude Code session picks
 * up the next prompt and reports it done (the page shows the same rows).
 *
 *   pnpm sprint:show                                   week + month: tasks ✓, prompts and their state
 *   pnpm sprint:next                                   the next pending prompt (id, sprint, task, text)
 *   pnpm sprint:done <promptId> [--result="…"] [--task-done] [--skip | --blocked [--unblock-when="<cond>"]]
 *                    [--metric=<key>] [--lesson="…"]  the lesson is measured 24 h later by sprint:cycle
 *   pnpm sprint:claim                                  the runner: take the next pending prompt (→ running, its metric's
 *                                                      value stored as the baseline), print it as JSON
 *   pnpm sprint:release <promptId> --result="…"        the runner: a run that ended without reporting → blocked
 *   tsx scripts/sprint.ts brief <promptId>             the runner: key numbers now + the 5 most relevant lessons
 *   pnpm sprint:task <taskId> [--undo]                 tick (or untick) a task
 *   pnpm sprint:plan --file=plan.json                  create a WEEK / MONTH sprint from JSON (replaces an open one of that kind)
 *   pnpm sprint:approve <promptId>                     Abdout, on the Mac: a prompt added on the web may run (refused unattended)
 *
 *   pnpm sprint:cycle [--dry] [--no-plan]             close, unblock, measure, plan, top up (scripts/sprint-cycle.ts)
 *
 * plan.json: { "sprints": [{ "kind": "WEEK", "title", "goal", "startsAt": "2026-11-02", "endsAt": "2026-11-09", "auto"?: false,
 *              "tasks": [{ "key": "brokers", "title", "block": "chat" }],
 *              "prompts": [{ "task": "brokers", "text": "…", "metric"?: "brokersAsked",
 *                            "unblockWhen"?: "brokerSends == gated", "needsYou"?: "one line for Abdout" }] }] }
 * A prompt with unblockWhen starts blocked ("needs you") and goes back to pending by itself once the
 * condition holds (src/lib/monetize/metrics.ts evalCondition). Metric keys: readMetrics() there.
 */
import { config } from 'dotenv';
config({ override: true });
// Errors only from Prisma: the query log would bury the prompt text.
process.env.PRISMA_QUIET ??= '1';

import { readFileSync } from 'node:fs';

import { parseCondition } from '../src/lib/monetize/metrics';
import { isWebText, unmarkWeb, WEB_MARK } from '../src/lib/monetize/provenance';
import { refuseUnattended } from './unattended';
import { shapeSprints, type SprintRow } from '../src/lib/monetize/sprint-shape';
import { createSprint, type LoosePlanSprint } from './sprint/plan-db';

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
    console.log(`\n${sp.kind}  ${sp.title}  (${sp.startsAt.slice(0, 10)} → ${sp.endsAt.slice(0, 10)})  id ${sp.id}${sp.auto ? '  [auto]' : ''}`);
    if (sp.goal) console.log(`  goal: ${sp.goal}`);
    console.log(`  tasks ${sp.doneTasks}/${sp.tasks.length} · prompts ${sp.processedPrompts}/${sp.prompts.length}`);
    for (const t of sp.tasks) console.log(`  [${t.done ? 'x' : ' '}] ${t.title}${t.block ? `  (${t.block})` : ''}  ${t.id}`);
    sp.prompts.forEach((p, i) => {
      const tags = [p.auto ? 'auto' : '', p.metric ? `metric=${p.metric}${p.baseline != null ? `@${+p.baseline.toFixed(3)}` : ''}` : '', p.retries ? `retries=${p.retries}` : ''].filter(Boolean).join(' ');
      console.log(`  ${String(i + 1).padStart(2)}. ${p.status.padEnd(9)} ${p.text.split('\n')[0]!.slice(0, 90)}  ${p.id}${tags ? `  ${tags}` : ''}`);
      if (p.status === 'blocked') console.log(`        ↳ needs you: ${(p.result ?? '').slice(0, 140)}${p.unblockWhen ? `  · resumes when ${p.unblockWhen}` : (p.retries ? '  · retried once already: waits for Abdout' : '  · no condition: retried once after 48 h')}`);
    });
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
  // --blocked: the prompt needs Abdout (a send to a real person, money, a decision) — the result says what,
  // and --unblock-when says which number turns true once he has done it (the cycle then resumes it).
  const status = flag('skip') ? 'skipped' : flag('blocked') ? 'blocked' : 'processed';
  const unblockWhen = status === 'blocked' ? arg('unblock-when') : undefined;
  if (unblockWhen && !parseCondition(unblockWhen)) throw new Error(`--unblock-when must read like "brokerSends == gated": ${unblockWhen}`);
  const now = new Date();
  const metric = arg('metric');
  const p = await db.sprintPrompt.update({
    where: { id },
    data: {
      status,
      processedAt: now,
      ...(arg('result') ? { result: arg('result')!.slice(0, 500) } : {}),
      ...(status === 'blocked' ? { blockedAt: now, ...(unblockWhen ? { unblockWhen } : {}) } : {}),
      ...(metric ? { metric } : {}),
    },
  });
  if (status === 'processed' && flag('task-done') && p.taskId) await db.sprintTask.update({ where: { id: p.taskId }, data: { done: true, doneAt: now } });
  // The lesson: what the session believes moved the number; sprint:cycle measures it 24 h on.
  const lesson = arg('lesson');
  if (lesson || (status === 'processed' && p.metric)) {
    await db.sprintLesson.create({
      data: {
        promptId: id,
        sprintId: p.sprintId,
        metric: p.metric,
        before: p.baseline,
        text: (lesson ?? p.result ?? 'done').slice(0, 1000),
        measureAt: p.metric ? new Date(now.getTime() + 24 * 3_600_000) : null,
      },
    });
  }
  console.log(`✓ prompt ${id} ${status}${flag('task-done') && p.taskId ? ` · task ${p.taskId} done` : ''}${unblockWhen ? ` · resumes when ${unblockWhen}` : ''}${lesson ? ' · lesson saved' : ''}`);
}

/** The prompt's metric now — its baseline at claim. Null when the numbers can't be read (never blocks a claim). */
async function metricNow(key: string | null | undefined): Promise<number | null> {
  if (!key) return null;
  try {
    const { liveMetrics } = await import('./sprint/live');
    const v = (await liveMetrics()).metrics[key];
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

/** The runner's claim: the next pending prompt (week first), marked running so no second run takes it. */
async function claim(db: Db) {
  // A prompt left running by a run that died (a crash, a reboot) is not retried blind: it needs a look.
  await db.sprintPrompt.updateMany({
    where: { status: 'running', processedAt: { lt: new Date(Date.now() - 3 * 3_600_000) } },
    data: { status: 'blocked', result: 'The unattended run stopped without reporting — check the runner log, then mark it pending to retry.' },
  });
  const s = shapeSprints(await rows(db));
  if (s.prompts.some((x) => x.status === 'running')) return console.log(JSON.stringify({ busy: true }));
  // Never text a web form wrote and the Mac has not approved (src/lib/monetize/provenance.ts): this run
  // has full permissions on the Mac.
  const p = s.prompts.find((x) => x.status === 'pending' && !isWebText(x.text) && !isWebText(x.taskTitle));
  if (!p) return console.log(JSON.stringify({ empty: true }));
  // processedAt doubles as "started at" while running.
  const took = await db.sprintPrompt.updateMany({
    where: { id: p.id, status: 'pending', NOT: { text: { contains: WEB_MARK.trim() } } },
    data: { status: 'running', processedAt: new Date() },
  });
  if (took.count !== 1) return console.log(JSON.stringify({ busy: true }));
  const baseline = await metricNow(p.metric);
  if (baseline != null) await db.sprintPrompt.update({ where: { id: p.id }, data: { baseline } });
  const lastResult = p.retries && !isWebText(p.result) ? p.result : null;
  console.log(JSON.stringify({ id: p.id, kind: p.kind, task: p.taskTitle, taskId: p.taskId, text: p.text, metric: p.metric, baseline, retries: p.retries, lastResult }));
}

/** The runner's context for one prompt: the key numbers now, and the 5 most relevant lessons (same metric, then same block). */
async function brief(db: Db, id: string) {
  const p = await db.sprintPrompt.findUnique({ where: { id }, include: { task: { select: { block: true } } } });
  if (!p) return console.log(`prompt ${id} not found`);
  const { liveMetrics } = await import('./sprint/live');
  const { pickMetrics } = await import('../src/lib/monetize/sprint-auto');
  const metrics = await liveMetrics().then((r) => r.metrics).catch(() => null);
  if (metrics) {
    const keys = pickMetrics(metrics);
    if (p.metric && !(p.metric in keys)) keys[p.metric] = metrics[p.metric] ?? null;
    console.log(`Key numbers now: ${Object.entries(keys).map(([k, v]) => `${k}=${typeof v === 'number' ? +v.toFixed(3) : v}`).join(', ')}`);
  } else console.log('Key numbers now: unavailable (the /monetize read failed).');
  // Lessons a web form could have seeded are not read by an unattended run.
  const lessons = (await db.sprintLesson.findMany({ orderBy: { createdAt: 'desc' }, take: 60 })).filter((l) => !isWebText(l.text));
  const block = p.task?.block;
  const blockMetrics = block ? new Set((await db.sprintPrompt.findMany({ where: { task: { block } }, select: { metric: true } })).map((x) => x.metric)) : new Set<string | null>();
  const rank = (l: (typeof lessons)[number]) => (p.metric && l.metric === p.metric ? 0 : l.metric && blockMetrics.has(l.metric) ? 1 : 2);
  const top = [...lessons].sort((a, b) => rank(a) - rank(b)).slice(0, 5);
  console.log(top.length ? 'Lessons so far (most relevant first):' : 'Lessons so far: none yet.');
  for (const l of top) console.log(`- [${l.verdict}] ${l.metric ?? '—'} ${l.before ?? '?'} → ${l.after ?? '?'}: ${l.text.replace(/\s+/g, ' ').slice(0, 220)}`);
}

/**
 * Abdout, on the Mac: a prompt added on /monetize may run. The web mark comes off the prompt and its
 * task, and it goes back to pending for the next runner tick. Refused in an unattended run — a session
 * can never clear the mark itself.
 */
async function approve(db: Db, id: string) {
  refuseUnattended('approve a prompt added on the web');
  const p = await db.sprintPrompt.findUnique({ where: { id }, include: { task: { select: { id: true, title: true } } } });
  if (!p) return console.log(`prompt ${id} not found`);
  if (!isWebText(p.text) && !isWebText(p.task?.title)) return console.log(`prompt ${id} was not added on the web — nothing to approve`);
  const text = unmarkWeb(p.text);
  console.log(`Approving prompt ${id}${p.task ? ` (task: ${unmarkWeb(p.task.title)})` : ''}:\n\n${text}\n`);
  await db.$transaction([
    db.sprintPrompt.update({ where: { id }, data: { text, status: 'pending', processedAt: null, blockedAt: null, result: null } }),
    ...(p.task && isWebText(p.task.title) ? [db.sprintTask.update({ where: { id: p.task.id }, data: { title: unmarkWeb(p.task.title) } })] : []),
  ]);
  console.log(`✓ prompt ${id} approved — pending; the runner takes it on its next tick`);
}

async function release(db: Db, id: string) {
  const p = await db.sprintPrompt.findUnique({ where: { id }, select: { status: true } });
  if (p?.status !== 'running') return console.log(`prompt ${id} is ${p?.status ?? 'gone'} — nothing to release`);
  // --pending: give it back untouched (the runner's daily cap); otherwise it needs a look.
  const status = flag('pending') ? 'pending' : 'blocked';
  await db.sprintPrompt.update({
    where: { id },
    data: { status, processedAt: status === 'pending' ? null : new Date(), result: (arg('result') ?? 'The run ended without reporting.').slice(0, 500) },
  });
  console.log(`✓ prompt ${id} ${status}`);
}

async function task(db: Db, id: string) {
  const undo = flag('undo');
  await db.sprintTask.update({ where: { id }, data: { done: !undo, doneAt: undo ? null : new Date() } });
  console.log(`✓ task ${id} ${undo ? 'not done' : 'done'}`);
}

async function plan(db: Db, file: string) {
  const json = JSON.parse(readFileSync(file, 'utf8')) as { sprints: LoosePlanSprint[] };
  for (const s of json.sprints) {
    if (s.kind !== 'WEEK' && s.kind !== 'MONTH') throw new Error(`kind must be WEEK or MONTH: ${s.kind}`);
    for (const p of s.prompts) if (p.unblockWhen && !parseCondition(p.unblockWhen)) throw new Error(`bad unblockWhen: ${p.unblockWhen}`);
    const created = await createSprint(db, s, { auto: s.auto ?? false });
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
    else if (cmd === 'claim') await claim(db);
    else if (cmd === 'release' && id) await release(db, id);
    else if (cmd === 'brief' && id) await brief(db, id);
    else if (cmd === 'approve' && id) await approve(db, id);
    else if (cmd === 'plan' && arg('file')) await plan(db, arg('file')!);
    else console.log('usage: pnpm sprint:show | sprint:next | sprint:done <promptId> [--result=…] [--task-done] [--skip | --blocked [--unblock-when=…]] [--metric=…] [--lesson=…] | sprint:task <taskId> [--undo] | sprint:plan --file=plan.json');
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
