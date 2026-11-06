import type { Locale } from "@/components/internationalization/config";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { cn } from "@/lib/utils";

import { FirstShareSection } from "./first-share";
import type { MonetizeLabels } from "./format";
import { Experiments, RevenueForm } from "./forms";
import { H2, INK, LINE, MUTED } from "./listing-ui";
import { EarnSection, SpendSection } from "./money-section";
import { OpenOnHash } from "./open-on-hash";
import { SprintSection } from "./sprint-section";

/**
 * Everything the short page leaves out, one click away and closed by default: the cost lines with what
 * each buys, how Mkan earns, every featured home followed to the money, the experiments, and — for an
 * admin — recording money and the sprint's own controls.
 */
export function Details({ data, labels, locale, canEdit }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; canEdit: boolean }) {
  const D = labels.details;
  return (
    <details id="numbers" className={cn("group scroll-mt-28 border-t py-8", LINE)}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span>
          <H2>{D.title}</H2>
          <span className={cn("mt-1 block text-sm", MUTED)}>{D.lead}</span>
        </span>
        <span className={cn("shrink-0 text-2xl leading-none transition-transform group-open:rotate-45", INK)} aria-hidden>
          +
        </span>
      </summary>
      <OpenOnHash detailsId="numbers" hashes={["#record", "#experiments", "#first-share", "#spend", "#earn", "#sprint"]} />
      <div className="mt-6 grid grid-cols-1 gap-x-16 lg:grid-cols-2">
        <div className="min-w-0">
          <SpendSection data={data} labels={labels} locale={locale} />
          <EarnSection data={data} labels={labels} locale={locale} />
        </div>
        <div className="min-w-0">
          <FirstShareSection data={data.firstShare} labels={labels} locale={locale} />
          <section id="experiments" className="scroll-mt-28 py-8">
            <H2>{labels.experiments.title}</H2>
            <p className={cn("mb-6 mt-2 text-base leading-6", MUTED)}>{labels.experiments.rule}</p>
            <div className="grid grid-cols-1 gap-6">
              <Experiments items={data.experiments} labels={labels} locale={locale} editable={canEdit} />
              {canEdit && <RevenueForm labels={labels} />}
            </div>
          </section>
        </div>
      </div>
      {canEdit && <SprintSection sprints={data.sprints} lessons={data.lessons} labels={labels} locale={locale} canEdit />}
    </details>
  );
}
