import { Circle, CircleCheck, CircleDashed, CircleDot, Hand } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { formatDate } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { roadmapNext, rungsView } from "@/lib/monetize/roadmap";
import type { SprintView } from "@/lib/monetize/sprint-shape";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { GRADIENT, H2, INK, LINE, MUTED } from "./listing-ui";

type TaskStatus = "done" | "running" | "blocked" | "pending" | "open";

const STATUS_ICON = { done: CircleCheck, running: CircleDot, blocked: Hand, pending: Circle, open: CircleDashed } as const;
const STATUS_TONE: Record<TaskStatus, string> = {
  done: "fill-[#222222] text-white dark:fill-foreground dark:text-background",
  running: "text-[#008A05]",
  blocked: "text-[#C13515]",
  pending: "text-[#222222] dark:text-foreground",
  open: "text-[#B0B0B0]",
};

/** A task's state from its prompts: done, a prompt running, one waiting on Abdout, one up next, or open. */
function taskStatus(s: SprintView, taskId: string, done: boolean): TaskStatus {
  if (done) return "done";
  const ps = s.prompts.filter((p) => p.taskId === taskId);
  if (ps.some((p) => p.status === "running")) return "running";
  if (ps.some((p) => p.status === "blocked")) return "blocked";
  if (ps.some((p) => p.status === "pending")) return "pending";
  if (ps.length && ps.every((p) => p.status === "processed" || p.status === "skipped")) return "done";
  return "open";
}

function Bar({ value, tone = "gradient" }: { value: number; tone?: "gradient" | "done" }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#EBEBEB] dark:bg-muted">
      <div
        className={cn("h-full rounded-full", tone === "done" && "bg-[#008A05]")}
        style={{ width: `${Math.max(value > 0 ? 3 : 0, Math.round(value * 100))}%`, ...(tone === "gradient" ? { background: GRADIENT } : {}) }}
      />
    </div>
  );
}

