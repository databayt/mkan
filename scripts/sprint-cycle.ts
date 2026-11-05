/**
 * The sprint loop's heartbeat — run by the sprint runner before every claim
 * (scripts/crm/hermes/sprint-runner.sh). Deterministic, idempotent and cheap: one read of the
 * /monetize numbers, a few writes, and at most one planner session a day.
 *
 *   pnpm sprint:cycle [--dry] [--no-plan]      --dry: print what it would do, write nothing
 *   pnpm sprint:cycle --plan-only=<path>       run the planner once, validate, write its JSON there; nothing else
 *
 *   a. close   — expired sprints close with a retro (tasks, prompts, key numbers start → now) and a lesson
 *   b. unblock — a blocked prompt whose `unblockWhen` now holds goes back to pending; one without a
 *                condition is retried once after 48 h, its last result kept for the next session
 *   c. measure — lessons due (24 h after done) get their after-value and a verdict: moved / flat / worse
 *   d. plan    — no active WEEK or MONTH sprint: one planner session (kun-claude.sh, unattended, daily
 *                cap) writes the plan JSON; zod-checked, else a deterministic plan from nextSteps()
 *   e. top up  — under 2 pending prompts: each next step with no open prompt becomes one (gated steps
 *                become "needs you" with the condition that resumes them)
 *
 * The last stdout line is JSON ({"cycle": {…}}) for the runner's Slack card.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { evalCondition, verdictOf, type Metrics } from '../src/lib/monetize/metrics';
import type { MonetizeOverview } from '../src/lib/monetize/load';
import {
  fallbackPlan,
  monthWindow,
  parseRetro,
  pickMetrics,
  retroText,
  sprintMetric,
  stepOf,
  stepPrompt,
  validatePlan,
  weekWindow,
  type PlanFile,
} from '../src/lib/monetize/sprint-auto';
import { liveMetrics } from './sprint/live';
import { createSprint } from './sprint/plan-db';

type Db = (typeof import('../src/lib/db'))['db'];
type Kind = 'WEEK' | 'MONTH';

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);

const H = 3_600_000;
const DATA = join(__dirname, 'crm/.data/sprint');
const OPEN = ['pending', 'running', 'blocked'];

const dry = flag('dry');
const say = (line: string) => console.log(`${dry ? '[dry] ' : ''}${line}`);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

interface Summary {
  closed: string[];
  unblocked: string[];
  retried: string[];
  measured: string[];
  planned: string[];
  toppedUp: string[];
  needsYou: string[];
}

async function openSprints(db: Db) {
  return db.sprint.findMany({ where: { status: { not: 'closed' } }, orderBy: { startsAt: 'desc' }, include: { tasks: true, prompts: true } });
}

// ── a. close ───────────────────────────────────────────────────────────
async function close(db: Db, metrics: Metrics, now: Date, out: Summary) {
  const closedRetros: string[] = [];
  for (const s of await openSprints(db)) {
    if (s.endsAt > now) continue;
    const prompts: Record<string, number> = {};
    for (const p of s.prompts) prompts[p.status] = (prompts[p.status] ?? 0) + 1;
    const r = parseRetro(s.retro);
    const end = pickMetrics(metrics);
    const tasks = { done: s.tasks.filter((t) => t.done).length, total: s.tasks.length };
    const text = retroText(`${s.kind} "${s.title}"`, { start: r.start, end, tasks, prompts });
    const key = sprintMetric(s.kind as Kind, metrics);
    const before = num(r.start?.[key]);
    const after = num(metrics[key]);
    say(`close ${s.kind} "${s.title}" (ended ${s.endsAt.toISOString().slice(0, 10)}): ${text}`);
    closedRetros.push(text);
    out.closed.push(`${s.kind} ${s.title}`);
    if (dry) continue;
    await db.sprint.update({ where: { id: s.id }, data: { status: 'closed', retro: JSON.stringify({ start: r.start, end, tasks, prompts, text }) } });
    await db.sprintLesson.create({ data: { sprintId: s.id, metric: key, before, after, verdict: verdictOf(key, before, after), text, measureAt: now } });
  }
  return closedRetros;
}

// ── b. unblock ─────────────────────────────────────────────────────────
async function unblock(db: Db, metrics: Metrics, now: Date, out: Summary) {
  for (const s of await openSprints(db)) {
    if (s.endsAt <= now) continue;
    for (const p of s.prompts.filter((x) => x.status === 'blocked')) {
      const first = p.text.split('\n')[0]!.slice(0, 70);
      if (p.unblockWhen) {
        if (!evalCondition(p.unblockWhen, metrics)) {
          out.needsYou.push((p.result ?? first).slice(0, 160));
          continue;
        }
        say(`unblock "${first}" — ${p.unblockWhen} holds`);
        out.unblocked.push(first);
        if (!dry) {
          await db.sprintPrompt.update({
            where: { id: p.id },
            data: { status: 'pending', processedAt: null, result: `${p.result ?? ''} · unblocked: ${p.unblockWhen}`.slice(0, 500) },
          });
        }
        continue;
      }
      // No condition: one retry after 48 h with the last result attached, never a blind loop.
      const since = p.blockedAt ?? p.processedAt;
      if (p.retries < 1 && since && now.getTime() - since.getTime() >= 48 * H) {
        say(`retry "${first}" — blocked ${Math.round((now.getTime() - since.getTime()) / H)} h, no condition`);
        out.retried.push(first);
        if (!dry) {
          await db.sprintPrompt.update({
            where: { id: p.id },
            data: { status: 'pending', processedAt: null, retries: p.retries + 1, result: `Retry ${p.retries + 1} after 48 h blocked. Last: ${p.result ?? '—'}`.slice(0, 500) },
          });
        }
      } else {
        out.needsYou.push((p.result ?? first).slice(0, 160));
      }
    }
  }
}

// ── c. measure ─────────────────────────────────────────────────────────
async function measure(db: Db, metrics: Metrics, now: Date, out: Summary) {
  const due = await db.sprintLesson.findMany({ where: { verdict: 'unknown', metric: { not: null }, measureAt: { lte: now } } });
  for (const l of due) {
    const after = num(metrics[l.metric!]);
    let before = l.before;
    if (before == null && l.promptId) before = (await db.sprintPrompt.findUnique({ where: { id: l.promptId }, select: { baseline: true } }))?.baseline ?? null;
    const verdict = verdictOf(l.metric!, before, after);
    // A number that never reads (no snapshot) stops being re-checked three days after it was due.
    const giveUp = verdict === 'unknown' && now.getTime() - l.measureAt!.getTime() > 72 * H;
    if (verdict === 'unknown' && !giveUp) continue;
    say(`measure lesson ${l.id}: ${l.metric} ${before ?? '?'} → ${after ?? '?'} = ${verdict}`);
    out.measured.push(`${l.metric} ${verdict}`);
    if (!dry) await db.sprintLesson.update({ where: { id: l.id }, data: { before, after, verdict, ...(giveUp ? { measureAt: null } : {}) } });
  }
  // A prompt done without --lesson still teaches something: measure it from its result.
  const done = await db.sprintPrompt.findMany({
    where: { status: 'processed', metric: { not: null }, baseline: { not: null }, processedAt: { lte: new Date(now.getTime() - 24 * H), gte: new Date(now.getTime() - 14 * 24 * H) } },
  });
  const have = new Set((await db.sprintLesson.findMany({ where: { promptId: { in: done.map((p) => p.id) } }, select: { promptId: true } })).map((l) => l.promptId));
  for (const p of done.filter((x) => !have.has(x.id))) {
    const after = num(metrics[p.metric!]);
    const verdict = verdictOf(p.metric!, p.baseline, after);
    say(`lesson for "${p.text.split('\n')[0]!.slice(0, 60)}": ${p.metric} ${p.baseline} → ${after ?? '?'} = ${verdict}`);
    out.measured.push(`${p.metric} ${verdict}`);
    if (!dry) {
      await db.sprintLesson.create({
        data: { promptId: p.id, sprintId: p.sprintId, metric: p.metric, before: p.baseline, after, verdict, text: (p.result ?? 'done').slice(0, 1000), measureAt: now },
      });
    }
  }
}

// ── d. plan ────────────────────────────────────────────────────────────

/** Everything the planner reads, as one JSON block. */
async function plannerContext(db: Db, model: MonetizeOverview, metrics: Metrics, retros: string[]) {
  const lessons = await db.sprintLesson.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  const blocked = await db.sprintPrompt.findMany({
    where: { status: 'blocked', processedAt: { gte: new Date(Date.now() - 21 * 24 * H) } },
    select: { text: true, result: true, unblockWhen: true, metric: true },
    take: 20,
  });
  const fs = (model as { firstShare?: Record<string, unknown> | null }).firstShare;
  const { posts: _posts, ...firstShare } = (fs ?? {}) as Record<string, unknown>;
  return {
    metrics,
    nextSteps: model.nextSteps,
    bottleneck: model.bottleneck,
    stages: model.stages,
    firstShare: fs ? firstShare : null,
    gates: model.gates,
    money: { revenueRwf: model.money.revenueRwf, breakEvenRwf: model.money.breakEvenRwf, netRwf: model.money.netRwf },
    experiments: model.experiments.filter((e) => e.verdict === 'running'),
    lessons: lessons.map((l) => ({ metric: l.metric, before: l.before, after: l.after, verdict: l.verdict, text: l.text, at: l.createdAt.toISOString().slice(0, 10) })),
    closedRetros: retros,
    needsYou: blocked.map((b) => ({ step: b.text.split('\n')[0]!.slice(0, 160), needsYou: b.result, unblockWhen: b.unblockWhen, metric: b.metric })),
  };
}

