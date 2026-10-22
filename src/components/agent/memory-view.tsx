"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { requirementChips } from "./chips";
import { forgetAgentMemory, updateAgentMemory } from "./feedback-actions";
import { fill } from "./format";
import type { AgentMemory, PrefField } from "./memory";

/** Budgets offered when changing a remembered one — the same steps the agent's budget card uses. */
const BUDGETS = { month: [150_000, 300_000, 500_000, 1_000_000], night: [30_000, 60_000, 100_000, 150_000] } as const;
const BEDROOMS = [0, 1, 2, 3, 4] as const;
/** The order a tenant reads their search in; pricePeriod rides with maxPrice. */
const SHOWN: PrefField[] = ["stay", "district", "neighbourhood", "near", "area", "bedrooms", "bathrooms", "maxPrice", "furnished", "homeType", "purpose", "waterIncluded", "noCommission", "mustHaves"];

/**
 * ☰ → Memory: what Mkan remembers, all of it visible and undoable — the
 * search fields (✕ removes one; budget and bedrooms change with a tap), the
 * facts the tenant mentioned, the homes they passed on, and Forget everything.
 */
export function MemoryView({ memory, onChange }: { memory: AgentMemory | null; onChange: (memory: AgentMemory) => void }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const s = a?.chats;
  const { locale } = useLocale();
  const money = (n: number) => formatCurrency(n, locale, "RWF");
  const [editing, setEditing] = useState<"maxPrice" | "bedrooms" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (change: () => Promise<AgentMemory>) => {
    setBusy(true);
    const next = await change().catch(() => null);
    setBusy(false);
    setEditing(null);
    if (next) onChange(next);
  };

  const prefs = memory?.prefs ?? {};
  const value = (f: PrefField) => prefs[f]?.value;
  const chips = SHOWN.flatMap((field) => {
    if (value(field) == null) return [];
    const one = field === "maxPrice" ? { maxPrice: value("maxPrice"), pricePeriod: value("pricePeriod") } : { [field]: value(field) };
    const label = requirementChips(one as never, a, locale, money).join(" · ");
    return label ? [{ field, label }] : [];
  });
  const empty = chips.length === 0 && !memory?.notes.length && !memory?.dismissed.length;
  const period = value("pricePeriod") === "night" ? "night" : "month";

  return (
    <div className={cn("space-y-5 px-3 pt-4 text-sm", busy && "pointer-events-none opacity-60")}>
      {empty ? (
        <p className="text-muted-foreground">{s?.memoryEmpty ?? "Nothing yet. As you search, Mkan remembers your budget, areas and must-haves so you don't have to repeat them."}</p>
      ) : (
        <>
          {chips.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">{s?.memorySearch ?? "Your search"}</h3>
              <ul className="flex flex-wrap gap-1.5">
                {chips.map(({ field, label }) => (
                  <li key={field} className="flex items-center rounded-full bg-muted ps-3 pe-1">
                    <button
                      type="button"
                      disabled={field !== "maxPrice" && field !== "bedrooms"}
                      onClick={() => setEditing(editing === field ? null : (field as "maxPrice" | "bedrooms"))}
                      className="py-1 text-start disabled:cursor-default"
                    >
                      {label}
                    </button>
                    <button
                      type="button"
                      onClick={() => void run(() => updateAgentMemory({ removePrefs: [field] }))}
                      aria-label={`${s?.remove ?? "Remove"}: ${label}`}
                      className="ms-1 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              {editing && (
                <div className="space-y-1.5 rounded-xl bg-muted/50 p-2.5">
                  <p className="text-xs font-medium text-muted-foreground">{editing === "maxPrice" ? s?.editBudget ?? "Budget" : s?.editBeds ?? "Bedrooms"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {editing === "maxPrice"
                      ? BUDGETS[period].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => void run(() => updateAgentMemory({ set: { maxPrice: n, pricePeriod: period } }))}
                            className="rounded-full bg-background px-3 py-1 shadow-sm ring-1 ring-black/5 hover:bg-muted dark:ring-white/10"
                          >
                            {money(n)}
                          </button>
                        ))
                      : BEDROOMS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => void run(() => updateAgentMemory({ set: { bedrooms: n } }))}
                            className="rounded-full bg-background px-3 py-1 shadow-sm ring-1 ring-black/5 hover:bg-muted dark:ring-white/10"
                          >
                            {n === 0 ? s?.studio ?? "Studio" : n === 4 ? "4+" : n}
                          </button>
                        ))}
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{s?.memoryHint ?? "Tap a chip to change it, or just tell Mkan."}</p>
            </section>
          )}

          {!!memory?.notes.length && (
            <section className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground">{s?.memoryNotes ?? "Things you told me"}</h3>
              <ul className="list-none space-y-1">
                {memory.notes.map((n) => (
                  <li key={n.id} className="flex items-center gap-2 rounded-lg bg-muted/50 py-1.5 ps-3 pe-1">
                    <span dir="auto" className="min-w-0 flex-1">
                      {n.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => void run(() => updateAgentMemory({ removeNotes: [n.id] }))}
                      aria-label={`${s?.remove ?? "Remove"}: ${n.text}`}
                      className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!!memory?.dismissed.length && (
            <p className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>{fill(s?.memoryPassed ?? "Homes you passed on: {n}", { n: memory.dismissed.length })}</span>
              <button type="button" onClick={() => void run(() => updateAgentMemory({ clearDismissed: true }))} className="font-medium text-foreground underline underline-offset-4">
                {s?.memoryLetBack ?? "Show them again"}
              </button>
            </p>
          )}

          {confirming ? (
            <div className="flex items-center gap-1.5 rounded-xl bg-muted px-3 py-2">
              <span className="min-w-0 flex-1">{s?.forgetConfirm ?? "Forget everything Mkan remembers?"}</span>
              <button type="button" onClick={() => void run(() => forgetAgentMemory()).then(() => setConfirming(false))} className="rounded-full bg-destructive px-3 py-1 text-xs font-medium text-white">
                {s?.forget ?? "Forget"}
              </button>
              <button type="button" autoFocus onClick={() => setConfirming(false)} className="rounded-full px-3 py-1 text-xs font-medium hover:bg-background">
                {s?.cancel ?? "Cancel"}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="font-medium text-destructive">
              {s?.forgetAll ?? "Forget everything"}
            </button>
          )}
        </>
      )}
      <p className="text-xs leading-5 text-muted-foreground">{s?.memoryPrivacy ?? "Kept on this device unless you sign in. Phone numbers and emails are never kept."}</p>
    </div>
  );
}
