import { ArrowRight, Banknote, CircleCheck, ListChecks, TrendingUp, Unplug, Wrench } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import type { NextStep } from "@/lib/monetize/next-steps";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { Highlight, INK, MUTED, Pill, RichText, Section } from "./listing-ui";

export const PRIORITY_ICON = { 1: Banknote, 2: Unplug, 3: TrendingUp, 4: ListChecks } as const;
export const PRIORITY_TONE: Record<number, string> = {
  1: "bg-[#FFF0F3] text-[#E31C5F]",
  2: "bg-[#FFF4ED] text-[#C13515]",
  3: "bg-[#FFF8E6] text-[#8A5A00]",
  4: "bg-[#F7F7F7] text-[#6A6A6A]",
};

/** A task's words, its numbers and stage names filled in. Shared by the banner and the list. */
export function stepCopy(s: NextStep, labels: MonetizeLabels, locale: Locale) {
  const L = labels.todo;
  const t = (L.items as Record<string, { title: string; why: string; how: string; done: string }>)[s.key];
  if (!t) return null;
  const stage = labels.stages as Record<string, string>;
  const v: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(s.vars)) {
    if (["amount", "need", "have"].includes(k) && typeof x === "number") v[k] = formatValue(x, "rwf", locale);
    else if ((k === "from" || k === "to") && typeof x === "string") v[k] = stage[x] ?? x;
    else v[k] = x;
  }
  v.block = s.block ? labels.blocks[s.block].title : "";
  return {
    title: fill(t.title, v),
    why: fill(t.why, v),
    how: fill(t.how, v),
    done: fill(t.done, v),
    priority: (L.priority as Record<string, string>)[String(s.priority)],
    block: s.block ? labels.blocks[s.block].title : null,
  };
}

/** Every open task, as a listing's highlights: icon, bold title, why, then do-this / done-when. */
export function TodoSection({ steps, labels, locale }: { steps: NextStep[]; labels: MonetizeLabels; locale: Locale }) {
  const L = labels.todo;
  return (
    <Section id="todo" title={L.title} aside={steps.length > 0 && <Pill>{fill(L.count, { n: steps.length })}</Pill>}>
      <p className={cn("-mt-3 mb-6 text-sm leading-5", MUTED)}>{L.desc}</p>
      {steps.length === 0 ? (
        <Highlight icon={CircleCheck} title={L.empty} />
      ) : (
        <div className="space-y-6">
          {steps.map((s, i) => {
            const c = stepCopy(s, labels, locale);
            if (!c) return null;
            return (
              <Highlight
                key={`${s.key}-${i}`}
                icon={s.key.startsWith("job") ? Wrench : PRIORITY_ICON[s.priority]}
                title={
                  <span className="flex flex-wrap items-center gap-2">
                    {c.title}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", PRIORITY_TONE[s.priority])}>{c.priority}</span>
                  </span>
                }
                sub={c.why}
              >
                <div className="mt-3 space-y-2 text-sm leading-5">
                  <p className={cn("flex gap-2", INK)}>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
                    <span>
                      <span className="font-semibold">{L.how}: </span>
                      <RichText t={c.how} />
                    </span>
                  </p>
                  <p className={cn("flex gap-2", MUTED)}>
                    <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      <span className="font-semibold">{L.done}: </span>
                      {c.done}
                    </span>
                  </p>
                </div>
              </Highlight>
            );
          })}
        </div>
      )}
    </Section>
  );
}