function SprintBlock({ sprint, kicker, labels, locale }: { sprint: SprintView; kicker: string; labels: MonetizeLabels; locale: Locale }) {
  const R = labels.road;
  const blockTitle = (b: string | null) => (b && b in labels.blocks ? labels.blocks[b as keyof typeof labels.blocks].title : null);
  const tasks = sprint.tasks.map((t) => ({ ...t, status: taskStatus(sprint, t.id, t.done) }));
  const done = tasks.filter((t) => t.status === "done").length;
  return (
    <div>
      <p className={cn("text-xs font-bold uppercase tracking-wide", MUTED)}>
        {kicker} · {fill(labels.sprint.range, { from: formatDate(new Date(sprint.startsAt), locale), to: formatDate(new Date(new Date(sprint.endsAt).getTime() - 1), locale) })}
      </p>
      <h3 className={cn("mt-1 text-lg font-semibold leading-6 tracking-normal", INK)} dir="auto">
        {sprint.title}
      </h3>
      {sprint.goal && (
        <p className={cn("mt-1 text-sm leading-5", MUTED)} dir="auto">
          {sprint.goal}
        </p>
      )}
      <div className="mt-3 space-y-1.5">
        <Bar value={tasks.length ? done / tasks.length : 0} />
        <p className={cn("text-xs tabular-nums", MUTED)}>{fill(R.tasksDone, { done, total: tasks.length })}</p>
      </div>
      {tasks.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {tasks.map((t) => {
            const Icon = STATUS_ICON[t.status];
            const b = blockTitle(t.block);
            return (
              <li key={t.id} className="flex items-start gap-3">
                <Icon className={cn("mt-0.5 size-5 shrink-0", STATUS_TONE[t.status])} strokeWidth={1.5} aria-hidden />
                <span className={cn("min-w-0 flex-1 text-base leading-6", t.status === "done" ? cn(MUTED, "line-through") : INK)} dir="auto">
                  {t.title}
                  <span className="sr-only"> — {R.status[t.status]}</span>
                </span>
                {t.status !== "done" && t.status !== "open" && (
                  <span className={cn("mt-0.5 shrink-0 text-xs font-semibold", t.status === "blocked" ? "text-[#C13515]" : t.status === "running" ? "text-[#008A05]" : MUTED)} aria-hidden>
                    {R.status[t.status]}
                  </span>
                )}
                {b && <span className={cn("mt-0.5 hidden shrink-0 rounded-full bg-[#F7F7F7] px-2 py-0.5 text-xs sm:inline dark:bg-muted", MUTED)}>{b}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * The road to money (src/lib/monetize/roadmap.ts): the ladder of monthly money, this week's sprint task by
 * task, the month's goal, the sprints after this one, and what the loop has learned so far.
 */
export function Road({ data, labels, locale }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale }) {
  const R = labels.road;
  const now = new Date(data.generatedAt);
  const rungs = rungsView(data.money.revenueRwf, data.money.breakEvenRwf);
  const next = roadmapNext(now, 3);
  const rwf = (v: number) => formatValue(v, "rwf", locale);
  const verdict = labels.lessons.verdict as Record<string, string>;
  return (
    <section id="road" className="scroll-mt-28 space-y-10">
      <div>
        <H2>{R.title}</H2>
        <p className={cn("mt-2 text-base leading-6", MUTED)}>{R.lead}</p>
      </div>

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rungs.map((r) => (
          <li key={r.key} className={cn("flex flex-col justify-between gap-3 rounded-xl border p-3", r.reached ? "border-[#008A05]" : LINE)}>
            <div>
              <p className={cn("text-xs font-semibold tabular-nums", MUTED)}>{r.key}</p>
              <p className={cn("mt-0.5 text-sm font-semibold leading-5", INK)}>{R.rungs[r.label]}</p>
              <p className={cn("text-xs tabular-nums", MUTED)}>{r.targetRwf > 0 ? fill(R.rungTarget, { v: rwf(r.targetRwf) }) : R.rungAny}</p>
            </div>
            <div className="space-y-1">
              <Bar value={r.progress} tone={r.reached ? "done" : "gradient"} />
              {r.reached && <p className="text-xs font-semibold text-[#008A05]">{R.reached}</p>}
            </div>
          </li>
        ))}
      </ol>

      {data.sprints.week ? (
        <SprintBlock sprint={data.sprints.week} kicker={R.thisWeek} labels={labels} locale={locale} />
      ) : (
        <p className={cn("text-base", MUTED)}>{R.none}</p>
      )}

      {next.length > 0 && (
        <div>
          <p className={cn("mb-3 text-xs font-bold uppercase tracking-wide", MUTED)}>{R.next}</p>
          <ol className={cn("divide-y border-y", LINE)}>
            {next.map((s) => (
              <li key={s.key} className={cn("grid grid-cols-[48px_minmax(0,1fr)] gap-3 py-3", LINE)}>
                <span className={cn("pt-0.5 text-sm font-semibold tabular-nums", MUTED)}>{s.key}</span>
                <div className="min-w-0">
                  <p className={cn("text-base font-medium leading-6", INK)}>
                    {s.title}
                    <span className={cn("ms-2 text-xs font-normal tabular-nums", MUTED)}>
                      {fill(labels.sprint.range, { from: formatDate(new Date(`${s.startsAt}T00:00:00Z`), locale), to: formatDate(new Date(Date.parse(`${s.endsAt}T00:00:00Z`) - 1), locale) })} · {fill(R.tasks, { n: s.tasks.length })}
                    </span>
                  </p>
                  <p className={cn("text-sm leading-5", MUTED)}>{s.goal}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {data.sprints.month && <SprintBlock sprint={data.sprints.month} kicker={R.month} labels={labels} locale={locale} />}

      {data.lessons.length > 0 && (
        <details className={cn("group border-t pt-4", LINE)}>
          <summary className={cn("cursor-pointer list-none text-base font-semibold [&::-webkit-details-marker]:hidden", INK)}>
            {R.learned} <span className={cn("text-sm font-normal", MUTED)}>({data.lessons.length})</span>
          </summary>
          <ul className="mt-4 space-y-4">
            {data.lessons.slice(0, 5).map((l) => (
              <li key={l.id} className="space-y-1">
                <p className={cn("text-xs font-semibold tabular-nums", l.verdict === "moved" ? "text-[#008A05]" : l.verdict === "worse" ? "text-[#C13515]" : MUTED)}>
                  {verdict[l.verdict] ?? l.verdict}
                  {l.metric && ` · ${l.metric}`}
                  {l.before != null && ` ${+l.before.toFixed(2)} → ${l.after != null ? +l.after.toFixed(2) : "…"}`}
                </p>
                <p className={cn("text-sm leading-5", INK)} dir="auto">
                  {l.text}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