function plannerPrompt(kinds: Kind[], path: string, context: unknown, now: Date) {
  const w = weekWindow(now);
  const m = monthWindow(now);
  const windows = kinds.map((k) => (k === 'WEEK' ? `WEEK ${w.startsAt} → ${w.endsAt}` : `MONTH ${m.startsAt} → ${m.endsAt}`)).join(' and ');
  return `You are the Mkan sprint planner, working unattended on Abdout's Mac. Nobody can answer a question.
Your ONLY job: write one JSON file to ${path} with the Write tool, then stop. Do not edit any other file,
run nothing that changes anything. You may Read/Grep ~/mkan for context (scripts/sprint-plan-2026-11.json is
an earlier hand-written plan; src/lib/monetize/metrics.ts lists the metric keys).

Plan the ${windows} sprint${kinds.length > 1 ? 's' : ''} for Mkan's chatbot business (Kigali rentals: scrape → enhance →
post on TikTok → chat → broker → viewing → deal). The north star is the FIRST SHARE — the first paid deal —
measured by the funnel featured → clean → posted to TikTok → contacts → chatbot shortlist → broker asked →
viewing → signed → paid. Aim the sprint at the funnel's weakest step first (lowest conversion with enough volume),
and use the lessons: do not repeat what was flat or worse; build on what moved.

Rules:
- 4–7 tasks, at most 7 prompts per sprint. Every prompt names "metric": one key of the metrics object below.
- A prompt is work an UNATTENDED Claude Code session in ~/mkan can finish alone: read, analyse, fix code or
  config, build, deploy, measure. Each prompt text starts "In ~/mkan:", says why (with the number), what to do,
  and "Done when …", and ends asking for the before/after of its metric.
- Gated steps — contacting a real person (brokers, tenants, hosts), broker sends, booking viewings, outreach,
  recording money, WhatsApp pairing, TikTok uploads (tt:upload) — are NEVER a runnable prompt. Put them in as a
  prompt with "unblockWhen" (a condition on a metric key: "brokerSends == gated", "viewingsBooked > 0",
  "revenueEntry exists"; ops == != >= <= > < exists, join with &&) and "needsYou" (one line: exactly what Abdout
  must do). Its "text" is the follow-up the unattended session does once the condition holds.
- Carry the open "needsYou" items below forward when they still matter.

JSON shape (nothing else in the file):
{ "sprints": [ { "kind": "WEEK"|"MONTH", "title": "…", "goal": "one sentence", "startsAt": "YYYY-MM-DD", "endsAt": "YYYY-MM-DD",
  "tasks": [ { "key": "short-key", "title": "…", "block": "scrape"|"enhance"|"post"|"chat" } ],
  "prompts": [ { "task": "short-key", "text": "In ~/mkan: …", "metric": "<metric key>", "unblockWhen": "…", "needsYou": "…" } ] } ] }
Windows: ${windows} exactly (week = Monday → next Monday, month = 1st → next 1st).

Context (live, ${now.toISOString()}):
${JSON.stringify(context, null, 1)}
`;
}

