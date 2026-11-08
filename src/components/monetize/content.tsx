import type { Locale } from "@/components/internationalization/config";
import { formatDate } from "@/lib/i18n/formatters";
import type { DealRow } from "@/lib/monetize/deal-pipeline";
import type { LiveView } from "@/lib/monetize/live-shape";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { cn } from "@/lib/utils";

import { BlocksSection } from "./blocks-section";
import { Details } from "./details";
import { fill, type MonetizeLabels } from "./format";
import { HealthBadge } from "./health-badge";
import { INK, MUTED } from "./listing-ui";
import { LiveCard } from "./live-card";
import { MobileBar, MoneyCard } from "./money-card";
import type { HeldIntro } from "@/lib/monetize/deals";
import { DealsSection } from "./deals-section";
import { SetupSection } from "./setup-section";
import { Road } from "./road";
import { Scorecard } from "./scorecard";

/**
 * /monetize, short (Abdout, 2026-11-07: "simple and clean. And short"): the title row; the four
 * percentages that say how money is going (scorecard.tsx); the loop, live;
 * the road to money beside the money card (the listing's sticky Reserve card); the four blocks as
 * flowcharts; every other number in one closed "All the numbers". From 19 screens to about four.
 */
export function MonetizeContent({
  data,
  live,
  labels,
  locale,
  canEdit = false,
  deals = null,
  heldIntros = [],
  payoutSet = false,
  momoMode = null,
}: {
  data: MonetizeOverview;
  live: LiveView;
  labels: MonetizeLabels;
  locale: Locale;
  lang: string;
  canEdit?: boolean;
  /** Admin only: the deals and their money taps (deals.ts). */
  deals?: DealRow[] | null;
  /** Admin only: intros the line holds (deals.ts loadHeldIntros). */
  heldIntros?: HeldIntro[];
  payoutSet?: boolean;
  momoMode?: "sandbox" | "production" | null;
}) {
  const blocks = Object.fromEntries(data.blocks.map((b) => [b.key, labels.blocks[b.key].title]));
  return (
    <div className="mx-auto w-full max-w-[1184px] px-6 pb-28 pt-6 md:px-8 md:pb-16">
      <header className="pb-6">
        <h1 className={cn("text-2xl font-semibold leading-tight tracking-tight md:text-[26px]", INK)}>{labels.heading}</h1>
        <div className={cn("mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm", INK)}>
          <HealthBadge health={data.health} label={labels.health[data.health]} />
          <span className={MUTED}>·</span>
          <span>{fill(labels.gates.brokerSends, { mode: (labels.gates as { modes?: Record<string, string> }).modes?.[data.gates.brokerSends] ?? data.gates.brokerSends })}</span>
          <span className={MUTED}>·</span>
          <span className={MUTED}>{fill(labels.lastUpdate, { date: formatDate(new Date(data.generatedAt), locale, { year: undefined, month: "short", day: "numeric" }) })}</span>
        </div>
      </header>

      {data.score && <Scorecard score={data.score} reach={data.reach} intro={data.intro} labels={labels} locale={locale} />}
      {canEdit && deals && <DealsSection deals={deals} labels={labels} locale={locale} payoutSet={payoutSet} held={heldIntros} momoMode={momoMode} />}
      {canEdit && <SetupSection state={data.setup ?? {}} labels={labels} locale={locale} />}

      <LiveCard initial={live} labels={labels.live} blocks={blocks} canEdit={canEdit} locale={locale} />

      <div className="mt-12 flex flex-col justify-between gap-12 pb-12 lg:flex-row">
        <div className="w-full min-w-0 lg:max-w-[640px]">
          <Road data={data} labels={labels} locale={locale} />
        </div>
        <aside className="hidden w-full shrink-0 md:block lg:w-[372px]">
          <div className="sticky top-28">
            <MoneyCard data={data} labels={labels} locale={locale} canEdit={canEdit} />
          </div>
        </aside>
      </div>

      <BlocksSection data={data} labels={labels} locale={locale} />
      <Details data={data} labels={labels} locale={locale} canEdit={canEdit} />
      <MobileBar data={data} labels={labels} locale={locale} />
    </div>
  );
}
