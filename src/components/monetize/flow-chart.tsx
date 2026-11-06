import { ArrowDown, ArrowRight, RotateCcw } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { FLOWS, type FlowNode, type FlowNum } from "@/lib/monetize/flows";
import type { BlockKey } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { INK, MUTED } from "./listing-ui";

type Text = { t: string; when?: string; n?: string };

/** A decision's outline: a lozenge with pointed ends — two stacked clip-paths draw the 1.5px border. */
const LOZENGE = "polygon(16px 0, calc(100% - 16px) 0, 100% 50%, calc(100% - 16px) 100%, 16px 100%, 0 50%)";
const LOZENGE_IN = "polygon(15px 1.5px, calc(100% - 15px) 1.5px, calc(100% - 1.5px) 50%, calc(100% - 15px) calc(100% - 1.5px), 15px calc(100% - 1.5px), 1.5px 50%)";

function Num({ num, text, values, locale, className }: { num?: FlowNum; text?: string; values: Record<string, number | null>; locale: Locale; className?: string }) {
  if (!num || !text) return null;
  const v = values[num.key];
  return <span className={cn("block text-xs tabular-nums", className)}>{fill(text, { v: formatValue(v, num.unit, locale) })}</span>;
}

function Box({ node, text, values, locale }: { node: FlowNode; text: Text; values: Record<string, number | null>; locale: Locale }) {
  const body = (
    <>
      {text.when && <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide opacity-70 tabular-nums">{text.when}</span>}
      <span className="block">{text.t}</span>
      <Num num={node.num} text={text.n} values={values} locale={locale} className="mt-1 font-semibold opacity-80" />
    </>
  );
  if (node.kind === "start")
    return <div className="w-full rounded-2xl bg-[#222222] px-4 py-3 text-center text-sm font-medium leading-5 text-white dark:bg-foreground dark:text-background">{body}</div>;
  if (node.kind === "end")
    return <div className={cn("w-full rounded-2xl border-2 border-[#222222] px-4 py-3 text-center text-sm font-semibold leading-5 dark:border-foreground", INK)}>{body}</div>;
  if (node.kind === "decision")
    return (
      <div className="w-full bg-[#B0B0B0] dark:bg-border" style={{ clipPath: LOZENGE }}>
        <div className={cn("bg-[#F7F7F7] px-7 py-3 text-center text-sm font-medium leading-5 dark:bg-muted", INK)} style={{ clipPath: LOZENGE_IN }}>
          {body}
        </div>
      </div>
    );
  return <div className={cn("w-full rounded-xl border border-[#DDDDDD] bg-white px-4 py-3 text-center text-sm leading-5 dark:border-border dark:bg-background", INK)}>{body}</div>;
}

const EXIT_TONE = {
  loss: "border-[#C13515]/40 bg-[#FFF0F0] text-[#C13515] dark:bg-destructive/10",
  wait: "border-[#B0B0B0] text-[#6A6A6A] dark:border-border dark:text-muted-foreground",
  loop: "border-[#B0B0B0] text-[#222222] dark:border-border dark:text-foreground",
} as const;

/**
 * One block as a flowchart: a spine of steps top to bottom — start, steps, decisions (lozenges), end —
 * and each decision's other way out beside it (a loss in red, a wait, or a loop ↺). A CSS grid of two
 * columns, so Arabic mirrors it by itself; an ordered list underneath for screen readers.
 */
export function FlowChart({ block, labels, locale, values }: { block: BlockKey; labels: MonetizeLabels; locale: Locale; values: Record<string, number | null> }) {
  const F = labels.flows;
  const texts = F[block] as Record<string, Text>;
  const nodes = FLOWS[block];
  return (
    <ol className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-x-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]" aria-label={labels.blocks[block].title}>
      {nodes.map((node, i) => {
        const text = texts[node.id] ?? { t: node.id };
        const exit = node.exit;
        const exitText = exit ? (texts[exit.id] ?? { t: exit.id }) : null;
        const main = node.main ?? "yes";
        const other = main === "yes" ? F.no : F.yes;
        return (
          <li key={node.id} className="contents">
            <div className="col-start-1 flex items-center">
              <Box node={node} text={text} values={values} locale={locale} />
            </div>
            <div className="col-start-2 flex items-center">
              {exit && exitText && (
                <>
                  <span className="relative flex w-10 shrink-0 items-center sm:w-14" aria-hidden>
                    <span className="h-px flex-1 bg-[#B0B0B0] dark:bg-border" />
                    <ArrowRight className="-ms-1 size-3.5 text-[#B0B0B0] rtl:-scale-x-100 dark:text-border" strokeWidth={2} />
                    <span className={cn("absolute -top-4 start-1 text-[11px] font-semibold", MUTED)}>{other}</span>
                  </span>
                  <span className="sr-only">{main === "yes" ? F.ifNot : F.ifSo}: </span>
                  <div className={cn("min-w-0 flex-1 rounded-lg border border-dashed px-3 py-2 text-xs leading-4", EXIT_TONE[exit.tone])}>
                    <span className="flex items-start gap-1.5">
                      {exit.tone === "loop" && <RotateCcw className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden />}
                      <span>{exitText.t}</span>
                    </span>
                    <Num num={exit.num} text={exitText.n} values={values} locale={locale} className="mt-1 font-semibold" />
                  </div>
                </>
              )}
            </div>
            {i < nodes.length - 1 && (
              <>
                <div className="col-start-1 flex h-8 flex-col items-center justify-center" aria-hidden>
                  <span className="relative flex flex-col items-center">
                    <span className="h-4 w-px bg-[#B0B0B0] dark:bg-border" />
                    <ArrowDown className="-mt-1 size-3.5 text-[#B0B0B0] dark:text-border" strokeWidth={2} />
                    {node.kind === "decision" && <span className={cn("absolute start-3 top-0.5 text-[11px] font-semibold", MUTED)}>{main === "yes" ? F.yes : F.no}</span>}
                  </span>
                </div>
                <div className="col-start-2" aria-hidden />
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
