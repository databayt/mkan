"use client";

import { Check, Circle, CircleAlert, Clock, Loader2, X } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";
import { elapsed, fill } from "./format";
import type { AgentEventView, AgentTaskView, EventKind, StepStatus } from "./types";

type PlanStep = "understand" | "search" | "group" | "rank" | "confirm" | "present";

const STEP_EVENT: Record<PlanStep, EventKind> = {
  understand: "requirements_extracted",
  search: "search_done",
  group: "dedup_grouped",
  rank: "ranked",
  confirm: "needs_confirmation",
  present: "shortlist_ready",
};
const STEPS = Object.keys(STEP_EVENT) as PlanStep[];

/** The events of the latest turn: everything from its last `requirements_extracted` on. */
export function latestTurn(events: AgentEventView[]): AgentEventView[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.kind === "requirements_extracted") return events.slice(i);
  }
  return events;
}

function StatusIcon({ status }: { status: StepStatus | "pending" }) {
  const cls = "size-4 shrink-0";
  switch (status) {
    case "done":
      return <Check className={cn(cls, "text-emerald-600")} aria-hidden />;
    case "running":
      return <Loader2 className={cn(cls, "animate-spin text-foreground")} aria-hidden />;
    case "waiting_person":
      return <Clock className={cn(cls, "text-amber-600")} aria-hidden />;
    case "uncertain":
      return <CircleAlert className={cn(cls, "text-amber-600")} aria-hidden />;
    case "failed":
      return <X className={cn(cls, "text-destructive")} aria-hidden />;
    default:
      return <Circle className={cn(cls, "text-muted-foreground/50")} aria-hidden />;
  }
}

export function ExecutionPanel({ task }: { task: AgentTaskView | null }) {
  const dict = useDictionary();
  const p = dict?.agent?.panel;
  const turn = task ? latestTurn(task.events) : [];
  const running = task?.status === "RUNNING";
  const asked = turn.some((e) => e.kind === "asked");
  const turnStart = turn[0]?.at ?? task?.startedAt ?? new Date().toISOString();

  // A step's status is its event's; the first step without one is "running"
  // while the task runs, the rest are pending. An asked turn stops at step 1.
  const eventStatus = (step: PlanStep): StepStatus | null => {
    const ev = turn.find((e) => e.kind === STEP_EVENT[step]);
    if (ev) return ev.status;
    if (step === "confirm" && turn.some((e) => e.kind === "shortlist_ready")) return "done";
    return null;
  };
  const firstGap = STEPS.findIndex((step) => eventStatus(step) === null);
  const plan = STEPS.map((step, i) => ({
    step,
    status: (eventStatus(step) ?? (running && !asked && i === firstGap ? "running" : "pending")) as StepStatus | "pending",
  }));

  const summary = (e: AgentEventView): string => {
    const label = (p?.events as Record<string, string> | undefined)?.[e.kind] ?? e.kind;
    const text = fill(label, e.payload as Record<string, string | number>);
    if (e.kind === "requirements_extracted" && e.payload.reader) {
      const reader = (p?.reader as Record<string, string> | undefined)?.[String(e.payload.reader)];
      return reader ? `${text} · ${reader}` : text;
    }
    return text;
  };

  const shortlistCount = task?.shortlist.length ?? 0;

  return (
    <aside
      aria-live="polite"
      className="rounded-xl border bg-muted/30 p-4 font-mono text-sm lg:sticky lg:top-24"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {p?.title ?? "Rental agent"}
      </p>

      {!task ? (
        <p className="mt-4 font-sans text-muted-foreground">{p?.empty ?? "Every step the agent takes will appear here."}</p>
      ) : (
        <>
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p?.plan ?? "Plan"}</h3>
            <ul className="mt-2 space-y-1.5">
              {plan.map(({ step, status }) => (
                <li key={step} className={cn("flex items-center gap-2", status === "pending" && "text-muted-foreground")}>
                  <StatusIcon status={status} />
                  <span>{(p?.steps as Record<string, string> | undefined)?.[step] ?? step}</span>
                </li>
              ))}
            </ul>
            {plan.find((s) => s.step === "confirm")?.status === "uncertain" && (
              <p className="mt-2 font-sans text-xs text-muted-foreground">
                {p?.confirmLater ?? "Broker confirmation is coming soon. For now, availability is not confirmed."}
              </p>
            )}
          </section>

          <section className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p?.activity ?? "Live activity"}</h3>
            <ol className="mt-2 space-y-1">
              {turn.map((e) => (
                <li key={e.seq} className="flex items-start gap-2">
                  <span className="w-11 shrink-0 tabular-nums text-muted-foreground" dir="ltr">
                    {elapsed(turnStart, e.at)}
                  </span>
                  <StatusIcon status={e.status} />
                  <span className="font-sans">
                    {summary(e)}
                    <span className="sr-only"> — {(p?.status as Record<string, string> | undefined)?.[e.status] ?? e.status}</span>
                  </span>
                </li>
              ))}
              {running && (
                <li className="flex items-center gap-2 text-muted-foreground">
                  <span className="w-11 shrink-0" />
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span className="font-sans">{dict?.agent?.reply?.working ?? "Working on it…"}</span>
                </li>
              )}
            </ol>
          </section>

          {shortlistCount > 0 && (
            <section className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{p?.results ?? "Results"}</h3>
              <p className="mt-2 font-sans">
                {fill(p?.events?.shortlist_ready ?? "Shortlist ready: {count} homes", { count: shortlistCount })}
              </p>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
