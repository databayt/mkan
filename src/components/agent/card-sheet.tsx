"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, MessageCircle, Phone, Star } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { askAvailability } from "./feedback-actions";
import { fill } from "./format";
import type { CostLine } from "./cost";
import { Availability, FitLine, kindLine, placeName, SaveHeart, type NotForMe } from "./shortlist-card";
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
  onNotForMe,
}: {
  item: ShortlistItem;
  taskId: string;
  onChange: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNotForMe?: NotForMe;
}) {
  const dict = useDictionary();
  const c = dict?.agent?.card;
  const labels = dict?.agent?.mustHaves as Record<string, string> | undefined;
  const [asking, setAsking] = useState<"idle" | "asking" | "none">("idle");
  const [why, setWhy] = useState(false);
  // A broker lead the agent did not ask about (the stay type was a guess): one tap asks.
  const canAsk = !!item.lead && item.availability === "unconfirmed";
  const ask = async () => {
    setAsking("asking");
    const res = await askAvailability({ taskId, listingId: item.id }).catch(() => ({ ok: false, asked: false }));
    setAsking(res.asked ? "idle" : "none");
    if (res.asked) onChange();
  };
  const { locale } = useLocale();
  const money = (n: number) => formatCurrency(n, locale, item.currency);
  const { cost } = item;
  const ranged = cost.totalHigh !== cost.total;
  const lines = c?.lines as Record<string, string> | undefined;
  const num = (n: number) => n.toLocaleString(locale === "ar" ? "ar" : "en", { maximumFractionDigits: 1 });
  // Labels carry the line's own figures (from the ad, or Kigali's typical terms) — none are written into the dictionary.
  const lineLabel = (l: CostLine) => {
    const key =
      l.key === "deposit"
        ? l.qty === 0 ? "depositNone" : l.qty === 0.5 ? "depositHalf" : l.qty === 1 ? "depositOne" : "deposit"
        : l.key === "commission" && l.qtyHigh != null
          ? "commissionRange"
          : l.key;
    return fill(lines?.[key] ?? key, { qty: l.qty != null ? num(l.qty) : "", qtyHigh: l.qtyHigh != null ? num(l.qtyHigh) : "" });
  };
  const status = c?.status as Record<string, string> | undefined;
  const source = c?.source as Record<string, string> | undefined;
  const asks = [
    ...(item.mustHaves?.unknown ?? []).map((k) => labels?.[k] ?? k),
    ...(item.ask ?? []).map((k) => (c?.askKeys as Record<string, string> | undefined)?.[k] ?? k),
  ];
  const kind = kindLine(item, c);
  // A broker-market home with no commission line: the owner posted it, or the ad says none.
  const noCommission = cost.period === "month" && cost.lines.some((l) => l.key === "rentInAdvance") && !cost.lines.some((l) => l.key === "commission");
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
            <SaveHeart item={item} taskId={taskId} className="absolute end-3 top-3 size-9" />
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
                placeName(item, locale),
                item.bedrooms != null ? fill(c?.beds ?? "{n} bd", { n: item.bedrooms }) : null,
                item.bathrooms != null ? fill(c?.baths ?? "{n} ba", { n: item.bathrooms }) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </SheetDescription>
            {kind && <p className="text-sm text-foreground">{kind}</p>}
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

          {item.why && (
            <p dir="auto" className="text-start text-[15px] leading-6">
              {item.why}
            </p>
          )}
          <FitLine item={item} className="whitespace-normal text-sm" />
          {asks.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">{fill(c?.askAbout ?? "Ask the broker about: {list}", { list: asks.join(locale === "ar" ? "، " : ", ") })}</p>
          )}

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
                  <dt className="min-w-0">
                    {lineLabel(l)}
                    {l.source && <span className="ms-1.5 text-[11px] text-muted-foreground/80">· {source?.[l.source] ?? l.source}</span>}
                  </dt>
                  <dd className="shrink-0 tabular-nums">
                    {l.status
                      ? status?.[l.status] ?? l.status
                      : l.amountHigh != null
                        ? fill(c?.range ?? "{low} – {high}", { low: money(l.amount), high: money(l.amountHigh) })
                        : money(l.amount)}
                  </dd>
                </div>
              ))}
              {noCommission && (
                <div className="flex justify-between gap-2 text-muted-foreground">
                  <dt>{c?.noCommission ?? "No broker commission"}</dt>
                  <dd className="shrink-0 tabular-nums">{money(0)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">{c?.estimateNote ?? "Estimate. A broker or host confirms the final terms."}</p>
          </details>

          <div className="flex items-center justify-between gap-2 text-sm">
            <Availability item={item} />
            {item.duplicates > 0 && (
              <span className="shrink-0 text-xs text-muted-foreground">{fill(c?.duplicates ?? "+{n} similar ads grouped", { n: item.duplicates })}</span>
            )}
          </div>

          {item.availability === "confirmed" && item.brokerPhone && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{c?.brokerContact ?? "The broker says it's available. Call or WhatsApp them to arrange a viewing."}</p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`tel:${item.brokerPhone}`}
                  className="flex items-center justify-center gap-2 rounded-full border py-3 text-[15px] font-medium transition-colors hover:bg-muted"
                >
                  <Phone className="size-4" aria-hidden />
                  {c?.callBroker ?? "Call"}
                </a>
                <a
                  href={`https://wa.me/${item.brokerPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-full border py-3 text-[15px] font-medium transition-colors hover:bg-muted"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  {c?.whatsappBroker ?? "WhatsApp"}
                </a>
              </div>
              <p className="text-center text-xs tabular-nums text-muted-foreground" dir="ltr">{item.brokerPhone}</p>
            </div>
          )}

          {item.viewing && <ViewingPanel item={item} viewing={item.viewing} taskId={taskId} onChange={onChange} />}

          {canAsk && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => void ask()}
                disabled={asking === "asking"}
                className="flex w-full items-center justify-center gap-2 rounded-full border py-3 text-[15px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
              >
                {asking === "asking" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {asking === "asking" ? c?.checking ?? "Asking the broker…" : c?.checkAvailability ?? "Check availability"}
              </button>
              <p className="text-center text-xs text-muted-foreground">
                {asking === "none" ? c?.noBroker ?? "No broker to ask for this home yet." : c?.checkAvailabilityHint ?? "Mkan messages the broker for you and shows the answer here."}
              </p>
            </div>
          )}

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

          {onNotForMe && (
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                onNotForMe(item, "like");
              }}
              className="w-full rounded-full py-2.5 text-center text-[15px] font-medium ring-1 ring-border transition-colors hover:bg-muted"
            >
              {c?.moreLike ?? "More like this"}
            </button>
          )}

          {onNotForMe &&
            (why ? (
              <div className="space-y-2 rounded-2xl bg-muted/60 p-3">
                <p className="text-sm font-medium">{c?.notForMeTitle ?? "What's not right?"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["expensive", "small", "other"] as const).map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onNotForMe(item, reason);
                      }}
                      className="rounded-full bg-background px-3 py-1.5 text-sm shadow-sm ring-1 ring-black/5 transition-colors hover:bg-muted dark:ring-white/10"
                    >
                      {(c?.notReasons as Record<string, string> | undefined)?.[reason] ?? reason}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setWhy(true)} className="w-full py-1 text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                {c?.notForMe ?? "Not for me"}
              </button>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
