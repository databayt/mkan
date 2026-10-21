"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { requirementChips } from "./chips";
import { fill } from "./format";
import type { Requirements } from "./requirements";
import type { AgentWelcomeView } from "./types";

/**
 * The empty chat for a returning tenant: "Welcome back", their last search as
 * one tap ("Continue: Kicukiro · 2 bedrooms · up to RWF 500,000 a month"), and
 * the homes that match it listed since — nothing to type. A first visit gets
 * nothing here and the greeting stays.
 */
export function Welcome({
  onContinue,
  disabled,
  compact = false,
  onReady,
}: {
  onContinue: (text: string, filters: Partial<Requirements>) => void;
  disabled?: boolean;
  compact?: boolean;
  /** Told whether there is anything to welcome back to, so the greeting can step aside. */
  onReady?: (returning: boolean) => void;
}) {
  const dict = useDictionary();
  const a = dict?.agent;
  const w = a?.welcome;
  const { locale } = useLocale();
  const [view, setView] = useState<AgentWelcomeView | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/agent/welcome?lang=${locale}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<AgentWelcomeView>) : null))
      .catch(() => null)
      .then((next) => {
        if (!live) return;
        setView(next);
        onReady?.(!!next?.search);
      });
    return () => {
      live = false;
    };
    // onReady is a parent callback; the welcome is fetched once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  if (!view?.search) return null;
  const money = (n: number) => formatCurrency(n, locale, "RWF");
  const chips = requirementChips(view.search, a, locale, money);
  const label = chips.join(" · ");
  const since = view.since ? new Intl.DateTimeFormat(locale === "rw" ? "en" : locale, { weekday: "long" }).format(new Date(view.since)) : null;

  return (
    <div className={cn("w-full space-y-4", compact ? "max-w-sm" : "max-w-xl")}>
      <h1 className={cn("text-balance text-center font-semibold leading-tight tracking-tight", compact ? "text-[22px]" : "text-[26px] sm:text-3xl")}>
        {w?.title ?? "Welcome back"}
      </h1>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onContinue(label, view.search!)}
        className="flex w-full items-center gap-3 rounded-2xl bg-muted/70 p-3.5 text-start transition-colors hover:bg-muted disabled:opacity-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{w?.continue ?? "Continue your search"}</span>
          <span dir="auto" className="block truncate text-sm text-muted-foreground">
            {label}
          </span>
        </span>
        <ArrowUpRight className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
      </button>
      {view.homes.length > 0 && (
        <div className="space-y-2">
          {since && <p className="px-1 text-xs font-medium text-muted-foreground">{fill(w?.newSince ?? "New since {date}", { date: since })}</p>}
          <ul className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {view.homes.map((home) => (
              <li key={home.id} className="w-40 shrink-0 snap-start">
                <Link
                  href={home.path}
                  {...(home.lead ? { target: "_blank", rel: "noreferrer" } : {})}
                  className="block overflow-hidden rounded-xl bg-background shadow-[0_1px_6px_rgba(0,0,0,0.08)] ring-1 ring-black/5 dark:ring-white/10"
                >
                  <span className="relative block aspect-[4/3] bg-muted">
                    {home.photo && <BlurImage src={home.photo} alt={home.title} fill sizes="160px" className="object-cover" />}
                  </span>
                  <span className="block space-y-0.5 p-2">
                    <span dir="auto" className="block truncate text-start text-xs font-medium">
                      {home.title}
                    </span>
                    <span className="block text-xs">
                      <span className="font-semibold">{formatCurrency(home.cost.headline, locale, home.currency)}</span>{" "}
                      <span className="text-muted-foreground">{home.cost.period === "month" ? a?.card?.perMonth ?? "/ month" : a?.card?.perNight ?? "/ night"}</span>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
