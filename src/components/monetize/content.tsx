import Link from "next/link";

import type { Locale } from "@/components/internationalization/config";
import { formatDateTime } from "@/lib/i18n/formatters";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { NAVBAR_HEIGHT } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { BlockSection } from "./block-section";
import { fill, type MonetizeLabels } from "./format";
import { Experiments, RevenueForm } from "./forms";
import { FunnelSection } from "./funnel";
import { HealthBadge } from "./health-badge";
import { EarnSection, MoneySection, SpendSection } from "./money-section";
import { TodoSection } from "./todo-section";
import { Section } from "./ui";

/**
 * /monetize — the chatbot business, top to bottom: what to do next, the money,
 * where it goes, how it comes in, the funnel, then each block in its own
 * section. Server-rendered from one loader pass (src/lib/monetize/load.ts); the
 * only client work is the browser submitting two plain forms (admins only).
 */
export function MonetizeContent({ data, labels, locale, lang, canEdit = false }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; lang: string; canEdit?: boolean }) {
  const ranges = [
    { days: 7, label: labels.range7 },
    { days: 30, label: labels.range30 },
  ];
  const nav = [
    { id: "todo", label: labels.nav.todo },
    { id: "money", label: labels.nav.money },
    { id: "spend", label: labels.nav.spend },
    { id: "earn", label: labels.nav.earn },
    { id: "funnel", label: labels.nav.funnel },
    ...data.blocks.map((b) => ({ id: b.key, label: labels.blocks[b.key].title, health: b.health })),
    { id: "experiments", label: labels.nav.experiments },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-10">
      <header className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-semibold leading-tight tracking-tight">{labels.title}</h1>
            <HealthBadge health={data.health} label={`${labels.overall}: ${labels.health[data.health]}`} />
          </div>
          <p className="text-base leading-relaxed text-muted-foreground">{labels.description}</p>
          <p className="text-xs text-muted-foreground">
            {fill(labels.updated, { time: formatDateTime(new Date(data.generatedAt), locale) })} · {fill(labels.gates.brokerSends, { mode: data.gates.brokerSends })}
            {data.gates.capped && ` · ${labels.gates.capped}`} · {fill(labels.adChats, { n: data.adChats })}
          </p>
        </div>
        <nav className="flex shrink-0 gap-1 self-start rounded-full border p-1 sm:self-auto" aria-label={labels.range7 + " / " + labels.range30}>
          {ranges.map((r) => (
            <Link
              key={r.days}
              href={`/${lang}/monetize?days=${r.days}`}
              className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", data.days === r.days ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              aria-current={data.days === r.days ? "page" : undefined}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </header>

      {/* Section pills, like Airbnb's listing tabs: jump links, scrolled sideways on a phone. */}
      <nav style={{ top: NAVBAR_HEIGHT }} className="sticky z-10 -mx-4 mb-6 overflow-x-auto border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:px-0" aria-label={labels.title}>
        <ul className="flex min-w-max gap-2">
          {nav.map((n) => (
            <li key={n.id}>
              <a href={`#${n.id}`} className="inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-foreground">
                {"health" in n && n.health && (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      n.health === "green" ? "bg-emerald-500" : n.health === "yellow" ? "bg-amber-500" : n.health === "red" ? "bg-destructive" : "bg-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                )}
                {n.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <TodoSection steps={data.nextSteps} labels={labels} locale={locale} />
      <MoneySection data={data} labels={labels} locale={locale} />
      <SpendSection data={data} labels={labels} locale={locale} />
      <EarnSection data={data} labels={labels} locale={locale} />
      <FunnelSection stages={data.stages} labels={labels} locale={locale} bottleneck={data.bottleneck} />

      {data.blocks.map((b, i) => (
        <BlockSection key={b.key} block={b} index={i + 1} labels={labels} locale={locale} days={data.days} cost={data.costByBlock[b.key]} />
      ))}

      {/* Public read; the two write forms are admin-only (their server actions re-check the role). */}
      <Section id="experiments" title={labels.experiments.title} desc={labels.experiments.rule}>
        <div className={canEdit ? "grid grid-cols-1 gap-6 lg:grid-cols-2" : "grid grid-cols-1 gap-6"}>
          <Experiments items={data.experiments} labels={labels} locale={locale} editable={canEdit} />
          {canEdit && <RevenueForm labels={labels} />}
        </div>
      </Section>
    </div>
  );
}
