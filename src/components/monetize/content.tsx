import Link from "next/link";

import type { Locale } from "@/components/internationalization/config";
import { formatDateTime } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { cn } from "@/lib/utils";

import { BlockCard } from "./block-card";
import { fill, type MonetizeLabels } from "./format";
import { Experiments, RevenueForm } from "./forms";
import { BottleneckBanner, FunnelStrip } from "./funnel";
import { HealthBadge } from "./health-badge";
import { MoneyStrip } from "./money-strip";

/**
 * /monetize — the chatbot business, block by block. Server-rendered from one
 * loader pass (src/lib/monetize/load.ts); the only client work is the browser
 * submitting two plain forms to server actions.
 */
export function MonetizeContent({ data, labels, locale, lang, canEdit = false }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; lang: string; canEdit?: boolean }) {
  const ranges = [
    { days: 7, label: labels.range7 },
    { days: 30, label: labels.range30 },
  ];
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{labels.title}</h1>
            <HealthBadge health={data.health} label={`${labels.overall}: ${labels.health[data.health]}`} />
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{labels.description}</p>
          <p className="text-xs text-muted-foreground">
            {fill(labels.updated, { time: formatDateTime(new Date(data.generatedAt), locale) })} ·{" "}
            {fill(labels.gates.brokerSends, { mode: data.gates.brokerSends })}
            {data.gates.capped && ` · ${labels.gates.capped}`} · {fill(labels.adChats, { n: data.adChats })}
          </p>
        </div>
        <nav className="flex shrink-0 gap-1 rounded-md border p-1">
          {ranges.map((r) => (
            <Link
              key={r.days}
              href={`/${lang}/monetize?days=${r.days}`}
              className={cn("rounded px-3 py-1 text-sm", data.days === r.days ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              aria-current={data.days === r.days ? "page" : undefined}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      <MoneyStrip money={data.money} labels={labels} locale={locale} fixedEstimated={data.fixedEstimated} />
      <BottleneckBanner b={data.bottleneck} labels={labels} locale={locale} />
      <FunnelStrip stages={data.stages} labels={labels} locale={locale} bottleneck={data.bottleneck} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.blocks.map((b) => (
          <BlockCard key={b.key} block={b} labels={labels} locale={locale} days={data.days} />
        ))}
      </section>

      {/* Public read; the two write forms are admin-only (their server actions re-check the role). */}
      <section className={canEdit ? "grid grid-cols-1 gap-4 lg:grid-cols-2" : "grid grid-cols-1 gap-4"}>
        <Experiments items={data.experiments} labels={labels} locale={locale} editable={canEdit} />
        {canEdit && <RevenueForm labels={labels} />}
      </section>
    </div>
  );
}
