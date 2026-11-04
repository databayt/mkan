import Image from "next/image";

import type { Locale } from "@/components/internationalization/config";
import { formatDate, formatPercentage } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { cn } from "@/lib/utils";

import { BlockSection } from "./block-section";
import { fill, type MonetizeLabels } from "./format";
import { Experiments, RevenueForm } from "./forms";
import { FunnelSection } from "./funnel";
import { HealthBadge } from "./health-badge";
import { FeatureCard, H2, INK, LINE, MUTED } from "./listing-ui";
import { MobileBar, MoneyCard, progressOf } from "./money-card";
import { EarnSection, SpendSection } from "./money-section";
import { NextBanner } from "./next-banner";
import { PromptCard } from "./prompt-card";
import { SprintSection } from "./sprint-section";
import { TodoSection } from "./todo-section";

/**
 * /monetize, laid out like a listing (src/app/[lang]/listings/[id]): title row,
 * the next task where the photos would be, a 640px column of sections beside a
 * sticky 372px money card (the Reserve card), the funnel and experiments full
 * width below, and the Reserve bar fixed at the bottom on a phone.
 * Server-rendered; the only client work is two plain admin forms.
 */
// `lang` stays in the props (the page passes it) though the 7 / 30 days links that used it are gone (Abdout, 11-04).
export function MonetizeContent({ data, labels, locale, canEdit = false }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; lang: string; canEdit?: boolean }) {
  const rwf = (v: number) => `${new Intl.NumberFormat(locale).format(Math.round(v))} ${labels.currency}`;
  const broken = data.blocks.filter((b) => b.health === "red").length;
  return (
    <div className="mx-auto w-full max-w-[1184px] px-6 pb-28 pt-6 md:px-8 md:pb-16">
      {/* Title row — like the listing's name: the state on the left, the last update at the end. */}
      <header className="pb-6">
        <h1 className={cn("text-2xl font-semibold leading-tight tracking-tight md:text-[26px]", INK)}>{labels.heading}</h1>
        <div className={cn("mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm", INK)}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <HealthBadge health={data.health} label={labels.health[data.health]} />
            <span className={MUTED}>·</span>
            <span>{fill(labels.gates.brokerSends, { mode: data.gates.brokerSends })}</span>
          </div>
          <span className={MUTED}>{fill(labels.lastUpdate, { date: formatDate(new Date(data.generatedAt), locale, { year: undefined, month: "short", day: "numeric" }) })}</span>
        </div>
      </header>

      {/* The next sprint prompt (copy, prev / next); with no sprint prompts yet, the derived next task. */}
      {data.sprints.prompts.length > 0 ? (
        <PromptCard prompts={data.sprints.prompts} start={data.sprints.startIndex} labels={labels.prompt} />
      ) : (
        <NextBanner data={data} labels={labels} locale={locale} />
      )}

      <div className="mt-10 flex flex-col justify-between gap-12 lg:flex-row">
        <div className="w-full min-w-0 lg:max-w-[640px]">
          {/* "Hosted by" row. */}
          <section className={cn("flex items-center gap-4 border-b pb-6", LINE)}>
            {/* The rental agent's own robot mark — the chat bubble's launcher (agent/bubble/bubble.tsx). */}
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-background p-1.5 ring-1 ring-[#DDDDDD] dark:ring-border">
              <Image src="/illustrations/robot-fill.png" alt="" width={40} height={40} className="size-full object-contain dark:invert" />
            </span>
            <div className="min-w-0">
              <p className={cn("text-base font-medium leading-5", INK)}>{labels.statusRow.title}</p>
              <p className={cn("text-sm leading-[18px]", MUTED)}>{fill(labels.statusRow.line, { blocks: data.blocks.length, broken, tasks: data.nextSteps.length })}</p>
            </div>
          </section>

          {/* The three feature cards. */}
          <section className={cn("border-b py-8", LINE)}>
            <p className={cn("mb-6 text-base leading-6", INK)}>{labels.description}</p>
            <div className="grid grid-cols-3 gap-3">
              <FeatureCard label={labels.featureCards.revenue} value={rwf(data.money.revenueRwf)} />
              <FeatureCard label={labels.featureCards.net} value={rwf(data.money.netRwf)} tone={data.money.netRwf < 0 ? "neg" : "pos"} />
              <FeatureCard label={labels.featureCards.breakEven} value={formatPercentage(progressOf(data), locale)} sub={rwf(data.money.breakEvenRwf)} />
            </div>
          </section>

          <SprintSection sprints={data.sprints} labels={labels} locale={locale} canEdit={canEdit} />
          <TodoSection steps={data.nextSteps} labels={labels} locale={locale} />
          <SpendSection data={data} labels={labels} locale={locale} />
          <EarnSection data={data} labels={labels} locale={locale} />
          {data.blocks.map((b, i) => (
            <BlockSection key={b.key} block={b} index={i + 1} labels={labels} locale={locale} days={data.days} cost={data.costByBlock[b.key]} />
          ))}
        </div>

        {/* The Reserve column: sticky beside the sections; a phone gets the bottom bar instead. */}
        <aside className="hidden w-full shrink-0 md:block lg:w-[372px]">
          <div className="sticky top-28">
            <MoneyCard data={data} labels={labels} locale={locale} canEdit={canEdit} />
          </div>
        </aside>
      </div>

      <FunnelSection stages={data.stages} labels={labels} locale={locale} bottleneck={data.bottleneck} />

      {/* Public read; the write forms are admin-only (their server actions re-check the role). */}
      <section id="experiments" className="scroll-mt-28 py-12">
        <H2>{labels.experiments.title}</H2>
        <p className={cn("mb-6 mt-2 text-base leading-6", MUTED)}>{labels.experiments.rule}</p>
        <div className={canEdit ? "grid grid-cols-1 gap-6 lg:grid-cols-2" : "grid grid-cols-1 gap-6"}>
          <Experiments items={data.experiments} labels={labels} locale={locale} editable={canEdit} />
          {canEdit && <RevenueForm labels={labels} />}
        </div>
      </section>

      <MobileBar data={data} labels={labels} locale={locale} />
    </div>
  );
}
