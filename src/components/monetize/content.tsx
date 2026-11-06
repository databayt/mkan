import type { Locale } from "@/components/internationalization/config";
import { formatDate } from "@/lib/i18n/formatters";
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
import { Road } from "./road";

/**
 * /monetize, short (Abdout, 2026-11-07: "simple and clean. And short"): the title row; the loop, live;
 * the road to money beside the money card (the listing's sticky Reserve card); the four blocks as
 * flowcharts; every other number in one closed "All the numbers". From 19 screens to about four.
 */
export function MonetizeContent({ data, live, labels, locale, canEdit = false }: { data: MonetizeOverview; live: LiveView; labels: MonetizeLabels; locale: Locale; lang: string; canEdit?: boolean }) {
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