const DISALLOWED = [
  'Bash(pnpm wa:brokers gated:*)', 'Bash(pnpm -s wa:brokers gated:*)', 'Bash(pnpm wa:pair:*)', 'Bash(pnpm wa:outbox:*)',
  'Bash(pnpm deal:book:*)', 'Bash(pnpm crm:outreach:*)', 'Bash(pnpm crm:cadence:*)', 'Bash(pnpm tt:upload:*)', 'Bash(pnpm tt:ask:*)',
  'Bash(git push --force:*)', 'Bash(git push -f:*)', 'Bash(git reset --hard:*)', 'Bash(prisma migrate reset:*)',
];

/** One planner session; resolves with its exit code (75 = the runner's daily cap, 124 = timed out). */
function runPlanner(prompt: string, logPath: string): Promise<number> {
  const bin = process.env.KUN_CLAUDE ?? `${process.env.HOME}/.claude/bin/kun-claude.sh`;
  const args = ['-p', prompt, '--dangerously-skip-permissions', '--max-turns', '30', '--tools', 'Read,Write,Glob,Grep', '--disallowedTools', ...DISALLOWED];
  return new Promise((resolve) => {
    const log: string[] = [];
    const child = spawn(bin, args, {
      cwd: join(__dirname, '..'),
      // Its own process group, so the time limit stops the whole session, not just the wrapper.
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      // The runner's job name: the planner counts toward the same daily cap (engine.json).
      env: { ...process.env, MKAN_UNATTENDED: '1', KUN_JOB: process.env.KUN_JOB ?? 'hermes:mkan-sprint-runner' },
    });
    child.stdout.on('data', (d) => log.push(String(d)));
    child.stderr.on('data', (d) => log.push(String(d)));
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, 'SIGTERM');
      } catch {}
      resolve(124);
    }, 15 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      writeFileSync(logPath, log.join(''));
      resolve(code ?? 1);
    });
  });
}

