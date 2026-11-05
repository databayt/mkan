"use client";

import { Check, ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { SprintPromptView } from "@/lib/monetize/sprint-shape";

export interface PromptCardLabels {
  copyAria: string;
  prev: string;
  next: string;
  doneLine: string;
}

const fill = (t: string, v: Record<string, string | number>) => Object.entries(v).reduce((o, [k, x]) => o.replaceAll(`{${k}}`, String(x)), t);

const ARROW =
  "flex size-9 items-center justify-center rounded-full border border-[#DDDDDD] bg-white text-[#222222] transition hover:border-[#222222] hover:shadow-sm disabled:opacity-30 dark:border-border dark:bg-background dark:text-foreground";

/**
 * The sprint's prompt, as plain text on a muted panel in three rows: copy, the prompt, prev / next.
 * The Mac runner works through the prompts by itself (scripts/crm/hermes/sprint-runner.sh), so the
 * card follows it — it shows the prompt running now, refreshes every minute, and moves on as
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
    <div id="top-task" className="scroll-mt-28 rounded-2xl bg-[#F7F7F7] p-3 md:p-4 dark:bg-muted">
      {/* Row 1: copy. */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={copy}
          aria-label={labels.copyAria}
          title={labels.copyAria}
          className="flex size-10 items-center justify-center rounded-full text-[#222222] transition hover:bg-white hover:shadow-sm dark:text-foreground dark:hover:bg-background"
        >
          {copied ? <Check className="size-[18px] text-[#008A05]" /> : <Copy className="size-[18px]" />}
        </button>
      </div>

      {/* Row 2: the prompt. */}
      <p dir="auto" className="whitespace-pre-wrap px-3 py-2 text-[17px] leading-7 text-[#222222] md:px-4 dark:text-foreground">
        {p.text}
      </p>

      {/* Row 3: prev / next. */}
      <div className="mt-2 flex items-center justify-end gap-2">
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
