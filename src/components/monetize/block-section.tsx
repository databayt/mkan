import { CircleCheck, CircleDashed, CircleX } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { formatDateTime, formatPercentage } from "@/lib/i18n/formatters";
import { change } from "@/lib/monetize/health";
import { successFor, type SuccessView } from "@/lib/monetize/success";
import type { BlockView } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { HealthBadge } from "./health-badge";
import { H2, INK, LINE, MUTED } from "./listing-ui";
import { Sparkline } from "./sparkline";

const JOB_TONE: Record<string, string> = {
  ok: "bg-[#EBFBF0] text-[#008A05]",
  warn: "bg-[#FFF8E6] text-[#8A5A00]",
  fail: "bg-[#FFF0F0] text-[#C13515]",
  stale: "bg-[#FFF0F0] text-[#C13515]",
  missing: "bg-[#F7F7F7] text-[#6A6A6A]",
};

const SUCCESS_ICON = { met: CircleCheck, missed: CircleX, unknown: CircleDashed } as const;
const SUCCESS_TONE = { met: "text-[#008A05]", missed: "text-[#C13515]", unknown: "text-[#6A6A6A] dark:text-muted-foreground" } as const;

/** The block's success metrics: each target, the number now, met or not — icon and word, never colour alone. */
function SuccessMetrics({ rows, labels, locale }: { rows: SuccessView[]; labels: MonetizeLabels; locale: Locale }) {
  const S = labels.success;
  const kpiLabel = labels.kpis as Record<string, string>;
  const met = rows.filter((r) => r.status === "met").length;
  const per = (r: SuccessView) => (r.per === "week" ? ` ${S.perWeek}` : r.per === "sweep" ? ` ${S.perSweep}` : "");
  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h3 className={cn("text-lg font-semibold leading-6 tracking-normal", INK)}>{S.title}</h3>
        <span className={cn("rounded-full bg-[#F7F7F7] px-2.5 py-0.5 text-xs font-semibold dark:bg-muted", INK)}>{fill(S.summary, { met, total: rows.length })}</span>
      </div>
      <ul className="mt-4 space-y-4">
        {rows.map((r) => {
          const Icon = SUCCESS_ICON[r.status];
          return (
            <li key={r.kpi} className="flex items-start gap-4">
              <Icon className={cn("mt-0.5 size-6 shrink-0", SUCCESS_TONE[r.status])} strokeWidth={1.5} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-4">
                  <p className={cn("text-base font-medium leading-5", INK)}>{kpiLabel[r.kpi] ?? r.kpi}</p>
                  <p className={cn("shrink-0 text-base font-semibold tabular-nums", INK)}>{formatValue(r.value, r.unit, locale, labels.currency)}</p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EBEBEB] dark:bg-muted">
                  <div className={cn("h-full rounded-full", r.status === "met" ? "bg-[#008A05]" : "bg-[#E31C5F]")} style={{ width: `${r.status === "unknown" ? 0 : Math.max(2, r.progress * 100)}%` }} />
                </div>
                <p className={cn("mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs", MUTED)}>
                  <span>
                    {fill(S.target, { op: r.op === ">=" ? S.atLeast : S.atMost, v: formatValue(r.target, r.unit, locale, labels.currency) })}
                    {per(r)}
                  </span>
                  <span className={cn("font-semibold", SUCCESS_TONE[r.status])}>{S[r.status]}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** One block as a listing section: title + health, how it works, the main number, its success metrics, every KPI, cost, jobs. */
export function BlockSection({
  block,
  index,
  labels,
  locale,
  days,
  cost,
}: {
  block: BlockView;
  index: number;
  labels: MonetizeLabels;
  locale: Locale;
  days: number;
  cost: { soFarRwf: number; monthlyRwf: number };
}) {
  const copy = labels.blocks[block.key];
  const kpiLabel = labels.kpis as Record<string, string>;
  const lever = block.kpis.find((k) => k.lever);
  const rest = block.kpis.filter((k) => !k.lever);
  const delta = lever ? change(lever.value, lever.prev) : null;
  const rwf = (v: number) => formatValue(v, "rwf", locale, labels.currency);
  const reason = (labels.reasons as Record<string, string>)[block.reason] ?? block.reason;

  return (
    <section id={block.key} className={cn("scroll-mt-28 border-b py-8", LINE)}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("text-sm font-semibold tabular-nums", MUTED)}>{index} / 4</span>
        <H2>{copy.title}</H2>
        <HealthBadge health={block.health} label={labels.health[block.health]} />
      </div>
      <p className={cn("mt-2 text-base leading-6", MUTED)}>{copy.desc}</p>
      <p className={cn("mt-3 text-sm font-medium leading-5", block.health === "red" ? "text-[#C13515]" : block.health === "yellow" ? "text-[#8A5A00]" : INK)}>{reason}</p>

      {/* The main number and the cost: the listing's three-card row, two wide here. */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
        {lever && (
          <div className={cn("flex flex-col justify-between gap-4 rounded-xl border p-4", LINE)}>
            <p className={cn("text-sm font-semibold leading-tight", INK)}>
              {labels.lever} · {kpiLabel[lever.key] ?? lever.key}
            </p>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className={cn("text-[32px] font-semibold leading-9 tabular-nums", INK)}>{formatValue(lever.value, lever.unit, locale, labels.currency)}</p>
                <p className={cn("mt-1 text-[13px]", delta == null ? MUTED : delta >= 0 ? "text-[#008A05]" : "text-[#C13515]")}>
                  {delta == null ? labels.noBaseline : fill(labels.vsPrev, { pct: formatPercentage(delta, locale), days })}
                </p>
              </div>
              <Sparkline values={block.trend} label={kpiLabel[lever.key] ?? lever.key} />
            </div>
          </div>
        )}
        <div className={cn("flex flex-col justify-between gap-4 rounded-xl border p-4", LINE)}>
          <p className={cn("text-sm font-semibold leading-tight", INK)}>{labels.blockCost}</p>
          {cost.soFarRwf > 0 || cost.monthlyRwf > 0 ? (
            <div>
              <p className={cn("text-[22px] font-semibold leading-7 tabular-nums", INK)}>{rwf(cost.soFarRwf)}</p>
              <p className={cn("mt-1 text-[13px]", MUTED)}>{fill(labels.spend.perMonth, { v: rwf(cost.monthlyRwf) })}</p>
            </div>
          ) : (
            <p className={cn("text-sm", MUTED)}>{labels.blockCostNone}</p>
          )}
        </div>
      </div>

      <SuccessMetrics rows={successFor(block, days)} labels={labels} locale={locale} />

      <h3 className={cn("mt-8 text-lg font-semibold leading-6 tracking-normal", INK)}>{labels.howItWorks}</h3>
      <ol className="my-0 ms-0 mt-4 list-none space-y-4 [&>li]:mt-0">
        {copy.steps.map((step, i) => (
          <li key={i} className="flex items-start gap-4">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums", LINE, INK)}>{i + 1}</span>
            <span className={cn("text-base leading-6", INK)}>{step}</span>
          </li>
        ))}
      </ol>

      {rest.length > 0 && (
        <>
          <h3 className={cn("mt-8 text-lg font-semibold leading-6 tracking-normal", INK)}>{labels.kpisTitle}</h3>
          <dl className="mt-4 grid grid-cols-1 gap-x-12 gap-y-4 sm:grid-cols-2">
            {rest.map((k) => {
              const d = change(k.value, k.prev);
              return (
                <div key={k.key} className={cn("flex items-baseline justify-between gap-4 border-b pb-3", LINE)}>
                  <dt className={cn("text-base leading-5", INK)}>{kpiLabel[k.key] ?? k.key}</dt>
                  <dd className="shrink-0 text-end">
                    <span className={cn("text-base font-semibold tabular-nums", INK)}>{formatValue(k.value, k.unit, locale, labels.currency)}</span>
                    {d != null && <span className={cn("ms-2 text-xs tabular-nums", d >= 0 ? "text-[#008A05]" : "text-[#C13515]")}>{d >= 0 ? "▲" : "▼"} {formatPercentage(Math.abs(d), locale)}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}

      {block.jobs.length > 0 && (
        <>
          <h3 className={cn("mt-8 text-lg font-semibold leading-6 tracking-normal", INK)}>{labels.jobsTitle}</h3>
          <p className={cn("mt-1 text-sm", MUTED)}>{block.snapshotAt ? fill(labels.lastPush, { time: formatDateTime(new Date(block.snapshotAt), locale) }) : labels.noSnapshot}</p>
          <ul className="mt-4 space-y-4">
            {block.jobs.map((j) => (
              <li key={j.job} className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className={cn("truncate font-mono text-sm", INK)} dir="ltr">
                    {j.job.replace(/^hermes_/, "")}
                  </p>
                  <p className={cn("text-xs leading-4", MUTED)}>
                    {j.at ? fill(labels.jobAt, { time: formatDateTime(new Date(j.at), locale) }) : ""}
                    {j.summary ? `${j.at ? " · " : ""}${j.summary}` : ""}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold", JOB_TONE[j.status])}>{(labels.jobStatus as Record<string, string>)[j.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
