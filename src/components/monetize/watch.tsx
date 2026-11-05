import { CircleAlert, CircleCheck, CircleDashed } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { successFor } from "@/lib/monetize/success";
import type { BlockKey } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { INK, LINE, MUTED, Section } from "./listing-ui";

/** The numbers to keep an eye on, the broker directory and TikTok page to the home: where it stops is where to work. */
const WATCH: { block: BlockKey; kpi: string }[] = [
  { block: "scrape", kpi: "brokersTotal" },
  { block: "scrape", kpi: "brokersNewWeek" },
  { block: "post", kpi: "followers" },
  { block: "post", kpi: "followersWeek" },
  { block: "post", kpi: "viewsPerPost" },
  { block: "post", kpi: "engageRate" },
  { block: "post", kpi: "postsListing" },
  { block: "chat", kpi: "messages" },
  { block: "chat", kpi: "people" },
  { block: "chat", kpi: "peopleToHomes" },
  { block: "chat", kpi: "brokerAnswerRate" },
  { block: "chat", kpi: "peopleToViewing" },
  { block: "chat", kpi: "peopleToSigned" },
  { block: "chat", kpi: "paidDeals" },
  { block: "chat", kpi: "handoffs" },
  { block: "chat", kpi: "evalReader" },
];

export function WatchSection({ data, labels, locale }: { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale }) {
  const W = labels.watch;
  const S = labels.success;
  const kpiLabel = labels.kpis as Record<string, string>;
  const tiles = WATCH.flatMap(({ block, kpi }) => {
    const b = data.blocks.find((x) => x.key === block);
    const k = b?.kpis.find((x) => x.key === kpi);
    if (!b || !k) return [];
    const target = successFor(b, data.days).find((t) => t.kpi === kpi) ?? null;
    return [{ kpi, value: formatValue(k.value, k.unit, locale), target, status: target?.status ?? null }];
  });
  const missed = tiles.filter((t) => t.status === "missed").length;
  return (
    <Section id="watch" title={W.title}>
      <p className={cn("-mt-3 mb-6 text-base leading-6", MUTED)}>{fill(W.lead, { days: data.days, missed })}</p>
      <ul className="my-0 ms-0 grid list-none grid-cols-2 gap-3 sm:grid-cols-3 [&>li]:mt-0">
        {tiles.map((t) => {
          const Icon = t.status === "met" ? CircleCheck : t.status === "missed" ? CircleAlert : CircleDashed;
          return (
            <li key={t.kpi} className={cn("rounded-xl border p-3", LINE, t.status === "missed" && "border-[#C13515]/40 bg-[#FFF8F6] dark:bg-transparent")}>
              <p className={cn("text-xs leading-4", MUTED)}>{kpiLabel[t.kpi] ?? t.kpi}</p>
              <p className={cn("mt-1 text-xl font-semibold tabular-nums", INK)}>{t.value}</p>
              <p className={cn("mt-1 flex items-center gap-1 text-xs", t.status === "missed" ? "text-[#C13515]" : t.status === "met" ? "text-[#008A05]" : MUTED)}>
                <Icon className="size-3.5 shrink-0" aria-hidden />
                {t.target
                  ? `${t.status === "met" ? S.met : t.status === "missed" ? S.missed : S.unknown} · ${fill(S.target, { op: t.target.op === ">=" ? S.atLeast : S.atMost, v: formatValue(t.target.target, t.target.unit, locale) })}`
                  : W.noTarget}
              </p>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
