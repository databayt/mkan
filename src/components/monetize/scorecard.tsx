import { ChevronRight } from "lucide-react";
import { Fragment } from "react";

import type { Locale } from "@/components/internationalization/config";
import { formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import { ARROW_PART, type PartView, type ScorecardView, type TileView, type Word } from "@/lib/monetize/scorecard";
import type { ReachView } from "@/lib/monetize/score-samples";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { ReachRow } from "./reach-row";
import { INK, LINE, MUTED } from "./listing-ui";

/**
 * The numbers that make money (Abdout, 2026-11-07): four percentages — how we are doing, are brokers
 * happy, are tenants satisfied, is the chatbot effective — each naming its weakest part, then the
 * road from a post to Mkan's share with the weakest arrow in red and what it means and how we fix it.
 * Tiles open to their parts; a part with too little sample says so and is not counted.
 */
const WORD_COLOR: Record<Word, string> = {
  strong: "text-[#008A05]",
  ok: "text-[#C68A00]",
  weak: "text-[#C13515]",
  thin: "text-[#6A6A6A] dark:text-muted-foreground",
};
const BAR_COLOR: Record<Word, string> = { strong: "bg-[#008A05]", ok: "bg-[#C68A00]", weak: "bg-[#C13515]", thin: "bg-[#B0B0B0]" };

type L = MonetizeLabels["score"];

function partValue(p: Pick<PartView, "unit" | "value">, v: number | null, L: L, locale: Locale): string {
  if (v == null || !Number.isFinite(v)) return formatValue(null, "count", locale);
  switch (p.unit) {
    case "pct":
      return formatPercentage(v, locale);
    case "ms":
      return formatValue(v, "ms", locale);
    case "perDay":
      return fill(L.units.perDay, { v: formatNumber(Math.round(v * 10) / 10, locale) });
    case "perPost":
      return fill(L.units.perPost, { v: formatNumber(Math.round(v), locale) });
    case "min":
      return fill(L.units.min, { v: formatNumber(Math.round(v), locale) });
    case "score":
      return fill(L.units.score, { v: formatNumber(Math.round(v * 10) / 10, locale) });
    default:
      return formatNumber(Math.round(v * 10) / 10, locale);
  }
}

function partWord(p: PartView): Word {
  if (p.progress == null) return "thin";
  return p.progress >= 1 ? "strong" : p.progress >= 0.5 ? "ok" : "weak";
}

function Tile({ tile, L, locale }: { tile: TileView; L: L; locale: Locale }) {
  const weak = tile.parts.find((p) => p.key === tile.weakest) ?? null;
  const parts = L.parts as Record<string, { t: string; means: string; fix: string }>;
  return (
    <details className={cn("group rounded-xl border bg-white p-4 dark:bg-background", LINE)}>
      <summary className="flex cursor-pointer list-none flex-col gap-1 [&::-webkit-details-marker]:hidden">
        <span className={cn("text-sm font-semibold", INK)}>{L.tiles[tile.key]}</span>
        <span className="flex items-baseline gap-2">
          <span className={cn("text-[32px] font-semibold leading-none tracking-tight tabular-nums", tile.score == null ? MUTED : INK)}>
            {tile.score == null ? formatValue(null, "count", locale) : formatPercentage(tile.score / 100, locale)}
          </span>
          <span className={cn("text-sm font-semibold", WORD_COLOR[tile.word])}>{L.words[tile.word]}</span>
        </span>
        <span className={cn("text-xs leading-5", MUTED)}>
          {weak
            ? fill(L.weakest, { part: parts[weak.key]?.t ?? weak.key, value: partValue(weak, weak.value, L, locale), target: partValue(weak, weak.target, L, locale) })
            : tile.score == null
              ? L.noData
              : L.allMet}
        </span>
      </summary>
      <ul className={cn("mt-3 flex flex-col gap-3 border-t pt-3", LINE)}>
        {tile.parts.map((p) => {
          const word = partWord(p);
          return (
            <li key={p.key} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between gap-2 text-sm">
                <span className={INK}>{parts[p.key]?.t ?? p.key}</span>
                <span className={cn("shrink-0 font-semibold tabular-nums", WORD_COLOR[word])}>{p.progress == null ? L.noData : partValue(p, p.value, L, locale)}</span>
              </span>
              <span className="h-1 w-full overflow-hidden rounded-full bg-[#EBEBEB] dark:bg-muted" aria-hidden>
                <span className={cn("block h-full rounded-full", BAR_COLOR[word])} style={{ width: `${Math.round((p.progress ?? 0) * 100)}%` }} />
              </span>
              <span className={cn("text-xs tabular-nums", MUTED)}>
                {fill(L.target, { v: partValue(p, p.target, L, locale) })} · {fill(L.counted, { n: formatNumber(p.n, locale) })} ·{" "}
                {p.days > 0 ? fill(L.days, { n: formatNumber(p.days, locale) }) : L.allTime}
                {p.aside ? ` · ${L.aside}` : null}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function FunnelLine({ score, L, locale }: { score: ScorecardView; L: L; locale: Locale }) {
  const parts = L.parts as Record<string, { t: string; means: string; fix: string }>;
  const judged = new Map(score.tiles.flatMap((t) => t.parts).map((p) => [p.key, p]));
  const weakStep = score.funnel.weakest;
  const weakPart = weakStep && weakStep !== "posts" ? judged.get(ARROW_PART[weakStep]) : null;
  return (
    <div className="mt-6">
      <h3 className={cn("text-sm font-semibold", INK)}>{L.funnelTitle}</h3>
      <ol className="mx-0 mb-0 mt-3 flex list-none flex-col md:flex-row md:items-stretch [&>li]:mt-0">
        {score.funnel.steps.map((s, i) => {
          const arrowPart = s.key !== "posts" ? judged.get(ARROW_PART[s.key]) : null;
          const red = s.key === weakStep;
          return (
            <Fragment key={s.key}>
              {i > 0 && (
                <li aria-hidden className="flex shrink-0 items-center justify-center gap-1 py-1 md:w-16 md:flex-col md:py-0">
                  <ChevronRight className={cn("size-4 rotate-90 md:rotate-0 md:rtl:-scale-x-100", red ? "text-[#C13515]" : "text-[#B0B0B0]")} strokeWidth={2} />
                  <span className={cn("text-[11px] leading-4 tabular-nums", red ? "font-semibold text-[#C13515]" : MUTED)}>
                    {arrowPart && arrowPart.value != null ? partValue(arrowPart, arrowPart.value, L, locale) : formatValue(null, "count", locale)}
                  </span>
                </li>
              )}
              <li className={cn("flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-lg border px-3 py-2 md:flex-col md:items-start md:justify-start", red ? "border-[#C13515]" : LINE)}>
                <span className={cn("text-xs", MUTED)}>{L.steps[s.key]}</span>
                <span className={cn("text-base font-semibold tabular-nums", INK)}>{formatValue(s.count, "count", locale)}</span>
                {s.key === "posts" && score.funnel.followers != null && (
                  <span className={cn("text-xs tabular-nums", MUTED)}>{fill(L.followers, { n: formatNumber(score.funnel.followers, locale) })}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {weakPart && (
        <div className="mt-4 rounded-lg border-s-2 border-[#C13515] bg-[#FFF8F6] px-4 py-3 text-sm dark:bg-muted">
          <p className={cn("font-semibold", INK)}>{parts[weakPart.key]?.t ?? weakPart.key}</p>
          <p className={cn("mt-1", INK)}>
            <span className="font-semibold">{L.means}: </span>
            {parts[weakPart.key]?.means}
          </p>
          <p className={cn("mt-1", INK)}>
            <span className="font-semibold">{L.fix}: </span>
            {parts[weakPart.key]?.fix}
          </p>
        </div>
      )}
    </div>
  );
}

export function Scorecard({
  score,
  reach,
  intro,
  labels,
  locale,
}: {
  score: ScorecardView;
  /** The TikTok page: followers, views, posts (reach-row.tsx). */
  reach?: ReachView | null;
  intro?: { intros: number; paid: number; cap: number; mode: "intro" | "relay" } | null;
  labels: MonetizeLabels;
  locale: Locale;
}) {
  const L = labels.score;
  return (
    <section aria-labelledby="score-title" className="pb-10">
      <h2 id="score-title" className={cn("text-[22px] font-semibold leading-tight", INK)}>
        {L.title}
      </h2>
      <div className="mt-4 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {score.tiles.map((t) => (
          <Tile key={t.key} tile={t} L={L} locale={locale} />
        ))}
      </div>
      {reach && <ReachRow reach={reach} labels={labels} locale={locale} />}
      <FunnelLine score={score} L={L} locale={locale} />
      {intro && (
        <p className={cn("mt-3 text-sm", MUTED)}>
          {fill(intro.mode === "intro" ? L.introMode : L.relayMode, {
            paid: formatNumber(intro.paid, locale),
            cap: formatNumber(intro.cap, locale),
            intros: formatNumber(intro.intros, locale),
          })}
        </p>
      )}
    </section>
  );
}
