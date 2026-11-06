"use client";

import { Check, ChevronDown, Copy } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import { decidePrompt } from "@/lib/actions/monetize-actions";

import type { LiveTask, LiveView, LoopState } from "@/lib/monetize/live-shape";
import { cn } from "@/lib/utils";

import type { MonetizeLabels } from "./format";

const fill = (t: string, v: Record<string, string | number>) => Object.entries(v).reduce((o, [k, x]) => o.replaceAll(`{${k}}`, String(x)), t);

const DOT: Record<LoopState, string> = {
  running: "bg-[#008A05] animate-pulse",
  checking: "bg-[#008A05] animate-pulse",
  planning: "bg-[#008A05] animate-pulse",
  idle: "bg-[#B0B0B0]",
  waiting: "bg-[#C68A00]",
  parked: "bg-[#6A6A6A]",
  stopped: "bg-[#6A6A6A]",
  offline: "bg-[#C13515]",
};

type Labels = MonetizeLabels["live"];

function ago(from: string | null, now: number, L: Labels): string | null {
  if (!from) return null;
  const mins = Math.max(0, Math.round((now - Date.parse(from)) / 60_000));
  if (mins < 60) return fill(L.min, { n: mins });
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m && h < 10 ? fill(L.hoursMin, { h, m }) : fill(L.hours, { n: h });
}

