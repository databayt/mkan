"use client";

import Link from "next/link";
import { BadgeCheck, CircleAlert, Clock, ExternalLink, Star, X } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { Badge } from "@/components/ui/badge";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { districtName } from "@/lib/geo/rwanda-places";
import { formatCurrency } from "@/lib/i18n/formatters";
import { fill } from "./format";
import type { ShortlistItem } from "./types";
import { ViewingPanel } from "./viewing";

export function ShortlistCard({ item, taskId, onChange }: { item: ShortlistItem; taskId: string; onChange: () => void }) {
  const dict = useDictionary();
  const c = dict?.agent?.card;
  const { locale } = useLocale();
  const money = (n: number) => formatCurrency(n, locale, item.currency);
  const { cost } = item;
  const ranged = cost.totalHigh !== cost.total;
  const lineLabel = (key: string, qty?: number) =>
    fill((c?.lines as Record<string, string> | undefined)?.[key] ?? key, { qty: qty ?? "" });
  const district = item.district ? districtName(item.district.toUpperCase(), locale) || item.district : null;
  const external = !!item.lead;
  const linkProps = external ? { target: "_blank", rel: "noreferrer" } : {};

  return (
    <article className="overflow-hidden rounded-xl border bg-background">
      <Link href={item.path} {...linkProps} className="relative block aspect-[4/3] overflow-hidden bg-muted">
        {item.photo && (
          <BlurImage src={item.photo} alt={item.title} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
        )}
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={item.path} {...linkProps} className="line-clamp-2 font-medium hover:underline">
            {item.title}
          </Link>
          {item.rating != null && item.rating > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-sm">
              <Star className="size-3.5 fill-current" aria-hidden />
              {item.rating.toFixed(2)}
            </span>
          )}
        </div>

        {item.lead && (
          <p className="text-xs font-medium text-muted-foreground">
            {item.lead.handle ? fill(c?.lead ?? "Broker lead · @{handle} on TikTok", { handle: item.lead.handle }) : c?.leadNoHandle ?? "Broker lead from TikTok"}
          </p>
        )}

        <p className="text-sm text-muted-foreground">
          {[
            district,
            item.bedrooms != null ? fill(c?.beds ?? "{n} bd", { n: item.bedrooms }) : null,
            item.bathrooms != null ? fill(c?.baths ?? "{n} ba", { n: item.bathrooms }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <p>
          <span className="text-lg font-semibold">{money(cost.headline)}</span>{" "}
          <span className="text-sm text-muted-foreground">
            {cost.period === "month" ? c?.perMonth ?? "/ month" : c?.perNight ?? "/ night"}
          </span>
        </p>

        <ul className="flex flex-wrap gap-1.5">
          {item.reasons.map((r) => (
            <li key={r}>
              <Badge variant={r === "upfrontOver" || r === "slightlyOverBudget" ? "outline" : "secondary"}>
                {(c?.reasons as Record<string, string> | undefined)?.[r] ?? r}
              </Badge>
            </li>
          ))}
        </ul>

        <details className="rounded-lg bg-muted/50 p-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span>{cost.period === "month" ? c?.moveIn ?? "Estimated to move in" : c?.stayTotal ?? "Estimated stay total"}</span>
            <span className="font-semibold">
              {ranged ? fill(c?.range ?? "{low} – {high}", { low: money(cost.total), high: money(cost.totalHigh) }) : money(cost.total)}
            </span>
          </summary>
          <dl className="mt-2 space-y-1">
            {cost.lines.map((l) => (
              <div key={l.key} className="flex justify-between gap-2 text-muted-foreground">
                <dt>{lineLabel(l.key, l.qty)}</dt>
                <dd className="tabular-nums">
                  {l.amountHigh != null ? fill(c?.range ?? "{low} – {high}", { low: money(l.amount), high: money(l.amountHigh) }) : money(l.amount)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{c?.estimateNote ?? "Estimate. A broker or host confirms the final terms."}</p>
        </details>

        <div className="flex items-center justify-between gap-2 text-sm">
          {item.availability === "confirmed" ? (
            <span className="flex items-center gap-1.5 text-emerald-700">
              <BadgeCheck className="size-4" aria-hidden />
              {c?.confirmed ?? "Availability confirmed"}
            </span>
          ) : item.availability === "asked" ? (
            <span className="flex items-center gap-1.5 text-amber-700">
              <Clock className="size-4" aria-hidden />
              {c?.asked ?? "Asked the broker — waiting for an answer"}
            </span>
          ) : item.availability === "rented" ? (
            <span className="flex items-center gap-1.5 text-destructive">
              <X className="size-4" aria-hidden />
              {c?.rented ?? "Rented — no longer available"}
            </span>
          ) : item.availability === "no_reply" ? (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CircleAlert className="size-4" aria-hidden />
              {c?.noReply ?? "The broker didn't answer within 24 hours"}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-700">
              <CircleAlert className="size-4" aria-hidden />
              {c?.unconfirmed ?? "Availability not confirmed yet"}
            </span>
          )}
          {item.duplicates > 0 && (
            <span className="text-xs text-muted-foreground">{fill(c?.duplicates ?? "+{n} similar ads grouped", { n: item.duplicates })}</span>
          )}
        </div>

        {item.viewing && <ViewingPanel item={item} viewing={item.viewing} taskId={taskId} onChange={onChange} />}

        {item.path && (
          <Link
            href={item.path}
            {...linkProps}
            className="flex items-center justify-center gap-1.5 rounded-lg border py-2 text-center text-sm font-medium hover:bg-muted"
          >
            {external ? c?.viewAd ?? "View the ad" : c?.view ?? "View home"}
            {external && <ExternalLink className="size-3.5" aria-hidden />}
          </Link>
        )}
      </div>
    </article>
  );
}
