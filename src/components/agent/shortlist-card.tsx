"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { BadgeCheck, CircleAlert, Clock, Star, X } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { districtName } from "@/lib/geo/rwanda-places";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { fill } from "./format";
import type { ShortlistItem } from "./types";

// The cost breakdown, viewing booking and its form load on the first tap.
const CardSheet = dynamic(() => import("./card-sheet"), { ssr: false });

/** Where this home stands with its broker — one line with an icon. */
export function Availability({ item, className }: { item: ShortlistItem; className?: string }) {
  const c = useDictionary()?.agent?.card;
  const line = (cls: string, Icon: typeof BadgeCheck, text: string) => (
    <span className={cn("flex items-center gap-1.5", cls, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
  if (item.availability === "confirmed") return line("text-emerald-700 dark:text-emerald-400", BadgeCheck, c?.confirmed ?? "Availability confirmed");
  if (item.availability === "asked") return line("text-amber-700 dark:text-amber-400", Clock, c?.asked ?? "Asked the broker — waiting for an answer");
  if (item.availability === "rented") return line("text-destructive", X, c?.rented ?? "Rented — no longer available");
  if (item.availability === "no_reply") return line("text-muted-foreground", CircleAlert, c?.noReply ?? "The broker didn't answer within 24 hours");
  return line("text-amber-700 dark:text-amber-400", CircleAlert, c?.unconfirmed ?? "Availability not confirmed yet");
}

/**
 * A home in the answer, shaped like ChatGPT's inline shopping cards: photo,
 * title, the price and where it stands. A tap opens the details sheet (cost
 * breakdown, why it ranked, viewing times, the listing link). Memoised: the
 * hook keeps an unchanged item's reference across polls.
 */
export const ShortlistCard = memo(function ShortlistCard({ item, taskId, onChange }: { item: ShortlistItem; taskId: string; onChange: () => void }) {
  const dict = useDictionary();
  const c = dict?.agent?.card;
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const district = item.district ? districtName(item.district.toUpperCase(), locale) || item.district : null;
  const meta = [
    district,
    item.bedrooms != null ? fill(c?.beds ?? "{n} bd", { n: item.bedrooms }) : null,
    item.bathrooms != null ? fill(c?.baths ?? "{n} ba", { n: item.bathrooms }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // A viewing time waiting on the tenant is the one thing worth flagging on the card.
  const needsPick = !!item.viewing && !item.viewing.chosen && item.viewing.slots.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="group block w-full overflow-hidden rounded-2xl bg-background text-start shadow-[0_1px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/5 transition-transform active:scale-[0.98] dark:ring-white/10"
      >
        <span className="relative block aspect-[4/3] overflow-hidden bg-muted">
          {item.photo && (
            <BlurImage src={item.photo} alt={item.title} fill sizes="(min-width: 768px) 300px, 80vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          )}
          {needsPick && (
            <span className="absolute start-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium shadow-sm backdrop-blur">
              {c?.pickSlot ?? "Pick a viewing time"}
            </span>
          )}
        </span>
        <span className="block space-y-1 p-3">
          <span className="flex items-start justify-between gap-2">
            <span dir="auto" className="line-clamp-1 text-start text-[15px] font-semibold">{item.title}</span>
            {item.rating != null && item.rating > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-sm">
                <Star className="size-3.5 fill-current" aria-hidden />
                {item.rating.toFixed(1)}
              </span>
            )}
          </span>
          {meta && <span className="block truncate text-sm text-muted-foreground">{meta}</span>}
          <span className="block text-[15px]">
            <span className="font-semibold">{formatCurrency(item.cost.headline, locale, item.currency)}</span>{" "}
            <span className="text-sm text-muted-foreground">{item.cost.period === "month" ? c?.perMonth ?? "/ month" : c?.perNight ?? "/ night"}</span>
          </span>
          <Availability item={item} className="pt-0.5 text-xs" />
        </span>
      </button>
      {loaded && <CardSheet item={item} taskId={taskId} onChange={onChange} open={open} onOpenChange={setOpen} />}
    </>
  );
});
