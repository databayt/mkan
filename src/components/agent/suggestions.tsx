"use client";

import { SlidersHorizontal } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";

const KEYS = ["long", "short", "studio"] as const;

/**
 * The starter cards above the empty composer, as in ChatGPT on iOS: a row
 * that swipes sideways, each card a bold line and a muted one. The first card
 * opens the guided search; the others send a ready-made request.
 */
export function Suggestions({ onPick, onGuided, disabled, compact = false }: { onPick: (text: string) => void; onGuided: () => void; disabled?: boolean; compact?: boolean }) {
  const a = useDictionary()?.agent;
  const c = a?.chat;
  const card = cn(
    "flex shrink-0 snap-start flex-col items-start rounded-2xl bg-muted/70 text-start transition-colors hover:bg-muted active:scale-[0.98] disabled:opacity-50",
    compact ? "w-44 px-3 py-2.5" : "w-52 px-4 py-3",
  );
  const title = cn("font-semibold", compact ? "text-sm" : "text-[15px]");
  const rest = cn("line-clamp-2 text-muted-foreground", compact ? "text-xs" : "text-sm");

  return (
    <ul className={cn("flex snap-x snap-mandatory gap-2 overflow-x-auto no-scrollbar", compact ? "-mx-3 px-3" : "-mx-4 px-4")}>
      <li className="contents">
        <button type="button" onClick={onGuided} disabled={disabled} className={card}>
          <span className={cn(title, "flex items-center gap-1.5")}>
            <SlidersHorizontal className="size-3.5" aria-hidden />
            {c?.guided ?? "Guided search"}
          </span>
          <span className={rest}>{c?.guidedHint ?? "Pick stay, area, home and budget"}</span>
        </button>
      </li>
      {KEYS.map((k) => {
        const text = a?.examples?.[k];
        const s = c?.suggest?.[k];
        if (!text) return null;
        return (
          <li key={k} className="contents">
            <button type="button" onClick={() => onPick(text)} disabled={disabled} className={card}>
              <span className={title}>{s?.title ?? text}</span>
              {s?.rest && <span className={rest}>{s.rest}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