/** The planner's plan, or why there is none. */
async function planWithClaude(db: Db, kinds: Kind[], model: MonetizeOverview, metrics: Metrics, retros: string[], path: string, now: Date) {
  const ctx = await plannerContext(db, model, metrics, retros);
  const code = await runPlanner(plannerPrompt(kinds, path, ctx, now), path.replace(/\.json$/, '.log'));
  if (code !== 0) return { plan: null, why: code === 75 ? 'planner capped (daily cap)' : `planner exit ${code}` };
  if (!existsSync(path)) return { plan: null, why: 'planner wrote no file' };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    return { plan: null, why: `planner JSON unreadable: ${(e as Error).message}` };
  }
  const v = validatePlan(json, metrics, now);
  if (!v.ok) return { plan: null, why: `planner plan invalid: ${v.errors.slice(0, 4).join('; ')}` };
  const wrong = v.plan.sprints.filter((s) => !kinds.includes(s.kind));
  if (wrong.length) return { plan: null, why: `planner planned ${wrong.map((s) => s.kind).join(',')} — not asked` };
  return { plan: v.plan, why: 'planner' };
}

async function plan(db: Db, model: MonetizeOverview, metrics: Metrics, retros: string[], now: Date, out: Summary) {
  const open = (await openSprints(db)).filter((s) => s.endsAt > now);
  const kinds = (['WEEK', 'MONTH'] as Kind[]).filter((k) => !open.some((s) => s.kind === k));
  if (!kinds.length) return;
  const today = now.toISOString().slice(0, 10);
  const marker = join(DATA, `.planned-${today}`);
  // At most one planner session a day; after that (or when it fails) the plan is deterministic.
  const usePlanner = !existsSync(marker) && process.env.SPRINT_CYCLE_NO_PLANNER !== '1';
  if (dry) {
    say(`plan ${kinds.join(' + ')} — ${usePlanner ? 'would run one planner session (fallback: nextSteps)' : 'planner already ran today → deterministic plan from nextSteps'}`);
    for (const k of kinds) {
      const fb = fallbackPlan(k, model.nextSteps, now);
      say(`  fallback ${k} ${fb.startsAt} → ${fb.endsAt}: ${fb.tasks.map((t) => t.title).join(' · ')}`);
    }
    out.planned.push(...kinds.map((k) => `${k} (dry)`));
    return;
  }
  let file: PlanFile | null = null;
  let why = 'planner already ran today';
  if (usePlanner) {
    mkdirSync(DATA, { recursive: true });
    writeFileSync(marker, now.toISOString());
    const r = await planWithClaude(db, kinds, model, metrics, retros, join(DATA, `plan-${today}.json`), now);
    file = r.plan;
    why = r.why;
  }
  const sprints = file?.sprints ?? kinds.map((k) => fallbackPlan(k, model.nextSteps, now));
  for (const s of sprints) {
    const created = await createSprint(db, s, { auto: true, metrics });
    say(`planned ${s.kind} "${s.title}" (${s.startsAt} → ${s.endsAt}) — ${s.tasks.length} tasks, ${s.prompts.length} prompts, by ${file ? 'the planner' : `fallback (${why})`}  ${created.id}`);
    out.planned.push(`${s.kind} ${s.title}${file ? '' : ' (fallback)'}`);
  }
}

