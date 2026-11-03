import type { Locale } from "@/components/internationalization/config";
import { formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import type { CostKind, CostLine } from "@/lib/monetize/cost-lines";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { REVENUE_LINES } from "@/lib/monetize/money";
import { BLOCKS } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { Chip, Row, Section, Stat, Surface } from "./ui";

type Props = { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale };

const useRwf = (labels: MonetizeLabels, locale: Locale) => (v: number | null) => formatValue(v, "rwf", locale, labels.currency);

/** Money this month: the four numbers that matter, and how far revenue is from covering the bills. */
export function MoneySection({ data, labels, locale }: Props) {
  const L = labels.money;
  const S = labels.spend;
  const m = data.money;
  const rwf = useRwf(labels, locale);
  const progress = m.breakEvenRwf > 0 ? Math.min(1, m.revenueRwf / m.breakEvenRwf) : 0;
  return (
    <Section id="money" title={L.title} desc={labels.drive}>
      <Surface className="p-0 sm:p-0">
        {/* gap-px over a border-coloured grid: hairlines between the four tiles at every width. */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-t-2xl bg-border lg:grid-cols-4">
          <div className="bg-card p-5 sm:p-6">
            <Stat big label={L.revenue} value={rwf(m.revenueRwf)} />
          </div>
          <div className="bg-card p-5 sm:p-6">
            <Stat big label={L.cost} value={rwf(m.costRwf)} sub={`${L.fixed} ${rwf(m.fixedCostRwf)} · ${L.variable} ${rwf(m.variableCostRwf)}`} />
          </div>
          <div className="bg-card p-5 sm:p-6">
            <Stat big label={L.net} value={rwf(m.netRwf)} tone={m.netRwf >= 0 ? "pos" : "neg"} />
          </div>
          <div className="bg-card p-5 sm:p-6">
            <Stat big label={L.roi} value={m.roi == null ? L.none : `${formatNumber(Math.round(m.roi * 100) / 100, locale)}×`} />
          </div>
        </dl>
        <div className="space-y-2 border-t p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{fill(S.breakEvenProgress, { pct: formatPercentage(progress, locale) })}</span>
            <span className="text-muted-foreground tabular-nums">
              {rwf(m.revenueRwf)} / {rwf(m.breakEvenRwf)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(progress * 100, progress > 0 ? 2 : 0)}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-4 pt-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label={L.costPerChat} value={rwf(m.costPerChatRwf)} />
            <Stat label={L.costPerLead} value={rwf(m.costPerLeadRwf)} />
            <Stat label={L.costPerDeal} value={rwf(m.costPerDealRwf)} />
            <Stat label={L.breakEven} value={rwf(m.breakEvenRwf)} />
            <Stat label={L.projected} value={rwf(m.projectedNetRwf)} tone={m.projectedNetRwf >= 0 ? "pos" : "neg"} />
          </div>
        </div>
        {m.unrecordedRwf > 0 && (
          <p className="border-t bg-amber-500/10 px-5 py-3 text-sm sm:px-6">
            {L.unrecorded}: <span className="font-semibold tabular-nums">{rwf(m.unrecordedRwf)}</span>
          </p>
        )}
      </Surface>
    </Section>
  );
}

function LineDetail({ line, labels, locale }: { line: CostLine; labels: MonetizeLabels; locale: Locale }) {
  const S = labels.spend;
  const n = (v: number) => formatNumber(v, locale);
  const bits: string[] = [];
  if (line.calls) bits.push(fill(S.calls, { n: n(line.calls) }));
  if (line.tokensIn || line.tokensOut) bits.push(fill(S.tokens, { in: n(line.tokensIn ?? 0), out: n(line.tokensOut ?? 0) }));
  if (line.usd != null && line.usd > 0) bits.push(fill(S.usd, { v: formatNumber(line.usd, locale, { maximumFractionDigits: 4 }) }));
  return bits.length ? <p className="mt-1 text-xs text-muted-foreground tabular-nums">{bits.join(" · ")}</p> : null;
}

/** Where the money goes: every line, grouped fixed / metered / free, then per block, then the break-even sum. */
export function SpendSection({ data, labels, locale }: Props) {
  const S = labels.spend;
  const rwf = useRwf(labels, locale);
  const copy = S.lines as Record<string, { name: string; what: string }>;
  const kinds: CostKind[] = ["fixed", "metered", "free"];
  const fixedMonth = data.costLines.filter((l) => l.kind === "fixed").reduce((s, l) => s + l.monthlyRwf, 0);
  const meteredMonth = data.costLines.filter((l) => l.kind === "metered").reduce((s, l) => s + l.monthlyRwf, 0);
  const soFar = data.costLines.reduce((s, l) => s + l.soFarRwf, 0);
  return (
    <Section id="spend" title={S.title} desc={S.desc} aside={<Chip>{fill(S.elapsed, { pct: formatPercentage(data.monthElapsed, locale) })}</Chip>}>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {kinds.map((kind) => {
            const lines = data.costLines.filter((l) => l.kind === kind);
            if (!lines.length) return null;
            return (
              <Surface key={kind} className="p-0 sm:p-0">
                <div className="border-b px-5 py-4 sm:px-6">
                  <h3 className="text-base leading-snug tracking-normal font-semibold">{S.kinds[kind]}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{fill(S.kindHelp[kind], { rate: formatNumber(data.usdToRwf, locale) })}</p>
                </div>
                <ul className="divide-y">
                  {lines.map((l) => {
                    const c = copy[l.key] ?? { name: l.key, what: copy.other?.what ?? "" };
                    return (
                      <li key={l.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
                        <div className="min-w-0 space-y-1.5">
                          <p className="text-foreground font-medium">{c.name}</p>
                          <p className="text-sm leading-relaxed text-muted-foreground">{c.what}</p>
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-xs text-muted-foreground">{S.serves}</span>
                            {l.blocks.map((b) => (
                              <Chip key={b}>{labels.blocks[b].title}</Chip>
                            ))}
                          </div>
                          <LineDetail line={l} labels={labels} locale={locale} />
                        </div>
                        <div className={cn("shrink-0 sm:text-end", kind === "free" && "text-muted-foreground")}>
                          <p className="text-foreground font-semibold tabular-nums">{rwf(l.soFarRwf)}</p>
                          {kind !== "free" && <p className="text-xs text-muted-foreground tabular-nums">{fill(S.perMonth, { v: rwf(l.monthlyRwf) })}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Surface>
            );
          })}
        </div>

        <div className="space-y-6 lg:sticky lg:top-28 lg:self-start">
          <Surface className="shadow-[0_6px_16px_rgba(0,0,0,0.08)]">
            <h3 className="text-base leading-snug tracking-normal mb-2 font-semibold">{S.breakEvenTitle}</h3>
            <Row label={S.breakEvenFixed} value={rwf(fixedMonth)} />
            <Row label={S.breakEvenMetered} value={rwf(meteredMonth)} />
            <Row strong label={S.breakEvenTotal} value={rwf(data.money.breakEvenRwf)} />
            <div className="mt-4 border-t pt-4">
              <Row label={S.total} value={rwf(soFar)} hint={fill(S.totalMonth, { v: rwf(fixedMonth + meteredMonth) })} />
            </div>
            {data.fixedEstimated && <p className="mt-3 text-xs text-muted-foreground">{labels.money.estimated}</p>}
          </Surface>
          <Surface>
            <h3 className="text-base leading-snug tracking-normal font-semibold">{S.byBlockTitle}</h3>
            <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{S.byBlockHint}</p>
            {BLOCKS.map((b) => (
              <Row key={b} label={labels.blocks[b].title} value={rwf(data.costByBlock[b].soFarRwf)} hint={fill(S.perMonth, { v: rwf(data.costByBlock[b].monthlyRwf) })} />
            ))}
          </Surface>
        </div>
      </div>
    </Section>
  );
}

/** How Mkan earns: the four revenue lines, what each is, and what came in. */
export function EarnSection({ data, labels, locale }: Props) {
  const E = labels.earn;
  const rwf = useRwf(labels, locale);
  return (
    <Section id="earn" title={E.title} desc={E.desc}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {REVENUE_LINES.map((l) => (
          <Surface key={l} className="flex flex-col gap-3">
            <p className="text-foreground text-[22px] font-semibold tabular-nums tracking-tight">{rwf(data.money.byLine[l])}</p>
            <div>
              <p className="text-foreground font-medium">{labels.lines[l]}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{E.what[l]}</p>
            </div>
          </Surface>
        ))}
      </div>
    </Section>
  );
}
