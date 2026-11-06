"use client";

import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface BlockTab {
  key: string;
  index: number;
  title: string;
  /** The block's key number, already formatted ("259 new homes"). */
  number: string;
  health: "green" | "yellow" | "red" | "unknown";
  /** The hand-off to the next block ("27% reach Enhance"), when there is a next block. */
  handoff?: { text: string; weakest: boolean; weakestLabel: string } | null;
  panel: ReactNode;
}

const DOT = { green: "bg-[#008A05]", yellow: "bg-[#C68A00]", red: "bg-[#C13515]", unknown: "bg-[#B0B0B0]" } as const;

/** The four blocks as a chain of tabs — each tab carries its key number, each arrow the hand-off rate. */
export function BlocksTabs({ tabs, initial, dir }: { tabs: BlockTab[]; initial: string; dir: "ltr" | "rtl" }) {
  // Radix stamps dir="ltr" on its root unless told: Arabic must mirror the chain and the charts.
  return (
    <Tabs defaultValue={initial} dir={dir} className="gap-6">
      <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0 md:flex md:items-stretch md:gap-0">
        {tabs.map((t) => (
          <Fragment key={t.key}>
            <TabsTrigger
              value={t.key}
              className="h-auto min-w-0 flex-1 flex-col items-start gap-1 whitespace-normal rounded-xl border border-[#DDDDDD] bg-white px-4 py-3 text-start shadow-none data-[state=active]:border-[#222222] data-[state=active]:shadow-[0_0_0_1px_#222222] dark:border-border dark:bg-background dark:data-[state=active]:border-foreground"
            >
              <span className="flex w-full items-center gap-2 text-xs font-semibold text-[#6A6A6A] tabular-nums dark:text-muted-foreground">
                <span className={cn("size-2 shrink-0 rounded-full", DOT[t.health])} aria-hidden />
                {t.index}
              </span>
              <span className="text-base font-semibold leading-5 text-[#222222] dark:text-foreground">{t.title}</span>
              <span className="text-sm leading-5 text-[#222222] tabular-nums dark:text-foreground">{t.number}</span>
            </TabsTrigger>
            {t.handoff && (
              <span className="hidden w-24 shrink-0 flex-col items-center justify-center px-1 text-center md:flex" aria-hidden>
                <ChevronRight className={cn("size-4 rtl:-scale-x-100", t.handoff.weakest ? "text-[#C13515]" : "text-[#B0B0B0]")} strokeWidth={2} />
                <span className={cn("text-[11px] leading-4 tabular-nums", t.handoff.weakest ? "font-semibold text-[#C13515]" : "text-[#6A6A6A] dark:text-muted-foreground")}>{t.handoff.text}</span>
                {t.handoff.weakest && <span className="text-[10px] font-semibold uppercase tracking-wide text-[#C13515]">{t.handoff.weakestLabel}</span>}
              </span>
            )}
          </Fragment>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.key} value={t.key}>
          {t.panel}
        </TabsContent>
      ))}
    </Tabs>
  );
}
