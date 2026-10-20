"use client";

import Link from "next/link";
import { ExternalLink, Star } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { districtName } from "@/lib/geo/rwanda-places";
import { formatCurrency } from "@/lib/i18n/formatters";
import { fill } from "./format";
import { Availability } from "./shortlist-card";
import type { ShortlistItem } from "./types";
import { ViewingPanel } from "./viewing";

/**
 * A home's details as an iOS bottom sheet: the photo, why it ranked, the full
 * move-in cost, the viewing booking and the link to the listing or the ad.
 * Loaded on the first tap of a card (shortlist-card.tsx).
 */
export default function CardSheet({
  item,
  taskId,
  onChange,
  open,
  onOpenChange,
}: {
  item: ShortlistItem;
  taskId: string;
  onChange: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-lg gap-0 overflow-y-auto rounded-t-[28px] border-0 p-0 pb-[max(env(safe-area-inset-bottom),16px)]"
      >
        <span aria-hidden className="mx-auto mt-2 block h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
        <div className="space-y-4 p-4 pt-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
            {item.photo && <BlurImage src={item.photo} alt={item.title} fill sizes="(min-width: 512px) 480px, 100vw" className="object-cover" />}
          </div>
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3 pe-6">
              <SheetTitle dir="auto" className="text-start text-lg font-semibold leading-snug">{item.title}</SheetTitle>
              {item.rating != null && item.rating > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-sm">
                  <Star className="size-3.5 fill-current" aria-hidden />
                  {item.rating.toFixed(2)}
                </span>
              )}
            </div>
            <SheetDescription className="text-sm text-muted-foreground">
              {[
                district,
                item.bedrooms != null ? fill(c?.beds ?? "{n} bd", { n: item.bedrooms }) : null,
                item.bathrooms != null ? fill(c?.baths ?? "{n} ba", { n: item.bathrooms }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </SheetDescription>
            {item.lead && (
              <p className="text-xs font-medium text-muted-foreground">
                {item.lead.handle ? fill(c?.lead ?? "Broker lead · @{handle} on TikTok", { handle: item.lead.handle }) : c?.leadNoHandle ?? "Broker lead from TikTok"}
              </p>
            )}
          </div>

          <p>
            <span className="text-xl font-semibold">{money(cost.headline)}</span>{" "}
            <span className="text-sm text-muted-foreground">{cost.period === "month" ? c?.perMonth ?? "/ month" : c?.perNight ?? "/ night"}</span>
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

          <details open className="rounded-xl bg-muted/60 p-3 text-sm">
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
            <Availability item={item} />
            {item.duplicates > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground">{fill(c?.duplicates ?? "+{n} similar ads grouped", { n: item.duplicates })}</span>
            )}
          </div>

          {item.viewing && <ViewingPanel item={item} viewing={item.viewing} taskId={taskId} onChange={onChange} />}

          {item.path && (
            <Link
              href={item.path}
              {...linkProps}
              className="flex items-center justify-center gap-1.5 rounded-full bg-foreground py-3 text-center text-[15px] font-medium text-background"
            >
              {external ? c?.viewAd ?? "View the ad" : c?.view ?? "View home"}
              {external && <ExternalLink className="size-3.5" aria-hidden />}
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
