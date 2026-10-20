"use client";

import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";
import { AskCard } from "./ask-card";
import { roundPrice } from "./fields";
import type { Requirements } from "./requirements";
import type { AgentMessage } from "./types";

type Pick = (text: string, filters: Partial<Requirements>, clear?: string[]) => void;

interface Chip {
  key: string;
  label: string;
  filters: Partial<Requirements>;
  clear?: string[];
}

/**
 * What comes after a shortlist: the budget, offered as a pick-one card when the
 * tenant has not given one (the search ran without it), then one-tap follow-ups
 * — cheaper, bigger, furnished, anywhere — that move the same search. Each tap
 * sets exact fields, so nothing is re-parsed from text.
 */
export function Refine({
  message,
  requirements,
  onPick,
  disabled,
  compact = false,
}: {
  message: Extract<AgentMessage, { kind: "shortlist" }>;
  requirements: Requirements | null;
  onPick: Pick;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const f = dict?.agent?.refine;
  const r = requirements;
  if (!r) return null;

  const chips: Chip[] = [];
  if (!(r.cheap && !r.maxPrice)) {
    chips.push({
      key: "cheaper",
      label: f?.cheaper ?? "Cheaper",
      filters: r.maxPrice ? { maxPrice: roundPrice(r.maxPrice * 0.8, r.pricePeriod), cheap: true } : { cheap: true },
    });
  }
  if ((r.bedrooms ?? 0) < 5) chips.push({ key: "bigger", label: f?.bigger ?? "More bedrooms", filters: { bedrooms: (r.bedrooms ?? 1) + 1 } });
  if (r.furnished == null) chips.push({ key: "furnished", label: f?.furnished ?? "Furnished", filters: { furnished: true } });
  if (r.district || r.neighbourhood || r.area) {
    chips.push({ key: "anywhere", label: f?.anywhere ?? "Anywhere in Kigali", filters: {}, clear: ["district", "neighbourhood", "area"] });
  }

  return (
    <div className={cn("space-y-3", compact ? "mt-3" : "mt-4")}>
      {message.refine === "maxPrice" && (
        <AskCard
          field="maxPrice"
          title={f?.budget ?? "Want me to keep these within a budget?"}
          requirements={r}
          onPick={(text, filters) => onPick(text, filters)}
          disabled={disabled}
          compact={compact}
        />
      )}
      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={f?.title ?? "Refine"}>
          {chips.map((c) => (
            <li key={c.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onPick(c.label, c.filters, c.clear)}
                className={cn(
                  "rounded-full border px-3 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
                  compact ? "py-1 text-xs" : "py-1.5 text-sm",
                )}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
