"use client";

import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { setPromptStatus } from "@/lib/actions/monetize-actions";
import type { SprintPromptView } from "@/lib/monetize/sprint-shape";
import { cn } from "@/lib/utils";

export interface PromptCardLabels {
  title: string;
  of: string;
  prev: string;
  next: string;
  copy: string;
  copied: string;
  doneLine: string;
  week: string;
  month: string;
  status: Record<string, string>;
  processedAt: string;
  markProcessed: string;
  skip: string;
  undo: string;
}

const fill = (t: string, v: Record<string, string | number>) => Object.entries(v).reduce((o, [k, x]) => o.replaceAll(`{${k}}`, String(x)), t);

const STATUS_TONE: Record<string, string> = {
  pending: "bg-white text-[#222222] dark:bg-background dark:text-foreground",
  processed: "bg-[#EBFBF0] text-[#008A05]",
  skipped: "bg-[#EBEBEB] text-[#6A6A6A]",
};

/**
 * The next prompt to carry the sprint on: plain text on a muted panel, one Copy
 * button, prev / next through the week's prompts then the month's. Opens on the
 * first pending prompt; `#prompt-<id>` (the sprint list's links) jumps to one.
 * Admins also mark it processed or skipped — the same rows `pnpm sprint:done` writes.
 */
export function PromptCard({ prompts, start, labels, canEdit, locale }: { prompts: SprintPromptView[]; start: number; labels: PromptCardLabels; canEdit: boolean; locale: string }) {
  const [i, setI] = useState(Math.min(start, Math.max(prompts.length - 1, 0)));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const jump = () => {
      const m = /^#prompt-(.+)$/.exec(window.location.hash);
      if (!m) return;
      const at = prompts.findIndex((p) => p.id === m[1]);
      if (at >= 0) {
        setI(at);
        document.getElementById("top-task")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, [prompts]);

  const p = prompts[i];
  if (!p) return null;
  // What a session runs when it has done the prompt — copied with it, so tracking needs no lookup.
  const doneCmd = `pnpm sprint:done ${p.id}${p.taskId ? " --task-done" : ""} --result="…"`;
  const go = (d: number) => {
    setCopied(false);
    setI((x) => (x + d + prompts.length) % prompts.length);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${p.text}\n\n${fill(labels.doneLine, { cmd: doneCmd })}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const when = p.processedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(p.processedAt)) : null;

  return (
    <div id="top-task" className="scroll-mt-28 rounded-2xl bg-[#F7F7F7] p-6 md:p-8 dark:bg-muted">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-[#222222] dark:text-foreground">{labels.title}</span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-[#222222] dark:bg-background dark:text-foreground">
            {p.kind === "WEEK" ? labels.week : labels.month}
          </span>
          {p.taskTitle && <span className="truncate text-[#6A6A6A] dark:text-muted-foreground">· {p.taskTitle}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums text-[#6A6A6A] dark:text-muted-foreground">{fill(labels.of, { i: i + 1, n: prompts.length })}</span>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={labels.prev}
            disabled={prompts.length < 2}
            className="flex size-8 items-center justify-center rounded-full border border-[#B0B0B0] bg-white text-[#222222] hover:border-[#222222] disabled:opacity-30 dark:bg-background dark:text-foreground"
          >
            <ChevronLeft className="size-4 rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={labels.next}
            disabled={prompts.length < 2}
            className="flex size-8 items-center justify-center rounded-full border border-[#B0B0B0] bg-white text-[#222222] hover:border-[#222222] disabled:opacity-30 dark:bg-background dark:text-foreground"
          >
            <ChevronRight className="size-4 rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      <p dir="auto" className="mt-5 whitespace-pre-wrap text-[15px] leading-6 text-[#222222] dark:text-foreground">
        {p.text}
      </p>
      <p dir="ltr" className="mt-3 break-all font-mono text-xs leading-5 text-[#6A6A6A] dark:text-muted-foreground">
        {fill(labels.doneLine, { cmd: doneCmd })}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cn("rounded-full px-2.5 py-1 font-semibold", STATUS_TONE[p.status])}>{labels.status[p.status]}</span>
          {when && <span className="text-[#6A6A6A] dark:text-muted-foreground">{fill(labels.processedAt, { time: when })}</span>}
          {p.result && <span className="text-[#6A6A6A] dark:text-muted-foreground">· {p.result}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <form action={setPromptStatus} className="flex gap-2">
              <input type="hidden" name="id" value={p.id} />
              {p.status === "pending" ? (
                <>
                  <button name="status" value="skipped" className="h-10 rounded-[10px] px-3 text-sm font-semibold text-[#222222] underline underline-offset-2 dark:text-foreground">
                    {labels.skip}
                  </button>
                  <button name="status" value="processed" className="h-10 rounded-[10px] border border-[#222222] bg-white px-4 text-sm font-semibold text-[#222222] hover:bg-[#F7F7F7] dark:bg-background dark:text-foreground">
                    {labels.markProcessed}
                  </button>
                </>
              ) : (
                <button name="status" value="pending" className="h-10 rounded-[10px] px-3 text-sm font-semibold text-[#222222] underline underline-offset-2 dark:text-foreground">
                  {labels.undo}
                </button>
              )}
            </form>
          )}
          <button
            type="button"
            onClick={copy}
            className="flex h-10 items-center gap-2 rounded-[10px] px-4 text-sm font-semibold text-white hover:opacity-95"
            style={{ background: "linear-gradient(to right, #E61E4D 0%, #E31C5F 50%, #D70466 100%)" }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? labels.copied : labels.copy}
          </button>
        </div>
      </div>
    </div>
  );
}
