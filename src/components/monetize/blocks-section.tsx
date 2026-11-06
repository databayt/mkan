import { CircleCheck, CircleDashed, CircleX } from "lucide-react";

import { isRTL, type Locale } from "@/components/internationalization/config";
import { formatDateTime, formatPercentage } from "@/lib/i18n/formatters";
import { firstBlock, flowNumbers, handoffs } from "@/lib/monetize/flows";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { successFor } from "@/lib/monetize/success";
import type { BlockView } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { BlocksTabs, type BlockTab } from "./blocks-tabs";
import { FlowChart } from "./flow-chart";
import { fill, formatValue, type MonetizeLabels } from "./format";
import { HealthBadge } from "./health-badge";
import { H2, INK, LINE, MUTED } from "./listing-ui";

const ICON = { met: CircleCheck, missed: CircleX, unknown: CircleDashed } as const;
const TONE = { met: "text-[#008A05]", missed: "text-[#C13515]", unknown: "text-[#6A6A6A] dark:text-muted-foreground" } as const;

function Panel({ block, data, labels, locale, values }: { block: BlockView; data: MonetizeOverview; labels: MonetizeLabels; locale: Locale; values: Record<string, number | null> }) {
  const F = labels.flows;
  const S = labels.success;
  const kpi = labels.kpis as Record<string, string>;
  const rows = successFor(block, data.days);
  const met = rows.filter((r) => r.status === "met").length;
  const bad = block.jobs.filter((j) => j.status !== "ok");
  const lastAt = block.jobs.map((j) => j.at).filter((x): x is string => !!x).sort().at(-1);
  const cost = data.costByBlock[block.key];
  const rwf = (v: number) => formatValue(v, "rwf", locale);
  const reason = (labels.reasons as Record<string, string>)[block.reason] ?? block.reason;
  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h3 className={cn("text-xl font-semibold leading-6 tracking-normal", INK)}>{labels.blocks[block.key].title}</h3>
          <HealthBadge health={block.health} label={labels.health[block.health]} />
        </div>
        <p className={cn("mb-6 text-sm leading-5", MUTED)}>{labels.blocks[block.key].desc}</p>
        <FlowChart block={block.key} labels={labels} locale={locale} values={values} />
      </div>
      <div className="min-w-0 space-y-6">
        <p className={cn("text-sm font-medium leading-5", block.health === "red" ? "text-[#C13515]" : block.health === "yellow" ? "text-[#8A5A00]" : INK)}>{reason}</p>
        <div>
          <p className={cn("mb-3 text-sm font-semibold", INK)}>{fill(F.targets, { met, total: rows.length })}</p>
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const Icon = ICON[r.status];
              return (
                <li key={r.kpi} className="flex items-start gap-3 text-sm leading-5">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[r.status])} strokeWidth={1.75} aria-hidden />
                  <span className={cn("min-w-0 flex-1", INK)}>{kpi[r.kpi] ?? r.kpi}</span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", INK)}>{formatValue(r.value, r.unit, locale)}</span>
                  <span className={cn("w-20 shrink-0 text-end text-xs tabular-nums", MUTED)}>
                    {r.op === ">=" ? S.atLeast : S.atMost} {formatValue(r.target, r.unit, locale)}
                  </span>
                  <span className="sr-only">{S[r.status]}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className={cn("space-y-1 border-t pt-4 text-sm leading-5", LINE)}>
          <p className={INK}>
            {labels.blockCost}: <span className="font-semibold tabular-nums">{cost && cost.soFarRwf + cost.monthlyRwf > 0 ? rwf(cost.soFarRwf) : labels.money.none}</span>
            {cost && cost.monthlyRwf > 0 && <span className={MUTED}> · {fill(labels.spend.perMonth, { v: rwf(cost.monthlyRwf) })}</span>}
          </p>
          <p className={MUTED}>
            {block.jobs.length ? fill(F.jobs, { ok: block.jobs.length - bad.length, n: block.jobs.length }) : F.jobsNone}
            {lastAt && ` · ${fill(F.lastRun, { time: formatDateTime(new Date(lastAt), locale) })}`}
          </p>
          {bad.length > 0 && (
            <p className="text-[#C13515]">
              {fill(F.jobsBad, { names: bad.map((j) => `${j.job.replace(/^hermes_/, "")} (${(labels.jobStatus as Record<string, string>)[j.status]})`).join(", ") })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** "How it works": the four blocks as a chain of tabs, each opening on its flowchart. */
export function BlocksSection({ data, labels, locale }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale }) {
  const F = labels.flows;
  const kpi = labels.kpis as Record<string, string>;
  const values = flowNumbers(data);
  const hand = handoffs(data);
  const tabs: BlockTab[] = data.blocks.map((b, i) => {
    const lever = b.kpis.find((k) => k.lever);
    const h = hand.find((x) => x.from === b.key);
    const next = h ? data.blocks.find((x) => x.key === h.to) : undefined;
    return {
      key: b.key,
      index: i + 1,
      title: labels.blocks[b.key].title,
      number: lever ? `${formatValue(lever.value, lever.unit, locale)} · ${kpi[lever.key] ?? lever.key}` : labels.money.none,
      health: b.health,
      handoff:
        h && next
          ? { text: fill(F.reach, { rate: h.rate == null ? labels.money.none : formatPercentage(h.rate, locale), to: labels.blocks[next.key].title }), weakest: h.weakest, weakestLabel: F.weakest }
          : null,
      panel: <Panel block={b} data={data} labels={labels} locale={locale} values={values} />,
    };
  });
  return (
    <section id="blocks" className={cn("scroll-mt-28 border-t py-12", LINE)}>
      <H2>{F.title}</H2>
      <p className={cn("mb-8 mt-2 max-w-[720px] text-base leading-6", MUTED)}>{F.lead}</p>
      <BlocksTabs tabs={tabs} initial={firstBlock(data)} dir={isRTL(locale) ? "rtl" : "ltr"} />
    </section>
  );
}
