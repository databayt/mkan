"use client";

import { useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
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
/** Shown before a zone is picked; after, the zone's own neighbourhoods. */
const POPULAR = ["Kimihurura", "Kacyiru", "Nyarutarama", "Remera", "Kibagabaga", "Kiyovu", "Kicukiro", "Gikondo"];

/** One tap sets one requirement field; tapping the same value again clears it. */
type Toggle = { key: string; field: keyof Requirements; value: Requirements[keyof Requirements] };
const t = (key: string, field: keyof Requirements, value: Toggle["value"]): Toggle => ({ key, field, value });

const STAY = [t("months", "stay", "long"), t("nights", "stay", "short")];
const AREAS = [t("center", "area", "center"), t("business", "area", "business"), t("university", "area", "university")];
const HOME_ROWS: { key: string; options: Toggle[] }[] = [
  { key: "bedrooms", options: [t("bed1", "bedrooms", 1), t("bed2", "bedrooms", 2), t("bed3", "bedrooms", 3)] },
  { key: "bathrooms", options: [t("bath1", "bathrooms", 1), t("bath2", "bathrooms", 2)] },
  { key: "furnishing", options: [t("furnished", "furnished", true), t("unfurnished", "furnished", false)] },
  { key: "type", options: [t("compound", "compound", true), t("family", "family", true)] },
];
const CHEAP = t("cheap", "cheap", true);
const ALL_TOGGLES = [...STAY, ...HOME_ROWS.flatMap((r) => r.options), ...AREAS, CHEAP];

const STEPS = ["stay", "where", "home", "budget"] as const;
type Step = (typeof STEPS)[number];

const chip = (on: boolean) =>
  cn(
    "inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
    on ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
  );

/** The picks as words — the text of the tenant's turn when they only tapped. */
export function usePicksLabel() {
  const dict = useDictionary();
  const b = dict?.agent?.badges as Record<string, string> | undefined;
  const { locale } = useLocale();
  return (picks: Picks): string => {
    const parts: string[] = [];
    for (const o of ALL_TOGGLES) if (picks[o.field] === o.value) parts.push(b?.[o.key] ?? o.key);
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
 * The agent's opening: four short questions — how long, where, what kind of
 * home, what budget — answered with taps. It never blocks the composer below
 * it: typing and sending at any step searches with the text plus whatever was
 * picked so far. Each tap sets one requirement field exactly (no parsing).
 */
export function Wizard({
  picks,
  onChange,
  onFinish,
  disabled,
  compact = false,
}: {
  picks: Picks;
  onChange: React.Dispatch<React.SetStateAction<Picks>>;
  onFinish: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const b = dict?.agent?.badges as Record<string, string> | undefined;
  const w = dict?.agent?.wizard;
  const rows = w?.rows as Record<string, string> | undefined;
  const { locale } = useLocale();
  const [index, setIndex] = useState(0);
  const step: Step = STEPS[index] ?? "stay";
  const last = index === STEPS.length - 1;
  const next = () => (last ? onFinish() : setIndex((i) => i + 1));

  // Updates read the latest picks, so quick taps never overwrite each other.
  const update = (patchOf: (prev: Picks) => Picks) =>
    onChange((prev) => {
      const merged = { ...prev, ...patchOf(prev) };
      for (const k of Object.keys(merged) as (keyof Picks)[]) if (merged[k] == null) delete merged[k];
      return merged;
    });
  const toggle = (o: Toggle) =>
    update((prev) => {
      const patch: Picks = { [o.field]: prev[o.field] === o.value ? null : o.value };
      // Switching nights ↔ months makes a picked budget meaningless.
      if (o.field === "stay" && prev.maxPrice) Object.assign(patch, { maxPrice: null, pricePeriod: null });
      return patch;
    });

  const option = (o: Toggle, after?: () => void) => {
    const on = picks[o.field] === o.value;
    return (
      <li key={o.key}>
        <button
          type="button"
          aria-pressed={on}
          disabled={disabled}
          onClick={() => {
            toggle(o);
            if (!on) after?.();
          }}
          className={chip(on)}
        >
          {b?.[o.key] ?? o.key}
        </button>
      </li>
    );
  };
  const row = (label: string | null, children: React.ReactNode) => (
    <div className="space-y-1.5">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <ul className="flex flex-wrap gap-2">{children}</ul>
    </div>
  );

  const nightly = picks.stay === "short";
  const hoods = picks.district ? NEIGHBOURHOODS.filter((n) => n.district === picks.district) : NEIGHBOURHOODS.filter((n) => POPULAR.includes(n.name));

  let body: React.ReactNode;
  if (step === "stay") {
    // A single choice: a tap answers and moves on.
    body = row(null, STAY.map((o) => option(o, () => setIndex(1))));
  } else if (step === "where") {
    body = (
      <>
        {row(
          rows?.zone ?? "Zone",
          DISTRICT_CODES.map((code) => {
            const on = picks.district === code;
            return (
              <li key={code}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  // A zone and a neighbourhood elsewhere would match nothing.
                  onClick={() => update((prev) => ({ district: prev.district === code ? null : code, neighbourhood: null }))}
                  className={chip(on)}
                >
                  {districtName(code, locale)}
                </button>
              </li>
            );
          }),
        )}
        {row(
          rows?.neighbourhood ?? "Neighbourhood",
          hoods.map((n) => {
            const on = picks.neighbourhood === n.name;
            return (
              <li key={n.name}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() => update((prev) => ({ neighbourhood: prev.neighbourhood === n.name ? null : n.name }))}
                  className={chip(on)}
                >
                  {n.name}
                </button>
              </li>
            );
          }),
        )}
        {row(rows?.near ?? "Near", AREAS.map((o) => option(o)))}
      </>
    );
  } else if (step === "home") {
    body = HOME_ROWS.map((r) => <div key={r.key}>{row(rows?.[r.key] ?? r.key, r.options.map((o) => option(o)))}</div>);
  } else {
    const budgets = nightly ? NIGHT_BUDGETS : MONTH_BUDGETS;
    body = (
      <>
        {row(
          nightly ? b?.perNight ?? "a night" : b?.perMonth ?? "a month",
          budgets.map((n) => {
            const on = picks.maxPrice === n;
            return (
              <li key={n}>
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={disabled}
                  onClick={() =>
                    update((prev) =>
                      prev.maxPrice === n
                        ? { maxPrice: null, pricePeriod: null }
                        : { maxPrice: n, pricePeriod: nightly ? "night" : "month", stay: prev.stay ?? "long" },
                    )
                  }
                  className={chip(on)}
                >
                  {fill(b?.upTo ?? "Up to {price}", { price: formatCurrency(n, locale, "RWF") })}
                </button>
              </li>
            );
          }),
        )}
        {row(null, [option(CHEAP)])}
      </>
    );
  }

  return (
    <section className={cn("w-full rounded-2xl border text-start", compact ? "p-3" : "p-4 sm:p-5")} aria-live="polite">
      <div className="flex items-center gap-2">
        {index > 0 && (
          <button
            type="button"
            onClick={() => setIndex((i) => i - 1)}
            aria-label={w?.back ?? "Back"}
            className="-ms-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          </button>
        )}
        <p className={cn("flex-1 font-medium", compact ? "text-sm" : "text-base")}>{w?.q?.[step] ?? step}</p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {fill(w?.stepOf ?? "{n} / {total}", { n: index + 1, total: STEPS.length })}
        </span>
      </div>
      {/* Progress: one bar per step. */}
      <div className="mt-2 flex gap-1" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-foreground" : "bg-muted")} />
        ))}
      </div>

      <div className="mt-4 space-y-3">{body}</div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{w?.orType ?? "Or just type what you need below."}</p>
        {step !== "stay" && (
          <button
            type="button"
            onClick={next}
            disabled={disabled}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium",
              last ? "bg-foreground text-background" : "border hover:bg-muted",
            )}
          >
            {last && <Search className="size-3.5" aria-hidden />}
            {last ? w?.finish ?? "Show homes" : w?.next ?? "Next"}
          </button>
        )}
      </div>
    </section>
  );
}
