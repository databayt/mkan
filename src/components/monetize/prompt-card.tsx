"use client";

import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { SprintPromptView } from "@/lib/monetize/sprint-shape";
import { cn } from "@/lib/utils";

export interface PromptCardLabels {
  copyAria: string;
  prev: string;
  next: string;
  doneLine: string;
  auto: string;
  status: Record<string, string>;
}

const fill = (t: string, v: Record<string, string | number>) => Object.entries(v).reduce((o, [k, x]) => o.replaceAll(`{${k}}`, String(x)), t);

const DOT: Record<string, string> = {
  pending: "bg-[#B0B0B0]",
  running: "bg-[#E31C5F] animate-pulse",
  processed: "bg-[#008A05]",
  skipped: "bg-[#DDDDDD]",
  blocked: "bg-[#C13515]",
};

const ARROW =
  "flex size-9 items-center justify-center rounded-full border border-[#DDDDDD] bg-white text-[#222222] transition hover:border-[#222222] hover:shadow-sm disabled:opacity-30 dark:border-border dark:bg-background dark:text-foreground";

/**
 * The sprint's prompt, as plain text on a muted panel: copy at the top corner, prev / next at the
 * bottom corner. The Mac runner works through the prompts by itself (scripts/crm/hermes/sprint-runner.sh),
 * so the card follows it — it shows the prompt running now, refreshes every minute, and moves on as
 * prompts finish — until you flip by hand. A copied prompt carries its own `pnpm sprint:done` line.
 */
export function PromptCard({ prompts, start, labels }: { prompts: SprintPromptView[]; start: number; labels: PromptCardLabels }) {
  const router = useRouter();
  // Following the runner (null) or held on the prompt the reader picked: the index is derived, so
  // fresh data never fights the reader's choice.
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pinnedAt = pinnedId ? prompts.findIndex((x) => x.id === pinnedId) : -1;
  const i = pinnedAt >= 0 ? pinnedAt : Math.min(start, Math.max(prompts.length - 1, 0));

  // Fresh data every minute while the tab is visible: the runner's progress shows without a reload.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  // `#prompt-<id>` (a click in the sprint list) opens that prompt here.
  useEffect(() => {
    const jump = () => {
      const m = /^#prompt-(.+)$/.exec(window.location.hash);
      if (!m) return;
      setPinnedId(m[1]!);
      document.getElementById("top-task")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, []);

  const p = prompts[i];
  if (!p) return null;

  const go = (d: number) => {
    setCopied(false);
    setPinnedId(prompts[(i + d + prompts.length) % prompts.length]!.id);
  };
  const copy = async () => {
    const doneCmd = `pnpm sprint:done ${p.id}${p.taskId ? " --task-done" : ""} --result="…"`;
    try {
      await navigator.clipboard.writeText(`${p.text}\n\n${fill(labels.doneLine, { cmd: doneCmd })}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div id="top-task" className="relative scroll-mt-28 rounded-2xl bg-[#F7F7F7] px-6 pb-20 pe-16 pt-7 md:px-8 md:pb-20 md:pe-20 md:pt-8 dark:bg-muted">
      <button
        type="button"
        onClick={copy}
        aria-label={labels.copyAria}
        title={labels.copyAria}
        className="absolute end-3 top-3 flex size-10 items-center justify-center rounded-full text-[#222222] transition hover:bg-white hover:shadow-sm md:end-4 md:top-4 dark:text-foreground dark:hover:bg-background"
      >
        {copied ? <Check className="size-[18px] text-[#008A05]" /> : <Copy className="size-[18px]" />}
      </button>

      <p dir="auto" className="whitespace-pre-wrap text-[17px] leading-7 text-[#222222] dark:text-foreground">
        {p.text}
      </p>

      <div className="absolute bottom-4 start-6 end-28 flex min-w-0 items-center gap-2 text-sm text-[#6A6A6A] md:bottom-5 md:start-8 dark:text-muted-foreground">
        <span className={cn("size-2 shrink-0 rounded-full", DOT[p.status])} aria-hidden />
        <span className="shrink-0 font-medium text-[#222222] dark:text-foreground">{labels.status[p.status]}</span>
        <span className="truncate">{p.status === "blocked" || p.status === "processed" ? (p.result ?? "") : p.status === "pending" || p.status === "running" ? labels.auto : ""}</span>
      </div>

      <div className="absolute bottom-3 end-3 flex items-center gap-2 md:bottom-4 md:end-4">
        <span className="me-1 text-xs tabular-nums text-[#6A6A6A] dark:text-muted-foreground">
          {i + 1}/{prompts.length}
        </span>
        <button type="button" onClick={() => go(-1)} aria-label={labels.prev} disabled={prompts.length < 2} className={ARROW}>
          <ChevronLeft className="size-4 rtl:-scale-x-100" />
        </button>
        <button type="button" onClick={() => go(1)} aria-label={labels.next} disabled={prompts.length < 2} className={ARROW}>
          <ChevronRight className="size-4 rtl:-scale-x-100" />
        </button>
      </div>
    </div>
  );
}
