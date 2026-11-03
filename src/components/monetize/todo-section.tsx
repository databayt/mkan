import { ArrowRight, CircleCheck } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import type { NextStep } from "@/lib/monetize/next-steps";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { Chip, Section } from "./ui";

const PRIORITY_TONE: Record<number, string> = {
  1: "bg-primary text-primary-foreground",
  2: "bg-destructive/10 text-destructive",
  3: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  4: "bg-muted text-muted-foreground",
};

/** Inline `code` in a dictionary string, rendered as code — the "do this" lines carry commands. */
function Text({ t }: { t: string }) {
  return (
    <>
      {t.split(/(`[^`]+`)/g).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} dir="ltr" className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function TodoSection({ steps, labels, locale }: { steps: NextStep[]; labels: MonetizeLabels; locale: Locale }) {
  const L = labels.todo;
  const items = L.items as Record<string, { title: string; why: string; how: string; done: string }>;
  const stage = labels.stages as Record<string, string>;
  const rwf = (v: number) => formatValue(v, "rwf", locale, labels.currency);
  // Money amounts and stage keys arrive raw; the page words them.
  const vars = (s: NextStep) =>
    Object.fromEntries(
      Object.entries(s.vars).map(([k, v]) => {
        if (["amount", "need", "have"].includes(k) && typeof v === "number") return [k, rwf(v)];
        if ((k === "from" || k === "to") && typeof v === "string") return [k, stage[v] ?? v];
        return [k, v];
      }),
    );
  return (
    <Section
      id="todo"
      className="border-t-0 pt-2 sm:pt-2"
      title={L.title}
      desc={L.desc}
      aside={steps.length > 0 && <Chip className="bg-primary/10 text-primary">{fill(L.count, { n: steps.length })}</Chip>}
    >
      {steps.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border p-6 text-[15px]">
          <CircleCheck className="size-5 text-emerald-600" aria-hidden />
          {L.empty}
        </div>
      ) : (
        <ol className="my-0 ms-0 list-none [&>li]:mt-0 divide-y overflow-hidden rounded-2xl border">
          {steps.map((s, i) => {
            const t = items[s.key];
            if (!t) return null;
            const v = { ...vars(s), block: s.block ? labels.blocks[s.block].title : "" };
            return (
              <li key={`${s.key}-${i}`} className="grid gap-3 p-5 sm:grid-cols-[2.5rem_1fr] sm:p-6">
                <span className="flex size-9 items-center justify-center rounded-full border text-sm font-semibold tabular-nums" aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{fill(t.title, v)}</h3>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_TONE[s.priority])}>
                      {(L.priority as Record<string, string>)[String(s.priority)]}
                    </span>
                    {s.block && <Chip>{labels.blocks[s.block].title}</Chip>}
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted-foreground">{fill(t.why, v)}</p>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <p className="flex gap-2 rounded-xl bg-muted/60 p-3">
                      <ArrowRight className="mt-0.5 size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
                      <span>
                        <span className="font-medium">{L.how}: </span>
                        <Text t={fill(t.how, v)} />
                      </span>
                    </p>
                    <p className="flex gap-2 rounded-xl border border-dashed p-3 text-muted-foreground">
                      <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span>
                        <span className="font-medium text-foreground">{L.done}: </span>
                        {fill(t.done, v)}
                      </span>
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
