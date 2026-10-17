"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { districtName } from "@/lib/geo/rwanda-places";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { NEIGHBOURHOODS } from "./areas";
import { fill } from "./format";
import { DISTRICT_CODES, type Requirements } from "./requirements";

export type Picks = Partial<Requirements>;

const MONTH_BUDGETS = [150_000, 300_000, 500_000, 1_000_000];
const NIGHT_BUDGETS = [30_000, 60_000, 100_000];

/** A tap sets a field; tapping the same value again clears it. */
type Toggle = { key: string; field: keyof Requirements; value: Requirements[keyof Requirements] };
const TOGGLES_BEFORE: Toggle[] = [
  { key: "furnished", field: "furnished", value: true },
  { key: "unfurnished", field: "furnished", value: false },
  { key: "nights", field: "stay", value: "short" },
  { key: "months", field: "stay", value: "long" },
  { key: "bed1", field: "bedrooms", value: 1 },
  { key: "bed2", field: "bedrooms", value: 2 },
  { key: "bath1", field: "bathrooms", value: 1 },
  { key: "compound", field: "compound", value: true },
];
const TOGGLES_AFTER: Toggle[] = [
  { key: "center", field: "area", value: "center" },
  { key: "business", field: "area", value: "business" },
  { key: "university", field: "area", value: "university" },
  { key: "family", field: "family", value: true },
  { key: "cheap", field: "cheap", value: true },
];

const chip = (on: boolean) =>
  cn(
    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors",
    on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );

/** The picks as words — the text of the tenant's turn when they only tapped badges. */
export function usePicksLabel() {
  const dict = useDictionary();
  const b = dict?.agent?.badges as Record<string, string> | undefined;
  const { locale } = useLocale();
  return (picks: Picks): string => {
    const parts: string[] = [];
    for (const t of [...TOGGLES_BEFORE, ...TOGGLES_AFTER]) {
      if (picks[t.field] === t.value) parts.push(b?.[t.key] ?? t.key);
    }
    if (picks.district) parts.push(districtName(picks.district, locale));
    if (picks.neighbourhood) parts.push(picks.neighbourhood);
    if (picks.maxPrice) {
      const period = picks.pricePeriod === "night" ? b?.perNight : b?.perMonth;
      parts.push(`${fill(b?.upTo ?? "Up to {price}", { price: formatCurrency(picks.maxPrice, locale, "RWF") })}${period ? ` ${period}` : ""}`);
    }
    return parts.join(", ");
  };
}

/**
 * Quick-pick badges under the composer. Each one sets one requirement field
 * exactly (no parsing), so a tenant can search with taps alone.
 */
export function Badges({
  picks,
  onChange,
  compact = false,
}: {
  picks: Picks;
  onChange: React.Dispatch<React.SetStateAction<Picks>>;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const b = dict?.agent?.badges as Record<string, string> | undefined;
  const { locale } = useLocale();
  const money = (n: number) => formatCurrency(n, locale, "RWF");

  // Updates read the latest picks, so quick taps never overwrite each other.
  const update = (patchOf: (prev: Picks) => Picks) =>
    onChange((prev) => {
      const next = { ...prev, ...patchOf(prev) };
      for (const k of Object.keys(next) as (keyof Picks)[]) if (next[k] == null) delete next[k];
      return next;
    });
  const set = (patch: Picks) => update(() => patch);
  const toggle = (t: Toggle) =>
    update((prev) => {
      const patch: Picks = { [t.field]: prev[t.field] === t.value ? null : t.value };
      // Switching nights ↔ months makes a picked budget meaningless.
      if (t.field === "stay" && prev.maxPrice) Object.assign(patch, { maxPrice: null, pricePeriod: null });
      return patch;
    });

  const nightly = picks.stay === "short";
  const budgets = nightly ? NIGHT_BUDGETS : MONTH_BUDGETS;

  const menu = (label: string, active: boolean, items: { key: string; label: string; on: boolean; pick: () => void }[], clear: () => void) => (
    <DropdownMenu>
      <DropdownMenuTrigger className={chip(active)}>
        {label}
        <ChevronDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {items.map((it) => (
          <DropdownMenuItem key={it.key} onSelect={it.pick}>
            <Check className={cn("size-4", !it.on && "invisible")} aria-hidden />
            {it.label}
          </DropdownMenuItem>
        ))}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={clear}>{b?.any ?? "Any"}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const toggleChip = (t: Toggle) => {
    const on = picks[t.field] === t.value;
    return (
      <li key={t.key}>
        <button type="button" aria-pressed={on} onClick={() => toggle(t)} className={chip(on)}>
          {b?.[t.key] ?? t.key}
        </button>
      </li>
    );
  };

  return (
    <ul className={cn("flex flex-wrap gap-2", compact ? "justify-start" : "justify-center")}>
      {TOGGLES_BEFORE.map(toggleChip)}
      <li>
        {menu(
          picks.district ? districtName(picks.district, locale) : b?.zone ?? "Zone",
          !!picks.district,
          DISTRICT_CODES.map((code) => ({
            key: code,
            label: districtName(code, locale),
            on: picks.district === code,
            // A zone and a neighbourhood in another zone would match nothing.
            pick: () => set({ district: code, neighbourhood: null }),
          })),
          () => set({ district: null }),
        )}
      </li>
      <li>
        {menu(
          picks.maxPrice ? fill(b?.upTo ?? "Up to {price}", { price: money(picks.maxPrice) }) : b?.budget ?? "Budget",
          !!picks.maxPrice,
          budgets.map((n) => ({
            key: String(n),
            label: `${fill(b?.upTo ?? "Up to {price}", { price: money(n) })} ${nightly ? b?.perNight ?? "/ night" : b?.perMonth ?? "/ month"}`,
            on: picks.maxPrice === n,
            pick: () => update((prev) => ({ maxPrice: n, pricePeriod: nightly ? "night" : "month", stay: prev.stay ?? "long" })),
          })),
          () => set({ maxPrice: null, pricePeriod: null }),
        )}
      </li>
      <li>
        {menu(
          picks.neighbourhood ?? b?.neighbourhood ?? "Neighbourhood",
          !!picks.neighbourhood,
          NEIGHBOURHOODS.map((n) => ({
            key: n.name,
            label: `${n.name} · ${districtName(n.district, locale)}`,
            on: picks.neighbourhood === n.name,
            pick: () => set({ neighbourhood: n.name, district: null }),
          })),
          () => set({ neighbourhood: null }),
        )}
      </li>
      {TOGGLES_AFTER.map(toggleChip)}
    </ul>
  );
}

