"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BlurImage } from "@/components/atom/blur-image";
import { useFavorites } from "@/components/favorites/favorites-context";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { districtName } from "@/lib/geo/rwanda-places";
import { formatCurrency } from "@/lib/i18n/formatters";
import { getSavedHomes, type SavedHome } from "./feedback-actions";
import { SaveHeart } from "./shortlist-card";

/**
 * ☰ → Saved homes: every ♥ on mkan (the site's favorites — the account's when
 * signed in, this browser's otherwise), newest first, one tap to the home or
 * the broker's ad.
 */
export function SavedView() {
  const dict = useDictionary();
  const a = dict?.agent;
  const s = a?.chats;
  const { locale } = useLocale();
  const { ids, ready } = useFavorites();
  const [homes, setHomes] = useState<SavedHome[] | null>(null);
  const key = ids.join(",");

  useEffect(() => {
    if (!ready) return;
    let live = true;
    // Newest heart first: the set keeps insertion order.
    void getSavedHomes([...ids].reverse(), locale)
      .catch(() => [])
      .then((rows) => live && setHomes(rows));
    return () => {
      live = false;
    };
    // `key` stands for `ids` (a new array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key, locale]);

  if (!homes) {
    return (
      <ul aria-hidden className="space-y-3 px-3 pt-4">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex gap-3">
            <span className="size-14 shrink-0 animate-pulse rounded-lg bg-muted" />
            <span className="h-4 flex-1 animate-pulse self-center rounded bg-muted" />
          </li>
        ))}
      </ul>
    );
  }
  // A home un-hearted here leaves the list at once.
  const shown = homes.filter((h) => ids.includes(h.id));
  if (shown.length === 0) return <p className="px-3 pt-5 text-sm text-muted-foreground">{s?.savedEmpty ?? "Tap ♥ on a home to keep it here."}</p>;

  return (
    <ul className="list-none space-y-1 pt-2">
      {shown.map((h) => (
        <li key={h.id} className="relative flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted/60">
          <Link href={h.path} {...(h.external ? { target: "_blank", rel: "noreferrer" } : {})} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
              {h.photo && <BlurImage src={h.photo} alt="" fill sizes="56px" className="object-cover" />}
            </span>
            <span className="min-w-0 flex-1">
              <span dir="auto" className="block truncate text-start text-sm font-medium">
                {h.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[
                  h.district ? districtName(h.district.toUpperCase(), locale) || h.district : null,
                  h.price ? `${formatCurrency(h.price, locale, h.currency)} ${h.period === "month" ? s?.perMonth ?? "a month" : s?.perNight ?? "a night"}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </Link>
          <SaveHeart item={h} className="shrink-0 shadow-none" />
        </li>
      ))}
    </ul>
  );
}
