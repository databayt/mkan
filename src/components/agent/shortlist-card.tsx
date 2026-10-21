"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { BadgeCheck, CircleAlert, Clock, Heart, Star, X } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { useFavorites } from "@/components/favorites/favorites-context";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { districtName } from "@/lib/geo/rwanda-places";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { noteHomeFeedback } from "./feedback-actions";
import { fill } from "./format";
import type { ShortlistItem } from "./types";

/** What a "Not for me" tap does to the search: a reason, and the message + fields it sends. */
/** A tap on a card that re-steers the search: one of "Not for me"'s reasons, or "More like this". */
export type NotForMe = (item: ShortlistItem, reason: "expensive" | "small" | "other" | "like") => void;

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
 * ♥ on a card: the site's favorites (signed in: the account; guest: this
 * browser) and the agent's memory, which lifts homes like it next time.
 */
export function SaveHeart({ item, taskId, className }: { item: Pick<ShortlistItem, "id">; taskId?: string; className?: string }) {
  const c = useDictionary()?.agent?.card;
  const { isFavorite, toggle } = useFavorites();
  const saved = isFavorite(item.id);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? c?.unsave ?? "Remove from saved" : c?.save ?? "Save"}
      title={saved ? c?.unsave ?? "Remove from saved" : c?.save ?? "Save"}
      onClick={(e) => {
        e.stopPropagation();
        toggle(item.id);
        void noteHomeFeedback({ taskId: taskId ?? "", listingId: item.id, kind: saved ? "unlike" : "like" }).catch(() => {});
      }}
      className={cn("flex size-8 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-transform active:scale-90", className)}
    >
      <Heart className={cn("size-4", saved ? "fill-rose-500 text-rose-500" : "text-foreground")} aria-hidden />
    </button>
  );
}

/** "1.2 km from Kigali Heights · Has: Parking" — the one line that says why this home, in facts. */
export function FitLine({ item, className }: { item: ShortlistItem; className?: string }) {
  const dict = useDictionary();
  const c = dict?.agent?.card;
  const labels = dict?.agent?.mustHaves as Record<string, string> | undefined;
  const { locale } = useLocale();
  const parts = [
    item.place ? fill(c?.nearPlace ?? "{km} km from {place}", { km: item.place.km.toLocaleString(locale === "ar" ? "ar" : "en"), place: item.place.name }) : null,
    item.mustHaves?.matched.length ? fill(c?.has ?? "Has: {list}", { list: item.mustHaves.matched.map((k) => labels?.[k] ?? k).join(", ") }) : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className={cn("block truncate text-xs text-emerald-700 dark:text-emerald-400", className)}>{parts.join(" · ")}</span>;
}

/**
 * A home in the answer, shaped like ChatGPT's inline shopping cards: photo,
 * title, the price and where it stands. A tap opens the details sheet (cost
 * breakdown, why it ranked, viewing times, the listing link). Memoised: the
 * hook keeps an unchanged item's reference across polls.
 */
export const ShortlistCard = memo(function ShortlistCard({
  item,
  taskId,
  onChange,
  best = false,
  onNotForMe,
}: {
  item: ShortlistItem;
  taskId: string;
  onChange: () => void;
  /** The first card: the agent's pick. */
  best?: boolean;
  onNotForMe?: NotForMe;
}) {
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
    <div className="relative">
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
          {best && !needsPick && (
            <span className="absolute start-2 top-2 rounded-full bg-foreground px-2.5 py-0.5 text-xs font-semibold text-background shadow-sm">
              {c?.best ?? "Best match"}
            </span>
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
          {item.why && (
            <span dir="auto" className="line-clamp-2 block text-start text-sm text-foreground/80">
              {item.why}
            </span>
          )}
          <span className="block text-[15px]">
            <span className="font-semibold">{formatCurrency(item.cost.headline, locale, item.currency)}</span>{" "}
            <span className="text-sm text-muted-foreground">{item.cost.period === "month" ? c?.perMonth ?? "/ month" : c?.perNight ?? "/ night"}</span>
          </span>
          <FitLine item={item} />
          <Availability item={item} className="pt-0.5 text-xs" />
        </span>
      </button>
      <SaveHeart item={item} taskId={taskId} className="absolute end-2 top-2" />
      {loaded && <CardSheet item={item} taskId={taskId} onChange={onChange} open={open} onOpenChange={setOpen} onNotForMe={onNotForMe} />}
    </div>
  );
});
