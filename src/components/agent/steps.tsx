"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle, CircleAlert, Clock, Loader2, X } from "lucide-react";
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

function StatusIcon({ status }: { status: StepStatus | "pending" }) {
  const cls = "size-3.5 shrink-0";
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

/**
 * The agent's work for the latest turn, folded like an assistant's "thinking"
 * block: open and shimmering while it runs, a one-line summary once done. Every
 * line is an `AgentEvent` row — nothing here is invented for show.
 */
export function Steps({ task, compact = false }: { task: AgentTaskView; compact?: boolean }) {
  const dict = useDictionary();
  const p = dict?.agent?.panel;
  const turn = latestTurn(task.events);
  const running = task.status === "RUNNING";
  const asked = turn.some((e) => e.kind === "asked");
  const turnStart = turn[0]?.at ?? task.startedAt;
  // null = follow the task (open while running); a click pins it.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const open = pinned ?? running;

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
  const headline = running
    ? (current && (p?.steps as Record<string, string> | undefined)?.[current]) || dict?.agent?.reply?.working || "Working on it…"
    : HEADLINE.map((k) => [...turn].reverse().find((e) => e.kind === k))
        .filter((e): e is AgentEventView => !!e)
        .map(summary)
        .join(" · ") || (turn.at(-1) ? summary(turn.at(-1)!) : "");
  const lastAt = turn.at(-1)?.at;
  const failed = turn.some((e) => e.status === "failed");

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
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <StatusIcon status={failed ? "failed" : "done"} />
        )}
        <span
          className={cn(
            "truncate",
            running &&
              "animate-shimmer bg-[linear-gradient(90deg,var(--muted-foreground)_25%,var(--foreground)_50%,var(--muted-foreground)_75%)] bg-[length:200%_100%] bg-clip-text text-transparent",
          )}
        >
          {headline}
        </span>
        {!running && lastAt && (
          <span className="shrink-0 tabular-nums opacity-70" dir="ltr">
            {elapsed(turnStart, lastAt)}
          </span>
        )}
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
        <span className="sr-only">{open ? p?.hideSteps ?? "Hide steps" : p?.showSteps ?? "Show steps"}</span>
      </button>

      {open && (
        <div className={cn("mt-2 border-s-2 ps-3", compact ? "space-y-2" : "space-y-3")}>
          <ul className="space-y-1">
            {plan.map(({ step, status }) => (
              <li key={step} className={cn("flex items-center gap-2", status !== "pending" && "text-foreground")}>
                <StatusIcon status={status} />
                <span>{(p?.steps as Record<string, string> | undefined)?.[step] ?? step}</span>
              </li>
            ))}
          </ul>
          {plan.find((s) => s.step === "confirm")?.status === "uncertain" && !turn.some((e) => e.kind === "broker_contact_started") && (
            <p className="text-xs">{p?.confirmLater ?? "Availability is not confirmed yet."}</p>
          )}
          {!compact && (
            <ol className="space-y-1 font-mono text-xs">
              {turn.map((e) => (
                <li key={e.seq} className="flex items-start gap-2">
                  <span className="w-10 shrink-0 tabular-nums" dir="ltr">
                    {elapsed(turnStart, e.at)}
                  </span>
                  <StatusIcon status={e.status} />
                  <span className="font-sans">
                    {summary(e)}
                    <span className="sr-only"> — {(p?.status as Record<string, string> | undefined)?.[e.status] ?? e.status}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
