import { Circle, CircleCheck } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { addSprintPrompt, addSprintTask, closeSprint, saveSprint, setPromptStatus, toggleSprintTask } from "@/lib/actions/monetize-actions";
import { formatDate } from "@/lib/i18n/formatters";
import type { LessonView, SprintsView, SprintView } from "@/lib/monetize/sprint-shape";
import { BLOCKS } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";
import { GRADIENT, INK, LINE, MUTED, RichText, Section } from "./listing-ui";

const FIELD = "h-11 w-full rounded-[10px] border border-[#B0B0B0] bg-background px-3 text-sm dark:border-border";
const DOT: Record<string, string> = {
  pending: "bg-[#B0B0B0]",
  running: "bg-[#E31C5F] animate-pulse",
  processed: "bg-[#008A05]",
  skipped: "bg-[#EBEBEB] ring-1 ring-[#B0B0B0]",
  blocked: "bg-[#C13515]",
};

function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#EBEBEB] dark:bg-muted">
      <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: GRADIENT }} />
    </div>
  );
}

function SprintBlock({ sprint, heading, labels, locale, canEdit }: { sprint: SprintView; heading: string; labels: MonetizeLabels; locale: Locale; canEdit: boolean }) {
  const S = labels.sprint;
  const tasksPct = sprint.tasks.length ? sprint.doneTasks / sprint.tasks.length : 0;
  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={cn("text-xs font-bold uppercase tracking-wide", MUTED)}>{heading}</p>
          <p className={cn("text-xs tabular-nums", MUTED)}>
            {fill(S.range, { from: formatDate(new Date(sprint.startsAt), locale), to: formatDate(new Date(new Date(sprint.endsAt).getTime() - 1), locale) })}
          </p>
        </div>
        <h3 className={cn("mt-1 text-lg font-semibold leading-6 tracking-normal", INK)}>{sprint.title}</h3>
        {sprint.auto && <span className={cn("mt-1 inline-block rounded-full bg-[#F7F7F7] px-2 py-0.5 text-xs dark:bg-muted", MUTED)}>{labels.lessons.auto}</span>}
        {sprint.goal && <p className={cn("mt-1 text-sm leading-5", MUTED)}>{sprint.goal}</p>}
        <div className="mt-3 space-y-1.5">
          <Progress value={tasksPct} />
          <p className={cn("text-xs tabular-nums", MUTED)}>
            {fill(S.tasks, { done: sprint.doneTasks, total: sprint.tasks.length })} · {fill(S.prompts, { done: sprint.processedPrompts, total: sprint.prompts.length })}
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {sprint.tasks.map((t) => {
          const Icon = t.done ? CircleCheck : Circle;
          const body = (
            <>
              <Icon className={cn("mt-0.5 size-5 shrink-0", t.done ? "fill-[#222222] text-white dark:fill-foreground dark:text-background" : INK)} strokeWidth={1.5} />
              <span className={cn("text-base leading-6", t.done ? cn(MUTED, "line-through") : INK)}>{t.title}</span>
              {/* i18n-exempt — the fallback is the block's key, shown only when its label is missing */}
              {t.block && <span className={cn("ms-auto shrink-0 text-xs", MUTED)}>{labels.blocks[t.block as keyof MonetizeLabels["blocks"]]?.title ?? t.block}</span>}
            </>
          );
          return (
            <li key={t.id}>
              {canEdit ? (
                <form action={toggleSprintTask}>
                  <input type="hidden" name="id" value={t.id} />
                  <button title={S.toggle} className="flex w-full items-start gap-3 text-start">
                    {body}
                  </button>
                </form>
              ) : (
                <div className="flex items-start gap-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>

      {sprint.prompts.length > 0 && (
        <div>
          <p className={cn("mb-2 text-sm font-semibold", INK)}>{S.promptsTitle}</p>
          <ol className="my-0 ms-0 list-none space-y-1 [&>li]:mt-0">
            {sprint.prompts.map((p, n) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2">
                <a href={`#prompt-${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[#F7F7F7] dark:hover:bg-muted">
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[p.status])} aria-hidden />
                  <span className={cn("w-5 shrink-0 text-xs tabular-nums", MUTED)}>{n + 1}</span>
                  <span dir="auto" className={cn("truncate text-sm", p.status === "pending" || p.status === "running" || p.status === "blocked" ? INK : MUTED)}>
                    {p.text.split("\n")[0]}
                  </span>
                  <span className={cn("ms-auto shrink-0 text-xs", p.status === "blocked" ? "font-semibold text-[#C13515]" : MUTED)}>
                    {(labels.prompt.status as Record<string, string>)[p.status]}
                  </span>
                </a>
                {canEdit && p.status !== "running" && (
                  <form action={setPromptStatus} className="shrink-0">
                    <input type="hidden" name="id" value={p.id} />
                    {p.status === "pending" ? (
                      <button name="status" value="skipped" className={cn("text-xs underline underline-offset-2", MUTED)}>
                        {labels.prompt.skip}
                      </button>
                    ) : (
                      <button name="status" value="pending" className={cn("text-xs underline underline-offset-2", INK)}>
                        {p.status === "blocked" ? labels.prompt.retry : labels.prompt.undo}
                      </button>
                    )}
                  </form>
                )}
                {/* A blocked prompt's result is the one line that says what Abdout must do; the loop resumes it on its own. */}
                {p.status === "blocked" && p.result && (
                  <p dir="auto" className="mb-1 ms-[3.25rem] mt-0 w-full text-xs leading-5 text-[#C13515]">
                    <span className="font-semibold">{labels.lessons.needsYou}: </span>
                    {p.result.slice(0, 220)}
                    {p.unblockWhen && <span className={cn("block", MUTED)}>{p.unblockWhen}</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {canEdit && (
        <details className={cn("rounded-xl border p-4", LINE)}>
          <summary className={cn("cursor-pointer text-sm font-semibold", INK)}>
            {S.addTask} · {S.addPrompt}
          </summary>
          <form action={addSprintTask} className="mt-4 flex gap-2">
            <input type="hidden" name="sprintId" value={sprint.id} />
            <input name="title" required minLength={2} placeholder={S.taskTitle} className={FIELD} />
            <select name="block" className={cn(FIELD, "w-36")} defaultValue="">
              <option value="">—</option>
              {BLOCKS.map((b) => (
                <option key={b} value={b}>
                  {labels.blocks[b].title}
                </option>
              ))}
            </select>
            <button className={cn("h-11 shrink-0 rounded-[10px] border border-[#222222] px-4 text-sm font-semibold", INK)}>{S.addTask}</button>
          </form>
          <form action={addSprintPrompt} className="mt-3 space-y-2">
            <input type="hidden" name="sprintId" value={sprint.id} />
            <textarea name="text" required minLength={5} rows={3} placeholder={S.promptText} className={cn(FIELD, "h-auto py-2")} />
            <div className="flex gap-2">
              <select name="taskId" className={FIELD} defaultValue="">
                <option value="">{S.noTask}</option>
                {sprint.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button className={cn("h-11 shrink-0 rounded-[10px] border border-[#222222] px-4 text-sm font-semibold", INK)}>{S.addPrompt}</button>
            </div>
          </form>
          <form action={closeSprint} className="mt-3">
            <input type="hidden" name="id" value={sprint.id} />
            <button className={cn("text-sm underline underline-offset-2", MUTED)}>{S.close}</button>
          </form>
        </details>
      )}
    </div>
  );
}

function PlanForm({ labels }: { labels: MonetizeLabels }) {
  const S = labels.sprint;
  return (
    <details className={cn("rounded-xl border p-4", LINE)}>
      <summary className={cn("cursor-pointer text-sm font-semibold", INK)}>{S.plan}</summary>
      <form action={saveSprint} className="mt-4 grid grid-cols-2 gap-2">
        <select name="kind" className={FIELD} defaultValue="WEEK">
          <option value="WEEK">{S.week}</option>
          <option value="MONTH">{S.month}</option>
        </select>
        <input name="title" required minLength={2} placeholder={S.name} className={FIELD} />
        <input name="goal" placeholder={S.goal} className={cn(FIELD, "col-span-2")} />
        <label className={cn("text-xs", MUTED)}>
          {S.starts}
          <input name="startsAt" type="date" required className={FIELD} dir="ltr" />
        </label>
        <label className={cn("text-xs", MUTED)}>
          {S.ends}
          <input name="endsAt" type="date" required className={FIELD} dir="ltr" />
        </label>
        <button className="col-span-2 h-11 rounded-[10px] text-sm font-semibold text-white" style={{ background: GRADIENT }}>
          {S.create}
        </button>
      </form>
    </details>
  );
}

/** This week's and this month's sprint, first in the column: progress, task checklist, prompts. */
/** A lesson's before / after as a reader wants it: 151.2, not 151.23076923076923 (2026-11-06). */
const lessonNum = (v: number, locale: Locale) => new Intl.NumberFormat(locale === "ar" ? "ar" : locale, { maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 }).format(v);

function Lessons({ lessons, labels, locale }: { lessons: LessonView[]; labels: MonetizeLabels; locale: Locale }) {
  const L = labels.lessons;
  const tone: Record<string, string> = { moved: "text-[#008A05]", worse: "text-[#C13515]", flat: "text-[#6A6A6A]", unknown: "text-[#6A6A6A]" };
  return (
    <div>
      <p className={cn("text-sm font-semibold", INK)}>{L.title}</p>
      <p className={cn("mb-3 mt-1 text-xs leading-5", MUTED)}>{L.lead}</p>
      {lessons.length === 0 ? (
        <p className={cn("text-sm", MUTED)}>{L.empty}</p>
      ) : (
        <ul className="my-0 ms-0 list-none space-y-2 [&>li]:mt-0">
          {lessons.map((l) => (
            <li key={l.id} className={cn("rounded-lg border p-3 text-sm leading-5", LINE)}>
              <div className="flex flex-wrap items-center gap-x-2 text-xs">
                <span className={cn("font-semibold", tone[l.verdict])}>{(L.verdict as Record<string, string>)[l.verdict] ?? l.verdict}</span>
                {l.metric && (
                  <span className={cn("tabular-nums", MUTED)}>
                    {(labels.kpis as unknown as Record<string, string> | undefined)?.[l.metric] ?? l.metric}
                    {l.before != null && ` ${lessonNum(l.before, locale)} → ${l.after == null ? "…" : lessonNum(l.after, locale)}`}
                  </span>
                )}
                <span className={cn("ms-auto", MUTED)}>{formatDate(new Date(l.createdAt), locale, { year: undefined, month: "short", day: "numeric" })}</span>
              </div>
              <p dir="auto" className={cn("mb-0 mt-1", INK)}>
                {l.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SprintSection({ sprints, lessons = [], labels, locale, canEdit }: { sprints: SprintsView; lessons?: LessonView[]; labels: MonetizeLabels; locale: Locale; canEdit: boolean }) {
  const S = labels.sprint;
  const blocks = [
    { s: sprints.week, h: S.week },
    { s: sprints.month, h: S.month },
  ];
  return (
    <Section id="sprint" title={S.title}>
      <p className={cn("-mt-3 mb-6 text-sm leading-5", MUTED)}>{S.desc}</p>
      <div className="space-y-10">
        {blocks.map(({ s, h }) =>
          s ? (
            <SprintBlock key={s.id} sprint={s} heading={h} labels={labels} locale={locale} canEdit={canEdit} />
          ) : (
            <p key={h} className={cn("text-sm", MUTED)}>
              <span className="font-semibold">{h}: </span>
              {S.none}
            </p>
          ),
        )}
        <Lessons lessons={lessons} labels={labels} locale={locale} />
        {canEdit && <PlanForm labels={labels} />}
        <p className={cn("text-xs leading-5", MUTED)}>
          <RichText t={S.cli} />
        </p>
      </div>
    </Section>
  );
}
