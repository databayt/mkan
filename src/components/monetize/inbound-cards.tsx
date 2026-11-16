import type { Locale } from "@/components/internationalization/config";
import { formatDate, formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import { INBOUND_TARGET_PER_DAY, type ChannelInbound, type InboundOverview } from "@/lib/monetize/inbound-pure";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";
import { InboundPeople } from "./inbound-people";
import { INK, LINE, MUTED } from "./listing-ui";

/**
 * The people who reach us, web alone and WhatsApp alone (Abdout, 2026-11-16: "show it clearly on /monetize
 * as two cards, one for web, one for WhatsApp"). A total row first (this week against the target of 1 a day,
 * and the bottleneck ladder), then one card per channel: the week with its change on last week, today against
 * its daily share, fourteen days, what came before the chat (visitors, taps — counted only since the signals
 * began, and said so), the sources, and the weakest step in red like the Scorecard's weakest part.
 * The people behind the number are the admin's (inbound-people.tsx).
 */
type L = MonetizeLabels["inbound"];
const ACCENT = "#E31C5F";
const SLOTS = 14;
/** The target is for both channels together; today is judged against each channel's half of the day. */
const DAILY_SHARE = INBOUND_TARGET_PER_DAY / 2;

const dayLabel = (day: string, locale: Locale) => formatDate(new Date(`${day}T12:00:00Z`), locale, { year: undefined, month: "short", day: "numeric" });
const compact = (n: number, locale: Locale) => formatNumber(n, locale, n >= 10_000 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 });

