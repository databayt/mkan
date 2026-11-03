import type { Locale } from "@/components/internationalization/config";
import { formatDateTime, formatPercentage } from "@/lib/i18n/formatters";
import { change } from "@/lib/monetize/health";
import type { BlockView } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { HealthBadge } from "./health-badge";
import { Sparkline } from "./sparkline";
import { Section, Surface } from "./ui";

const JOB_TONE: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  fail: "bg-destructive/10 text-destructive",
  stale: "bg-destructive/10 text-destructive",
  missing: "bg-muted text-muted-foreground",
};

/** One block, its own section: what it does, its main number, every KPI, its cost and its jobs. */
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
    <Section
      id={block.key}
      title={
        <span className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background tabular-nums" aria-hidden>
            {index}
          </span>
          {copy.title}
          <HealthBadge health={block.health} label={labels.health[block.health]} />
        </span>
      }
      desc={copy.desc}
    >
      <p
        className={cn(
          "mb-6 rounded-xl px-4 py-3 text-sm",
          block.health === "red" ? "bg-destructive/10 text-destructive" : block.health === "yellow" ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-muted/60 text-muted-foreground",
        )}
      >
        {reason}
      </p>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-4">
          {lever && (
            <Surface className="shadow-[0_6px_16px_rgba(0,0,0,0.08)]">
              <p className="text-sm text-muted-foreground">
                {labels.lever} · {kpiLabel[lever.key] ?? lever.key}
              </p>
              <p className="text-foreground mt-2 text-[40px] font-semibold leading-none tracking-tight tabular-nums">{formatValue(lever.value, lever.unit, locale, labels.currency)}</p>
              <div className="mt-4 flex items-end justify-between gap-2">
                <p className={cn("text-sm", delta == null ? "text-muted-foreground" : delta >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
                  {delta == null ? labels.noBaseline : fill(labels.vsPrev, { pct: formatPercentage(delta, locale), days })}
                </p>
                <Sparkline values={block.trend} label={kpiLabel[lever.key] ?? lever.key} />
              </div>
            </Surface>
          )}
          <Surface>
            <p className="text-sm text-muted-foreground">{labels.blockCost}</p>
            {cost.soFarRwf > 0 || cost.monthlyRwf > 0 ? (
              <>
                <p className="text-foreground mt-1 text-[22px] font-semibold tabular-nums tracking-tight">{rwf(cost.soFarRwf)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fill(labels.blockCostLine, { soFar: rwf(cost.soFarRwf), monthly: rwf(cost.monthlyRwf) })}</p>
              </>
            ) : (
              <p className="mt-1 text-sm">{labels.blockCostNone}</p>
            )}
          </Surface>
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <h3 className="text-base leading-snug tracking-normal mb-3 font-semibold">{labels.howItWorks}</h3>
            <ol className="my-0 ms-0 list-none [&>li]:mt-0 grid gap-3 sm:grid-cols-2">
              {copy.steps.map((step, i) => (
                <li key={i} className="flex gap-3 rounded-xl border p-4 text-sm leading-relaxed">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {rest.length > 0 && (
            <div>
              <h3 className="text-base leading-snug tracking-normal mb-3 font-semibold">{labels.kpisTitle}</h3>
              {/* Hairline grid: each cell draws its bottom/end edge; the -m-px wrapper tucks the outer ones under the frame, so a short last row leaves blank card, not grey. */}
              <div className="overflow-hidden rounded-xl border">
              <dl className="-mb-px -me-px grid grid-cols-2 sm:grid-cols-3">
                {rest.map((k) => {
                  const d = change(k.value, k.prev);
                  return (
                    <div key={k.key} className="flex min-w-0 flex-col border-b border-e p-4">
                      <dt className="order-2 mt-0.5 text-sm text-muted-foreground">{kpiLabel[k.key] ?? k.key}</dt>
                      <dd className="order-1 text-lg font-semibold tabular-nums">{formatValue(k.value, k.unit, locale, labels.currency)}</dd>
                      {d != null && (
                        <dd className={cn("order-3 mt-1 text-xs tabular-nums", d >= 0 ? "text-emerald-600 dark:text-emerald-500" : "text-destructive")}>
                          {d >= 0 ? "▲" : "▼"} {formatPercentage(Math.abs(d), locale)}
                        </dd>
                      )}
                    </div>
                  );
                })}
              </dl>
              </div>
            </div>
          )}

          {block.jobs.length > 0 && (
          <div>
            <h3 className="text-base leading-snug tracking-normal mb-1 font-semibold">{labels.jobsTitle}</h3>
            <p className="mb-3 text-xs text-muted-foreground">
              {block.snapshotAt ? fill(labels.lastPush, { time: formatDateTime(new Date(block.snapshotAt), locale) }) : labels.noSnapshot}
            </p>
            <ul className="divide-y rounded-xl border">
                {block.jobs.map((j) => (
                  <li key={j.job} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm" dir="ltr">
                        {j.job.replace(/^hermes_/, "")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {j.at ? fill(labels.jobAt, { time: formatDateTime(new Date(j.at), locale) }) : ""}
                        {j.summary ? `${j.at ? " · " : ""}${j.summary}` : ""}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", JOB_TONE[j.status])}>{(labels.jobStatus as Record<string, string>)[j.status]}</span>
                  </li>
                ))}
            </ul>
          </div>
          )}
        </div>
      </div>
    </Section>
  );
}
