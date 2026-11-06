import { z } from "zod";

import { parseCondition, type Metrics } from "./metrics";
import type { NextStep } from "./next-steps";
import { roadmapMonth, roadmapWeek, roadTaskPrompt } from "./roadmap";

/**
 * The sprint loop's pure half (scripts/sprint-cycle.ts holds the database half): sprint windows,
 * the plan JSON schema the planner must write, the deterministic prompt for each next step, and the
 * fallback plan when the planner can't run. Every prompt names a metric so the loop can measure it.
 *
 * Gated steps (anything that reaches a real person, moves money, or re-pairs WhatsApp) are never a
 * runnable prompt: they become a blocked prompt with a one-line "needs you" and an `unblockWhen`
 * condition, and the cycle sends it back to pending by itself once the condition holds.
 */

const DAY = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Monday 00:00 UTC → the next Monday. */
export function weekWindow(now = new Date()): { startsAt: string; endsAt: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(d.getTime() - back * DAY);
  return { startsAt: ymd(start), endsAt: ymd(new Date(start.getTime() + 7 * DAY)) };
}

/** The 1st → the next 1st (UTC). */
export function monthWindow(now = new Date()): { startsAt: string; endsAt: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { startsAt: ymd(start), endsAt: ymd(end) };
}

/** Commands an unattended run must never be told to run (the runner also denies them). */
export const GATED_COMMANDS = [/wa:brokers\s+gated/, /wa:pair/, /wa:outbox/, /deal:book/, /deal:status/, /deal:terms/, /crm:outreach/, /crm:cadence/, /tt:upload/, /tt:ask/];
export const mentionsGated = (text: string) => GATED_COMMANDS.some((r) => r.test(text));

// ── the plan file ──────────────────────────────────────────────────────

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a YYYY-MM-DD date");
const condition = z.string().refine((c) => parseCondition(c) !== null, "a condition like `brokerSends == gated`");

export const PlanPromptSchema = z.object({
  task: z.string().optional(),
  text: z.string().min(20).max(3000),
  /** The metric key the prompt should move (a key of readMetrics). */
  metric: z.string().min(1),
  /** Gated: the prompt starts blocked and runs by itself once this holds. */
  unblockWhen: condition.optional(),
  /** Gated: the one line Abdout reads ("Run pnpm wa:brokers gated after the phone test"). */
  needsYou: z.string().max(300).optional(),
});
export const PlanSprintSchema = z.object({
  kind: z.enum(["WEEK", "MONTH"]),
  title: z.string().min(3).max(120),
  goal: z.string().max(400).optional(),
  startsAt: day,
  endsAt: day,
  auto: z.boolean().optional(),
  tasks: z.array(z.object({ key: z.string().min(1), title: z.string().min(3).max(200), block: z.enum(["scrape", "enhance", "post", "chat"]).optional() })).min(1).max(7),
  prompts: z.array(PlanPromptSchema).max(7),
});
export const PlanFileSchema = z.object({ sprints: z.array(PlanSprintSchema).min(1).max(2) });
export type PlanPrompt = z.infer<typeof PlanPromptSchema>;
export type PlanSprint = z.infer<typeof PlanSprintSchema>;
export type PlanFile = z.infer<typeof PlanFileSchema>;

/**
 * Parse and check a plan the planner wrote: the schema, then the rules zod can't see alone —
 * every metric is a live key, tasks named by prompts exist, a gated command only behind an
 * `unblockWhen`, and the window is the kind's (week Monday→Monday, month 1st→1st).
 */