// ── e. top up ──────────────────────────────────────────────────────────
async function topUp(db: Db, model: MonetizeOverview, now: Date, out: Summary) {
  const active = (await openSprints(db)).filter((s) => s.endsAt > now && s.startsAt <= now);
  if (!active.length) return say('top up: no active sprint');
  const prompts = active.flatMap((s) => s.prompts);
  const pending = prompts.filter((p) => p.status === 'pending').length;
  if (pending >= 2) return;
  // A step is covered while a prompt for it (its tag, or any prompt on the same metric) is open, or ran
  // in the last 72 h — its number gets time to move before the loop tries again.
  const recent = prompts.filter((p) => OPEN.includes(p.status) || (p.processedAt && now.getTime() - p.processedAt.getTime() < 72 * H));
  const covered = new Set(recent.map((p) => stepOf(p.text)).filter(Boolean));
  const coveredMetric = new Set(recent.map((p) => p.metric).filter(Boolean));
  const target = active.find((s) => s.kind === 'WEEK') ?? active[0]!;
  let order = Math.max(-1, ...target.prompts.map((p) => p.order)) + 1;
  let taskOrder = Math.max(-1, ...target.tasks.map((t) => t.order)) + 1;
  let runnable = 0;
  for (const step of model.nextSteps) {
    if (runnable >= 3) break;
    const sp = stepPrompt(step);
    if (!sp || covered.has(sp.step) || coveredMetric.has(sp.metric)) continue;
    covered.add(sp.step);
    coveredMetric.add(sp.metric);
    say(`top up ${target.kind}: ${sp.title} (metric ${sp.metric}${sp.unblockWhen ? `, needs you until ${sp.unblockWhen}` : ''})`);
    out.toppedUp.push(sp.title);
    if (!sp.unblockWhen) runnable++;
    if (dry) continue;
    const task = await db.sprintTask.create({ data: { sprintId: target.id, title: sp.title, block: sp.block, order: taskOrder++ } });
    await db.sprintPrompt.create({
      data: {
        sprintId: target.id,
        taskId: task.id,
        text: sp.text,
        order: order++,
        metric: sp.metric,
        auto: true,
        ...(sp.unblockWhen ? { status: 'blocked', unblockWhen: sp.unblockWhen, blockedAt: now, processedAt: now, result: sp.needsYou } : {}),
      },
    });
  }
  if (!out.toppedUp.length) say(`top up: ${pending} pending, every next step already has a prompt`);
}

// ── main ───────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const { db } = await import('../src/lib/db');
  const out: Summary = { closed: [], unblocked: [], retried: [], measured: [], planned: [], toppedUp: [], needsYou: [] };
  try {
    const { model, metrics } = await liveMetrics();
    const planOnly = arg('plan-only');
    if (planOnly) {
      const kinds = (arg('kinds')?.split(',') ?? ['WEEK']) as Kind[];
      const r = await planWithClaude(db, kinds, model, metrics, [], planOnly, now);
      console.log(r.plan ? JSON.stringify(r.plan, null, 2) : `no plan: ${r.why}`);
      return;
    }
    const retros = await close(db, metrics, now, out);
    await unblock(db, metrics, now, out);
    await measure(db, metrics, now, out);
    if (!flag('no-plan')) await plan(db, model, metrics, retros, now, out);
    await topUp(db, model, now, out);
    const n = (k: keyof Summary) => out[k].length;
    say(`cycle: closed ${n('closed')} · unblocked ${n('unblocked')} · retried ${n('retried')} · measured ${n('measured')} · planned ${n('planned')} · topped up ${n('toppedUp')} · needs you ${n('needsYou')}`);
    console.log(JSON.stringify({ cycle: { dry, ...out } }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`❌ ${(e as Error).message}`);
  process.exit(1);
});
