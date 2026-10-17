"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
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
/** The events the collapsed header line is made of, in order. */
const HEADLINE: EventKind[] = ["search_done", "ranked", "broker_contact_started", "broker_replied"];

/** The events of the latest turn: everything from its last `requirements_extracted` on. */
export function latestTurn(events: AgentEventView[]): AgentEventView[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.kind === "requirements_extracted") return events.slice(i);
  }
  return events;
}

/** Claude Code's result dot: green done, amber waiting on a person, red failed, pulsing while running. */
function Dot({ status }: { status: StepStatus }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[0.45em] inline-block size-2 shrink-0 rounded-full",
        status === "done" && "bg-emerald-500",
        (status === "waiting_person" || status === "uncertain") && "bg-amber-500",
        status === "failed" && "bg-destructive",
        status === "running" && "animate-pulse bg-muted-foreground",
      )}
    />
  );
}

/**
 * The agent's work for the latest turn, written like a Claude Code transcript:
 * a todo list, then one `⏺ Tool` line per step with its `⎿` result. Folded to
 * one line once done; open, with a "✻ Searching… (3s)" spinner, while it runs.
 * Every line is an `AgentEvent` row — nothing here is invented for show.
 */
export function Steps({ task, compact = false }: { task: AgentTaskView; compact?: boolean }) {
  const dict = useDictionary();
  const p = dict?.agent?.panel;
  const tr = dict?.agent?.trace;
  const tools = tr?.tools as Record<string, string> | undefined;
  const verbs = tr?.verbs as Record<string, string> | undefined;
  const turn = latestTurn(task.events);
  const running = task.status === "RUNNING";
  const asked = turn.some((e) => e.kind === "asked");
  const turnStart = turn[0]?.at ?? task.startedAt;
  // null = follow the task (open while running); a click pins it.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const open = pinned ?? running;

  // The spinner's seconds tick while the turn runs.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // A step's status is its event's; the first step without one is "running"
  // while the task runs, the rest are pending. An asked turn stops at step 1.
  const eventStatus = (step: PlanStep): StepStatus | null => {
    if (step === "confirm") {
      // The broker loop outlives the turn: its latest event is the step's state.
      const broker = [...turn].reverse().find((e) => e.kind === "broker_replied" || e.kind === "broker_contact_started");
      const pendingBroker = task.shortlist.some((s) => s.availability === "asked");
      if (broker) return pendingBroker ? "waiting_person" : "done";
    }
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
    const events = p?.events as Record<string, string> | undefined;
    if (e.kind === "broker_contact_started") {
      if (e.payload.reused) return `${events?.broker_contact_reused ?? ""}${e.payload.title ? ` · ${e.payload.title}` : ""}`;
      const channel = (p?.channel as Record<string, string> | undefined)?.[String(e.payload.channel)];
      const text = fill(events?.broker_contact_started ?? "{broker}", { broker: String(e.payload.broker ?? "—"), count: Number(e.payload.count ?? 1) });
      return channel ? `${text} · ${channel}` : text;
    }
    if (e.kind === "broker_replied") {
      const answer = (p?.answers as Record<string, string> | undefined)?.[String(e.payload.answer)] ?? String(e.payload.answer);
      const text = fill(events?.broker_replied ?? "{answer}", { answer });
      return e.payload.title ? `${text} · ${e.payload.title}` : text;
    }
    const label = events?.[e.kind] ?? e.kind;
    const text = fill(label, e.payload as Record<string, string | number>);
    if (e.kind === "requirements_extracted" && e.payload.reader) {
      const reader = (p?.reader as Record<string, string> | undefined)?.[String(e.payload.reader)];
      return reader ? `${text} · ${reader}` : text;
    }
    return text;
  };

  const current = plan.find((s) => s.status === "running")?.step;
  const seconds = Math.max(0, Math.round((now - Date.parse(turnStart)) / 1000));
  const lastAt = turn.at(-1)?.at;
  const failed = turn.some((e) => e.status === "failed");
  const headline = asked
    ? summary(turn.find((e) => e.kind === "asked")!)
    : HEADLINE.map((k) => [...turn].reverse().find((e) => e.kind === k))
        .filter((e): e is AgentEventView => !!e)
        .map(summary)
        .join(" · ") || (turn.at(-1) ? summary(turn.at(-1)!) : "");

  if (turn.length === 0 && !running) return null;

  return (
    <div className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")} aria-live="polite">
      <button
        type="button"
        onClick={() => setPinned(!open)}
        aria-expanded={open}
        className="group flex max-w-full items-center gap-1.5 text-start hover:text-foreground"
      >
        {running ? (
          <>
            <span aria-hidden className="shrink-0 animate-spin text-amber-600 [animation-duration:2.4s]">
              ✻
            </span>
            <span className="animate-shimmer truncate bg-[linear-gradient(90deg,var(--muted-foreground)_25%,var(--foreground)_50%,var(--muted-foreground)_75%)] bg-[length:200%_100%] bg-clip-text text-transparent">
              {(current && verbs?.[current]) || dict?.agent?.reply?.working}
            </span>
            <span className="shrink-0 tabular-nums opacity-70" dir="ltr">
              ({seconds}s)
            </span>
          </>
        ) : (
          <>
            <Dot status={failed ? "failed" : asked ? "waiting_person" : "done"} />
            <span className="truncate">{headline}</span>
            {lastAt && (
              <span className="shrink-0 tabular-nums opacity-70" dir="ltr">
                {elapsed(turnStart, lastAt)}
              </span>
            )}
          </>
        )}
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        <span className="sr-only">{open ? p?.hideSteps ?? "Hide steps" : p?.showSteps ?? "Show steps"}</span>
      </button>

      {open && (
        <ol className={cn("mt-2 list-none space-y-2 font-mono", compact ? "text-[11px]" : "text-xs")}>
          {/* The plan, as Claude Code's todo list. */}
          <li className="flex gap-2">
            <Dot status={running ? "running" : failed ? "failed" : "done"} />
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{tr?.todos ?? "Update Todos"}</p>
              <ul className="mt-0.5 list-none space-y-0.5">
                {plan.map(({ step, status }, i) => (
                  <li key={step} className="flex gap-1.5">
                    <span className="w-3 shrink-0 opacity-60">{i === 0 ? "⎿" : ""}</span>
                    <span className={cn(status === "running" && "font-semibold text-foreground", status === "done" && "line-through opacity-70")}>
                      {status === "done" ? "☒" : "☐"} {(p?.steps as Record<string, string> | undefined)?.[step] ?? step}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </li>

          {turn.map((e) => (
            <li key={e.seq} className="flex gap-2">
              <Dot status={e.status} />
              <div className="min-w-0">
                <p>
                  <span className="font-semibold text-foreground">{tools?.[e.kind] ?? e.kind}</span>
                  {!compact && (
                    <span className="ms-2 tabular-nums opacity-60" dir="ltr">
                      {elapsed(turnStart, e.at)}
                    </span>
                  )}
                </p>
                <p className="flex gap-1.5">
                  <span className="w-3 shrink-0 opacity-60">⎿</span>
                  <span className="font-sans">
                    {summary(e)}
                    <span className="sr-only"> — {(p?.status as Record<string, string> | undefined)?.[e.status] ?? e.status}</span>
                  </span>
                </p>
              </div>
            </li>
          ))}

          {plan.find((s) => s.step === "confirm")?.status === "uncertain" && !turn.some((e) => e.kind === "broker_contact_started") && (
            <li className="ps-4 font-sans">{p?.confirmLater ?? "Availability is not confirmed yet."}</li>
          )}
        </ol>
      )}
    </div>
  );
}