export function validatePlan(json: unknown, metrics: Metrics, now = new Date()): { ok: true; plan: PlanFile } | { ok: false; errors: string[] } {
  const r = PlanFileSchema.safeParse(json);
  if (!r.success) return { ok: false, errors: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const errors: string[] = [];
  for (const s of r.data.sprints) {
    const win = s.kind === "WEEK" ? weekWindow(now) : monthWindow(now);
    if (s.startsAt !== win.startsAt || s.endsAt !== win.endsAt) errors.push(`${s.kind}: window must be ${win.startsAt} → ${win.endsAt}`);
    const keys = new Set(s.tasks.map((t) => t.key));
    s.prompts.forEach((p, i) => {
      if (!(p.metric in metrics)) errors.push(`${s.kind} prompt ${i + 1}: unknown metric "${p.metric}"`);
      if (p.task && !keys.has(p.task)) errors.push(`${s.kind} prompt ${i + 1}: unknown task "${p.task}"`);
      if (mentionsGated(p.text) && !p.unblockWhen) errors.push(`${s.kind} prompt ${i + 1}: a gated command needs an unblockWhen`);
      if (p.unblockWhen && !p.needsYou) errors.push(`${s.kind} prompt ${i + 1}: a gated prompt needs a needsYou line`);
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, plan: r.data };
}

// ── next step → prompt ────────────────────────────────────────────────

const STEP_TAG = "— auto step:";
/** The tag the cycle appends to a step's prompt, so it never opens the same step twice. */
export const stepTag = (key: string) => `${STEP_TAG} ${key}`;
export const stepOf = (text: string): string | null => text.match(/— auto step: (\S+)\s*$/)?.[1] ?? null;

/** The step's unique key: a failed job is one step per job. */
export const stepKey = (s: NextStep) => (s.key === "jobFailed" || s.key === "jobStale" ? `${s.key}:${s.vars.job}` : s.key);

const BLOCK_METRIC: Record<string, string> = { scrape: "newHomes", enhance: "readyNew7", post: "postedDays7", chat: "chats" };

interface Template {
  metric: string;
  title: string;
  why: string;
  do: string;
  doneWhen: string;
  /** Gated: the owner's step, and the condition that says he did it. */
  gated?: { unblockWhen: string; needsYou: string };
}

/** One deterministic prompt per next-step key; null for a step no session can work on (break even is the sum of the rest). */
export function templateFor(s: NextStep): Template | null {
  const v = s.vars;
  switch (s.key) {
    case "brokerSends":
      return {
        metric: "brokersAsked",
        title: "Broker sends on (gated)",
        why: `broker sends are ${v.mode}, so no tenant's pick reaches a broker and no deal can start`,
        do: "Read the last 7 days of broker asks and answers (pnpm wa:brokers status, AgentEvent broker_*), check the gate still holds (test phones, weekly budget per broker), and report anything wrong",
        doneWhen: "the gate is verified and asks are flowing to real tenants' brokers only",
        gated: { unblockWhen: "brokerSends == gated", needsYou: "Do the WhatsApp phone test, then run `pnpm wa:brokers gated`." },
      };
    case "firstDeal":
      return {
        metric: "viewingsBooked",
        title: "First paid deal",
        why: `no paid deal this month; ${v.n} chats reached a shortlist`,
        do: "List the tenants of the last 7 days who reached a shortlist and picked a home, rank them by readiness (budget fits, move-in date, replies), and for the top two prepare the viewing ask, the home and the broker — book nothing. Name a tenant by chat id and the last 3 digits of the number (…155), never the full number: the result shows on /monetize",
        doneWhen: "the top two viewing asks are drafted for Abdout with the exact `pnpm deal:book` command",
        gated: { unblockWhen: "brokerSends == gated", needsYou: "Turn broker sends on so a viewing can be booked." },
      };
    case "recordMoney":
      return {
        metric: "unrecordedRwf",
        title: "Record money received",
        why: `${v.amount} RWF of paid deals is not recorded as received`,
        do: "Match each PAID deal to its RevenueEntry and list the ones missing, with the amount and the payer",
        doneWhen: "every paid deal has its revenue entry",
        gated: { unblockWhen: "unrecordedRwf == 0", needsYou: `Record ${v.amount} RWF received on /monetize (Record money received).` },
      };
    case "capped":
      return {
        metric: "chats",
        title: "API cap reached",
        why: "the agent's monthly API cap is hit, so chats fall back to rules",
        do: "Show where this month's spend went per lane (ApiSpend) and what would bring it under the cap",
        doneWhen: "the cap is lifted or the spend is back under it",
        gated: { unblockWhen: "capped == false", needsYou: "Decide on the agent's API cap (/decide) — raise it or wait for the month." },
      };
    case "invoices":
      return {
        metric: "costMonthRwf",
        title: "Real invoices for fixed costs",
        why: "the fixed costs on /monetize are estimates",
        do: "Check the page reads the real amounts and that break even moved accordingly",
        doneWhen: "the page no longer says estimates",
        gated: { unblockWhen: "fixedEstimated == false", needsYou: "Send the real monthly amounts (Cloudflare share, SIM bundle, Mac power + data) to set MONETIZE_FIXED_COSTS_RWF." },
      };
    case "jobFailed":
    case "jobStale":
      return {
        metric: BLOCK_METRIC[s.block ?? ""] ?? "openSteps",
        title: `Fix ${v.job}`,
        why: `the ${s.block} block's job ${v.job} is ${s.key === "jobFailed" ? "failing" : "stale"}${v.detail ? ` (${v.detail})` : ""}`,
        do: `Read its runs (bash ~/.claude/scripts/runs.sh, then the job's own log), find why, fix the cause, re-run it and show it green`,
        doneWhen: `${v.job} ran ok after the fix`,
      };
    case "failRate":
      return {
        metric: "failRate",
        title: "Cut chat failures",
        why: `${v.pct}% of chats fail`,
        do: "Read the failed chats of the last 7 days (AgentEvent kind failed), group them by cause, fix the biggest cause, and add an eval case for it",
        doneWhen: "the biggest cause is fixed and covered by a test",
      };
    case "bottleneck":
      return {
        metric: `stage.${v.to}`,
        title: `Lift ${v.from} → ${v.to}`,
        why: `the funnel's weakest step is ${v.from} → ${v.to} at ${v.rate}% (floor ${v.floor}%)`,
        do: `Trace items through ${v.from} → ${v.to} this week, find where they stop, and fix the cause in code or config (no sends, no posts)`,
        doneWhen: `${v.from} → ${v.to} is at or above ${v.floor}%, or the fix is deployed with the reason it will get there`,
      };
    case "postDaily":
      return {
        metric: "postedDays7",
        title: "Post every day",
        why: `TikTok posted on ${v.n} of the last 7 days`,
        do: "For each missed day find why (no ready home, Mac asleep, upload failed) and fix what can be fixed so three homes are always ready ahead — never upload by hand",
        doneWhen: "the post lane has three homes ready and the cause of each miss is fixed or named",
      };
    default:
      return null;
  }
}

export interface StepPrompt {
  step: string;
  title: string;
  block: string | null;
  metric: string;
  text: string;
  unblockWhen: string | null;
  needsYou: string | null;
}

/** The deterministic prompt text: why, do, done when, then report the metric and the lesson. */
export function stepPrompt(s: NextStep): StepPrompt | null {
  const t = templateFor(s);
  if (!t) return null;
  const key = stepKey(s);
  const text =
    `In ~/mkan: ${t.why}. ${t.do}. Done when ${t.doneWhen}. ` +
    `Report the before/after of ${t.metric}, then run pnpm sprint:done <this prompt's id> --metric=${t.metric} --lesson="what moved it, or why not".\n\n${stepTag(key)}`;
  return { step: key, title: t.title, block: s.block, metric: t.metric, text, unblockWhen: t.gated?.unblockWhen ?? null, needsYou: t.gated?.needsYou ?? null };
}

/**
 * This week's roadmap entry as a plan (src/lib/monetize/roadmap.ts): its title, goal and tasks, one
 * prompt each. The planner adapts it to the day's numbers; without the planner it is the plan as is.
 */
export function roadmapPlan(now = new Date()): PlanSprint | null {
  const r = roadmapWeek(now);
  const win = weekWindow(now);
  if (!r || !r.tasks.length || r.startsAt !== win.startsAt) return null;
  const tasks = r.tasks.slice(0, 7);
  return {
    kind: "WEEK",
    title: r.title,
    goal: r.goal,
    ...win,
    auto: true,
    tasks: tasks.map((t, i) => ({ key: `r${i + 1}`, title: t.title, ...(t.block !== "cost" ? { block: t.block } : {}) })),
    prompts: tasks.map((t, i) => ({ task: `r${i + 1}`, text: roadTaskPrompt(t, r), metric: t.metric })),
  };
}

/** The month sprint's title from the live break-even and the roadmap's multiple for that month. */
export function monthTitle(breakEvenRwf: number | null | undefined, now = new Date()): string {
  const x = roadmapMonth(now)?.breakEvenX ?? 1;
  const rwf = Math.round(((breakEvenRwf ?? 0) * x) / 1000) * 1000;
  const label = x === 1 ? "Break even" : `${x}× break-even`;
  return rwf > 0 ? `${label} — ${rwf.toLocaleString("en-US")} RWF a month` : label;
}

/** The fallback plan when the planner can't run: one task and one prompt per next step, money first. */
export function fallbackPlan(kind: "WEEK" | "MONTH", steps: NextStep[], now = new Date(), breakEvenRwf?: number | null): PlanSprint {
  const win = kind === "WEEK" ? weekWindow(now) : monthWindow(now);
  const made = steps.map(stepPrompt).filter((p): p is StepPrompt => p !== null).slice(0, 7);
  if (!made.length) {
    // Nothing on the to-do list: still roll a sprint, aimed at the funnel's weakest step.
    made.push({
      step: "funnel",
      title: "Find the next lever",
      block: null,
      metric: "openSteps",
      text: `In ~/mkan: the to-do list on /monetize is empty. Read the first-share funnel (featured → clean → posted → contacts → shortlist → asked → viewing → signed), name the weakest step with its numbers, and fix one cause in code or config. Done when the fix is deployed. Report the before/after of the step's count, then run pnpm sprint:done <this prompt's id> --metric=openSteps --lesson="…".\n\n${stepTag("funnel")}`,
      unblockWhen: null,
      needsYou: null,
    });
  }
  return {
    kind,
    title: kind === "WEEK" ? "First share — the weakest step first" : monthTitle(breakEvenRwf, now),
    goal: kind === "WEEK" ? "Move the first-share funnel's weakest step this week; the first paid deal is the finish line." : (roadmapMonth(now)?.goal ?? "Revenue received this month covers every cost on /monetize."),
    ...win,
    auto: true,
    tasks: made.map((p) => ({ key: p.step, title: p.title, ...(p.block ? { block: p.block as "scrape" | "enhance" | "post" | "chat" } : {}) })),
    prompts: made.map((p) => ({ task: p.step, text: p.text, metric: p.metric, ...(p.unblockWhen ? { unblockWhen: p.unblockWhen, needsYou: p.needsYou ?? undefined } : {}) })),
  };
}

// ── retro ──────────────────────────────────────────────────────────────

/** The numbers a sprint is judged by: stored at its start, compared at its close. */
export const KEY_METRICS = [
  "paidDeals", "paid7", "signed7", "viewings7", "viewingsBooked", "brokersAsked", "brokerAnswerRate", "chats", "tiktokContacts7", "shortlistRate",
  "postsFeatured7", "postsClean7", "postsPosted7", "videoRejectRate", "postedDays7", "viewsPerPost", "readyNew7", "newHomes", "revenueMonthRwf", "paidShareRwf", "brokerSends",
];
/** A sprint's own metric: the week chases the first share, the month the revenue. */
export const sprintMetric = (kind: "WEEK" | "MONTH", m: Metrics) => (kind === "MONTH" ? "revenueMonthRwf" : "paid7" in m ? "paid7" : "paidDeals");

export const pickMetrics = (m: Metrics, keys = KEY_METRICS): Metrics => Object.fromEntries(keys.filter((k) => k in m).map((k) => [k, m[k] ?? null]));

/** Sprint.retro is JSON: { start } at creation; { start, end, tasks, prompts, text } at close. */
export interface Retro {
  start?: Metrics;
  end?: Metrics;
  tasks?: { done: number; total: number };
  prompts?: Record<string, number>;
  text?: string;
}
export function parseRetro(s: string | null | undefined): Retro {
  if (!s) return {};
  try {
    const j = JSON.parse(s) as unknown;
    return j && typeof j === "object" ? (j as Retro) : { text: s };
  } catch {
    return { text: s };
  }
}

/** One readable line per moved number: "chats 12 → 20". */
export function retroText(title: string, r: Required<Pick<Retro, "tasks" | "prompts">> & Retro): string {
  const st = Object.entries(r.prompts).map(([k, n]) => `${n} ${k}`).join(", ");
  const moves = Object.keys(r.end ?? {})
    .filter((k) => r.start && k in r.start && r.start[k] !== r.end![k])
    .map((k) => `${k} ${fmt(r.start![k])} → ${fmt(r.end![k])}`);
  return `${title}: tasks ${r.tasks.done}/${r.tasks.total}; prompts ${st || "none"}. ${moves.length ? `Moved: ${moves.join(", ")}.` : r.start ? "No key number moved." : "No start snapshot (planned by hand)."}`;
}
const fmt = (v: unknown) => (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
