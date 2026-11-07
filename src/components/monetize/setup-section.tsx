import type { Locale } from "@/components/internationalization/config";
import { Button } from "@/components/ui/button";
import { markSetupStep } from "@/lib/actions/monetize-actions";
import { formatDate } from "@/lib/i18n/formatters";
import { SETUP_DOC, SETUP_STEPS, stepDone, type SetupState } from "@/lib/monetize/setup";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";
import { INK, LINE, MUTED } from "./listing-ui";

/**
 * Mkan's business setup, for an admin only: the seven steps of kun.databayt.org/en/docs/mkan-setup
 * (company → number → WhatsApp → mkan.rw → TikTok Business → Website link → MoMo), each ticked done
 * here. A tick resumes the loop's waiting prompt for that step (setup.ts, sprint-cycle setupPrompts).
 */
export function SetupSection({ state, labels, locale }: { state: SetupState; labels: MonetizeLabels; locale: Locale }) {
  const L = labels.setup;
  const steps = L.steps as Record<string, { t: string; what: string }>;
  const doneCount = SETUP_STEPS.filter((s) => stepDone(state, s.key)).length;
  return (
    <section id="setup" aria-labelledby="setup-title" className="scroll-mt-28 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-title" className={cn("text-[22px] font-semibold leading-tight", INK)}>
          {L.title}
        </h2>
        <a href={SETUP_DOC} className={cn("text-sm underline underline-offset-2", INK)}>
          {L.guide}
        </a>
      </div>
      <p className={cn("mt-1 text-sm", MUTED)}>{fill(L.subtitle, { n: doneCount, total: SETUP_STEPS.length })}</p>
      <ol className="mx-0 mb-0 mt-4 flex list-none flex-col gap-2 [&>li]:mt-0">
        {SETUP_STEPS.map((s, i) => {
          const done = stepDone(state, s.key);
          const waiting = !done && s.after.some((a) => !stepDone(state, a));
          return (
            <li key={s.key} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3", LINE)}>
              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-semibold", done ? "text-[#008A05]" : INK)}>
                  {i + 1} · {steps[s.key]?.t ?? s.title}
                </p>
                <p className={cn("mt-0.5 text-xs", MUTED)}>
                  {done
                    ? fill(L.doneOn, { date: formatDate(new Date(state[s.key]!.at), locale, { year: undefined, month: "short", day: "numeric" }) })
                    : waiting
                      ? fill(L.after, { steps: s.after.map((a) => steps[a]?.t ?? a).join(", ") })
                      : steps[s.key]?.what}
                </p>
              </div>
              <form action={markSetupStep}>
                <input type="hidden" name="key" value={s.key} />
                <input type="hidden" name="done" value={done ? "0" : "1"} />
                <Button type="submit" variant={done ? "ghost" : "outline"} className="h-9 rounded-[10px] px-3 text-sm">
                  {done ? L.undo : L.markDone}
                </Button>
              </form>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