function Row({ label, task, blocks, none, children }: { label: string; task: LiveTask | null; blocks: Record<string, string>; none: string; children?: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 py-2 sm:grid-cols-[96px_minmax(0,1fr)]">
      <span className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-[#6A6A6A] dark:text-muted-foreground">{label}</span>
      <div className="min-w-0">
        {task ? (
          <p className="text-base leading-6 text-[#222222] dark:text-foreground" dir="auto">
            {task.title}
            {task.block && blocks[task.block] && <span className="ms-2 rounded-full bg-white px-2 py-0.5 align-middle text-xs text-[#6A6A6A] dark:bg-background dark:text-muted-foreground">{blocks[task.block]}</span>}
          </p>
        ) : (
          <p className="text-base leading-6 text-[#6A6A6A] dark:text-muted-foreground">{none}</p>
        )}
        {children}
      </div>
    </div>
  );
}

/** A prepared one-tap decision: what Yes does, then Yes / No — or the answer and how it went. */
function Decision({ task, L, onDone }: { task: LiveTask; L: Labels; onDone: () => void }) {
  const d = task.decision!;
  const D = L.decide;
  const [pending, start] = useTransition();
  const [answered, setAnswered] = useState<"yes" | "no" | null>(d.answer);
  const answer = (a: "yes" | "no") =>
    start(async () => {
      const fd = new FormData();
      fd.set("promptId", task.id);
      fd.set("decision", a);
      try {
        await decidePrompt(fd);
        setAnswered(a);
        onDone();
      } catch {
        setAnswered(null);
      }
    });
  return (
    <div className="mt-1.5 rounded-xl bg-white p-3 dark:bg-background">
      <p className="text-sm font-medium text-[#222222] dark:text-foreground" dir="auto">
        {d.ask}
      </p>
      <p className="mt-1 text-sm text-[#6A6A6A] dark:text-muted-foreground" dir="auto">
        {D.what} {d.effect}
      </p>
      {d.done ? (
        <p className={cn("mt-2 text-sm font-semibold", d.ok === false ? "text-[#C13515]" : "text-[#008A05]")}>{d.ok === false ? fill(D.failed, { e: d.output ?? "" }) : D.done}</p>
      ) : answered ? (
        <p className="mt-2 text-sm font-semibold text-[#222222] dark:text-foreground">{answered === "yes" ? D.answeredYes : D.answeredNo}</p>
      ) : (
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={pending} onClick={() => answer("yes")} className="h-9 rounded-full bg-[#222222] px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-foreground dark:text-background">
            {D.yes}
          </button>
          <button type="button" disabled={pending} onClick={() => answer("no")} className="h-9 rounded-full border border-[#B0B0B0] px-5 text-sm font-semibold text-[#222222] disabled:opacity-50 dark:border-border dark:text-foreground">
            {D.no}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The loop, live: what it is doing now and for how long, what's next, what it finished last, and — for an
 * admin — every step that waits on Abdout with the one thing to do. Polls /api/monetize/live every 15 s
 * while the tab is visible; the server renders the first state, so nothing flashes.
 */
export function LiveCard({ initial, labels, blocks, canEdit, locale }: { initial: LiveView; labels: Labels; blocks: Record<string, string>; canEdit: boolean; locale: string }) {
  const L = labels;
  const [live, setLive] = useState(initial);
  const [now, setNow] = useState(() => Date.parse(initial.generatedAt));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const pull = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const r = await fetch("/api/monetize/live", { cache: "no-store" });
      if (r.ok) setLive((await r.json()) as LiveView);
    } catch {
      // The next pull tries again; the card keeps the last state it had.
    }
  }, []);

  useEffect(() => {
    const poll = setInterval(pull, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    // The server's clock rendered the first "for 12 min"; the browser's takes over right after.
    const first = setTimeout(() => setNow(Date.now()), 0);
    document.addEventListener("visibilitychange", pull);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      clearTimeout(first);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [pull]);

  const busy = live.running ?? null;
  const prompt = busy ?? live.next;
  const since = ago(busy?.at ?? live.since, now, L);
  const until = live.until ? new Date(live.until) : null;
  const untilText = until
    ? // Kigali time, the same on the server and in the browser (no hydration mismatch).
      new Intl.DateTimeFormat(locale, { timeZone: "Africa/Kigali", weekday: until.getTime() - now > 20 * 3_600_000 ? "short" : undefined, hour: "2-digit", minute: "2-digit" }).format(until)
    : null;

  const copy = async () => {
    if (!prompt?.text) return;
    try {
      await navigator.clipboard.writeText(`${prompt.text}\n\n${fill(L.doneLine, { cmd: `pnpm sprint:done ${prompt.id} --result="…"` })}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section id="top-task" aria-live="polite" className="scroll-mt-28 rounded-2xl bg-[#F7F7F7] p-4 md:p-6 dark:bg-muted">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-2 text-base font-semibold text-[#222222] dark:text-foreground">
          <span className={cn("size-2.5 shrink-0 rounded-full", DOT[live.state])} aria-hidden />
          <span>
            {L.title}: {L.states[live.state]}
          </span>
          {live.state === "parked" && untilText ? (
            <span className="font-normal text-[#6A6A6A] dark:text-muted-foreground">{fill(L.until, { t: untilText })}</span>
          ) : since ? (
            <span className="font-normal text-[#6A6A6A] dark:text-muted-foreground">{fill(L.for, { d: since })}</span>
          ) : null}
        </p>
        <p className="text-sm tabular-nums text-[#6A6A6A] dark:text-muted-foreground">{fill(L.done, { n: live.doneToday, w: live.doneWeek })}</p>
      </div>
      {canEdit && live.note && <p className="mt-1 text-sm text-[#6A6A6A] dark:text-muted-foreground" dir="auto">{live.note}</p>}

      <div className="mt-3 divide-y divide-[#DDDDDD] dark:divide-border">
        <Row label={busy ? L.now : L.next} task={prompt} blocks={blocks} none={L.none}>
          {prompt?.text && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-sm font-medium text-[#222222] underline underline-offset-2 dark:text-foreground">
                {open ? L.hidePrompt : L.showPrompt}
                <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
              </button>
              <button type="button" onClick={copy} aria-label={L.copy} title={L.copy} className="flex size-8 items-center justify-center rounded-full text-[#222222] hover:bg-white dark:text-foreground dark:hover:bg-background">
                {copied ? <Check className="size-4 text-[#008A05]" /> : <Copy className="size-4" />}
              </button>
            </div>
          )}
          {open && prompt?.text && (
            <p dir="auto" className="mt-2 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-6 text-[#222222] dark:bg-background dark:text-foreground">
              {prompt.text}
            </p>
          )}
        </Row>
        {busy && <Row label={L.next} task={live.next} blocks={blocks} none={L.none} />}
        <Row label={L.last} task={live.last} blocks={blocks} none={L.none}>
          {canEdit && live.last?.result && (
            <p className="mt-1 text-sm leading-5 text-[#6A6A6A] dark:text-muted-foreground" dir="auto">
              {live.last.result}
            </p>
          )}
        </Row>
        {live.needsYou.length > 0 && (
          <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 py-2 sm:grid-cols-[96px_minmax(0,1fr)]">
            <span className="pt-0.5 text-xs font-semibold uppercase tracking-wide text-[#C13515]">{L.needsYou}</span>
            {canEdit ? (
              <ul className="min-w-0 space-y-2">
                {live.needsYou.map((t) => (
                  <li key={t.id} className="text-sm leading-5" dir="auto">
                    <span className="font-medium text-[#222222] dark:text-foreground">{t.title}</span>
                    {t.decision ? <Decision task={t} L={L} onDone={pull} /> : t.result && <span className="block text-[#6A6A6A] dark:text-muted-foreground">{t.result}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-base leading-6 text-[#222222] dark:text-foreground">{fill(L.needsYouCount, { n: live.needsYou.length })}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