/** Fourteen day slots, today at the right edge and in the accent; a quiet day is a point on the floor, not a gap. */
function Spark({ series, label, locale }: { series: { day: string; n: number }[]; label: string; locale: Locale }) {
  const W = 240;
  const H = 32;
  const hi = Math.max(1, ...series.map((p) => p.n));
  const slot = (W - 8) / (SLOTS - 1);
  const x = (i: number) => W - 4 - (series.length - 1 - i) * slot;
  const y = (v: number) => H - 4 - (v / hi) * (H - 8);
  const d = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(" ");
  const last = series.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-8 w-full" role="img" aria-label={label}>
      <path d={d} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-[#B0B0B0] dark:stroke-muted-foreground" />
      {series.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.n)} r={i === last ? 4 : 6} fill={i === last ? ACCENT : "transparent"}>
          <title>{`${dayLabel(p.day, locale)}: ${formatNumber(p.n, locale)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

function Delta({ now, before, L, locale }: { now: number; before: number; L: L; locale: Locale }) {
  const diff = now - before;
  if (diff === 0) return <span className={MUTED}>{L.same}</span>;
  return <span className={diff > 0 ? "font-semibold text-[#008A05]" : "font-semibold text-[#C13515]"}>{fill(diff > 0 ? L.up : L.down, { n: formatNumber(Math.abs(diff), locale) })}</span>;
}

function Card({ ch, data, L, locale }: { ch: ChannelInbound; data: InboundOverview; L: L; locale: Locale }) {
  const web = ch.channel === "web";
  const n = (v: number) => formatNumber(v, locale);
  const up = ch.upstream.week;
  // Before the signals began (SiteSignal is new on 2026-11-16) a zero is not "nobody came": say since when we count.
  const partial = data.signalsSince == null || data.signalsSince > data.weekFrom;
  const since = data.signalsSince ?? data.day;
  // Nothing counted yet, and the count is young: "counting since", never a made-up 0%.
  const silent = partial && up.reach === 0 && up.intent === 0;
  const upLine = web ? fill(L.upWeb, { reach: n(up.reach), intent: n(up.intent), people: n(ch.week) }) : fill(L.upWa, { reach: n(up.reach), people: n(ch.week) });
  const weak = ch.weakest ? (L.weak[ch.channel] as Record<string, { t: string; means: string }>)[ch.weakest] : null;
  const met = ch.today >= DAILY_SHARE;
  const list = ch.series.map((p) => `${dayLabel(p.day, locale)} ${n(p.n)}`).join(", ");
  return (
    <section aria-label={web ? L.web : L.wa} className={cn("rounded-xl border bg-white p-4 dark:bg-background", LINE)}>
      <p className={cn("text-sm font-semibold", INK)}>{web ? L.web : L.wa}</p>
      <p className={cn("text-xs", MUTED)}>{web ? L.webHint : L.waHint}</p>
      <p className={cn("mt-2 flex items-baseline gap-2", INK)}>
        <span className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">{n(ch.week)}</span>
        <span className="text-sm">{L.thisWeek}</span>
      </p>
      <p className="mt-1 text-xs tabular-nums">
        <Delta now={ch.week} before={ch.lastWeek} L={L} locale={locale} />
      </p>
      <p className={cn("mt-1 text-xs tabular-nums", INK)}>
        {fill(L.today, { n: n(ch.today) })} · <span className={met ? "font-semibold text-[#008A05]" : MUTED}>{met ? L.todayStatus.met : fill(L.todayStatus.behind, { share: formatNumber(DAILY_SHARE, locale) })}</span>
      </p>
      <Spark series={ch.series} label={fill(L.trend, { list })} locale={locale} />

      <div className={cn("mt-3 border-t pt-3 text-xs leading-5", LINE)}>
        {silent ? (
          <p className={MUTED}>{fill(L.since, { date: dayLabel(since, locale) })}</p>
        ) : (
          <>
            <p className={cn("font-medium tabular-nums", INK)}>{upLine}</p>
            {partial && <p className={MUTED}>{fill(L.since, { date: dayLabel(since, locale) })}</p>}
          </>
        )}
        {!web && up.tiktokViews != null && <p className={cn("tabular-nums", MUTED)}>{fill(L.tiktokViews, { n: compact(up.tiktokViews, locale) })}</p>}
        {web && <p className={cn("font-medium tabular-nums", INK)}>{fill(L.movedToWa, { n: n(ch.movedToWa) })}</p>}
      </div>

      <p className={cn("mt-2 text-xs", MUTED)}>
        <span className="font-semibold">{L.sources}: </span>
        {ch.sources.length ? ch.sources.slice(0, 3).map((s) => `${s.source} ${n(s.n)}`).join(" · ") : L.noSources}
      </p>

      {weak && (
        <div className="mt-3 rounded-lg border-s-2 border-[#C13515] bg-[#FFF8F6] px-3 py-2 text-xs dark:bg-muted">
          <p className={cn("font-semibold", INK)}>
            <span className="text-[#C13515]">{L.weakTag}: </span>
            {weak.t}
          </p>
          <p className={cn("mt-0.5", INK)}>{weak.means}</p>
        </div>
      )}
    </section>
  );
}

export function InboundCards({ inbound, labels, locale, canEdit = false }: { inbound: InboundOverview; labels: MonetizeLabels; locale: Locale; canEdit?: boolean }) {
  const L = labels.inbound;
  const stage = L.stage as Record<string, string>;
  const b = inbound.bottleneck;
  const { total } = inbound;
  const on = total.week >= total.target;
  return (
    <section aria-labelledby="inbound-title" className="pb-10">
      <h2 id="inbound-title" className={cn("text-[22px] font-semibold leading-tight", INK)}>
        {L.title}
      </h2>
      <p className={cn("mt-2 text-base font-semibold tabular-nums", on ? "text-[#008A05]" : INK)}>{fill(L.total, { n: formatNumber(total.week, locale), target: formatNumber(total.target, locale) })}</p>
      <p className={cn("mt-1 text-sm", MUTED)}>
        {fill(L.bottleneck, { now: stage[b.now] ?? b.now })}
        {b.next ? ` · ${b.nextRate != null ? fill(L.nextRate, { next: stage[b.next] ?? b.next, rate: formatPercentage(b.nextRate, locale) }) : fill(L.next, { next: stage[b.next] ?? b.next })}` : ""}
      </p>
      <div className="mt-4 grid grid-cols-1 items-start gap-3 md:grid-cols-2">
        <Card ch={inbound.web} data={inbound} L={L} locale={locale} />
        <Card ch={inbound.wa} data={inbound} L={L} locale={locale} />
      </div>
      {canEdit && <InboundPeople people={inbound.people} L={L} stage={stage} locale={locale} />}
    </section>
  );
}
