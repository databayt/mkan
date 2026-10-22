"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CornerDownLeft, Square, SquareCheck } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { cn } from "@/lib/utils";
import type { ClarifyField } from "./fields";
import type { Requirements } from "./requirements";

interface Choice {
  key: string;
  filters: Partial<Requirements>;
}

/** Each question's options, the usual answer first. A studio is a bedroom count as well as a type. */
const CHOICES: Record<ClarifyField, Choice[]> = {
  stay: [
    { key: "long", filters: { stay: "long" } },
    { key: "short", filters: { stay: "short" } },
  ],
  homeType: [
    { key: "apartment", filters: { homeType: "apartment" } },
    { key: "house", filters: { homeType: "house" } },
    { key: "room", filters: { homeType: "room" } },
    { key: "studio", filters: { homeType: "studio", bedrooms: 0 } },
  ],
  furnished: [
    { key: "no", filters: { furnished: false } },
    { key: "yes", filters: { furnished: true } },
  ],
  purpose: [
    { key: "family", filters: { purpose: "family" } },
    { key: "study", filters: { purpose: "study" } },
    { key: "business", filters: { purpose: "business" } },
  ],
};

/** Kigali's usual answer, marked "(Recommended)". Purpose has none: it is the tenant's own. */
function recommended(field: ClarifyField, answers: Answers): string | null {
  if (field === "stay") return "long";
  if (field === "homeType") return "apartment";
  // Long-term homes are mostly unfurnished; a few nights are always furnished.
  if (field === "furnished") return answers.stay === "short" ? "yes" : "no";
  return null;
}

type Answers = Partial<Record<ClarifyField, string>>;

/** The picked answers as the exact fields they set. */
export function clarifyFilters(answers: Answers): Partial<Requirements> {
  const out: Partial<Requirements> = {};
  for (const [field, key] of Object.entries(answers) as [ClarifyField, string][]) {
    Object.assign(out, CHOICES[field]?.find((c) => c.key === key)?.filters ?? {});
  }
  return out;
}

/** Focus the composer of whichever surface is showing (/find or the side panel). */
const focusComposer = () => document.querySelector<HTMLTextAreaElement>("textarea[data-agent-composer]")?.focus();

/**
 * Several questions in one card, shaped like Claude Code's question stepper:
 * a tab strip (← ☐ Stay ☐ Home ☐ Furnishing ☐ Purpose ✔ Submit →), the
 * active question in bold with a start-side rule, numbered options with a
 * line each (the usual one first, "(Recommended)"), and a last "Type
 * something…" that hands over to the composer — what is typed there goes out
 * with the answers picked so far (`onDraft`). 1–n pick, ←/→ move (mirrored
 * in Arabic), Enter on Submit sends one message with every answer's fields.
 * A skipped question stays unanswered; nothing is guessed for it.
 */
export function ClarifyCard({
  fields,
  onSubmit,
  onDraft,
  disabled,
  compact = false,
}: {
  fields: ClarifyField[];
  onSubmit: (text: string, filters: Partial<Requirements>) => void;
  /** The answers so far, for a message typed in the composer instead. */
  onDraft?: (filters: Partial<Requirements>) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const dict = useDictionary();
  const k = dict?.agent?.clarify;
  const { isRTL } = useLocale();
  const [answers, setAnswers] = useState<Answers>({});
  const [active, setActive] = useState(0);
  const tabsRef = useRef<HTMLDivElement>(null);
  const last = fields.length; // the Submit tab
  const onSubmitTab = active >= last;
  const field = onSubmitTab ? null : fields[active]!;

  const tabs = k?.tabs as Record<string, string> | undefined;
  const questions = k?.q as Record<string, string> | undefined;
  const optionText = (f: ClarifyField, key: string) =>
    ((k?.options as Record<string, Record<string, { label: string; hint: string }>> | undefined)?.[f]?.[key]) ?? { label: key, hint: "" };

  const choices = (f: ClarifyField): Choice[] => {
    const rec = recommended(f, answers);
    const list = CHOICES[f];
    return rec ? [...list.filter((c) => c.key === rec), ...list.filter((c) => c.key !== rec)] : list;
  };

  const summary = () =>
    fields
      .filter((f) => answers[f])
      .map((f) => optionText(f, answers[f]!).label)
      .join(", ");
  const submit = () => {
    if (disabled) return;
    onSubmit(summary() || (dict?.agent?.wizard?.finish ?? "Show homes"), clarifyFilters(answers));
  };
  const pick = (f: ClarifyField, key: string) => {
    const next = { ...answers, [f]: answers[f] === key ? undefined : key };
    setAnswers(next);
    onDraft?.(clarifyFilters(next));
    if (answers[f] !== key) setActive((i) => Math.min(last, i + 1));
  };

  // Keep the active tab in view as it moves along a strip wider than a phone.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  // Keys, bound once per enable: the latest state is read through a ref.
  const latest = useRef({ field, active, pick, submit, choices, isRTL });
  useEffect(() => {
    latest.current = { field, active, pick, submit, choices, isRTL };
  });
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const { field, pick, submit, choices, isRTL } = latest.current;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        // Arabic reads right to left: → goes back.
        const forward = (e.key === "ArrowRight") !== isRTL;
        setActive((i) => Math.max(0, Math.min(last, i + (forward ? 1 : -1))));
        return;
      }
      if (e.key === "Enter" && !field) {
        e.preventDefault();
        submit();
        return;
      }
      const n = Number(e.key);
      if (!field || !Number.isInteger(n) || n < 1) return;
      const list = choices(field);
      const choice = list[n - 1];
      if (choice) pick(field, choice.key);
      else if (n === list.length + 1) {
        e.preventDefault();
        focusComposer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [disabled, last]);

  const tab = (i: number, label: string, done: boolean, submitTab = false) => {
    const on = i === active;
    const Icon = submitTab ? Check : done ? SquareCheck : Square;
    return (
      <button
        key={i}
        type="button"
        role="tab"
        aria-selected={on}
        disabled={disabled}
        onClick={() => setActive(i)}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 transition-colors focus-visible:outline-none disabled:opacity-50",
          compact ? "text-xs" : "text-sm",
          on ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className={cn("size-3.5 shrink-0", done && !submitTab && "text-foreground")} aria-hidden />
        {label}
      </button>
    );
  };
  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      onClick={() => setActive((i) => Math.max(0, Math.min(last, i + dir)))}
      disabled={disabled || (dir < 0 ? active === 0 : onSubmitTab)}
      aria-label={dir < 0 ? k?.prev ?? "Previous question" : k?.next ?? "Next question"}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none disabled:opacity-30"
    >
      {dir < 0 ? <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> : <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />}
    </button>
  );

  const row = cn(
    "group flex w-full items-start gap-3 rounded-lg px-3 text-start transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50",
    compact ? "py-1.5" : "py-2.5",
  );
  const heading = (text: string) => (
    <p className={cn("mx-3 border-s-2 border-foreground ps-2.5 font-semibold leading-snug text-foreground", compact ? "text-sm" : "text-base")}>{text}</p>
  );

  return (
    <div className="-mx-3" role="group" aria-label={k?.label ?? "Questions"}>
      <div ref={tabsRef} role="tablist" className="no-scrollbar flex items-center gap-0.5 overflow-x-auto px-3 pb-2">
        {arrow(-1)}
        {fields.map((f, i) => tab(i, tabs?.[f] ?? f, !!answers[f]))}
        {tab(last, tabs?.submit ?? "Submit", false, true)}
        {arrow(1)}
      </div>

      {field ? (
        <>
          {heading(questions?.[field] ?? field)}
          <ol className="mt-1 list-none" role="tabpanel">
            {choices(field).map((c, i) => {
              const o = optionText(field, c.key);
              const chosen = answers[field] === c.key;
              return (
                <li key={c.key}>
                  <button type="button" disabled={disabled} aria-pressed={chosen} onClick={() => pick(field, c.key)} className={cn(row, chosen && "bg-muted")}>
                    <span className="mt-0.5 w-4 shrink-0 text-sm tabular-nums text-muted-foreground group-hover:text-foreground">{i + 1}.</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">
                        {o.label}
                        {i === 0 && recommended(field, answers) === c.key && <span className="ms-1.5 font-normal text-muted-foreground">{k?.recommended ?? "(Recommended)"}</span>}
                      </span>
                      {o.hint && <span className="block text-xs text-muted-foreground">{o.hint}</span>}
                    </span>
                    {chosen && <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />}
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" disabled={disabled} onClick={focusComposer} className={row}>
                <span className="mt-0.5 w-4 shrink-0 text-sm tabular-nums text-muted-foreground">{choices(field).length + 1}.</span>
                <span className="flex-1 text-sm text-muted-foreground">{k?.other ?? "Type something…"}</span>
                <CornerDownLeft className="mt-0.5 size-3.5 text-muted-foreground rtl:scale-x-[-1]" aria-hidden />
              </button>
            </li>
          </ol>
        </>
      ) : (
        <div role="tabpanel" className="space-y-3">
          {heading(k?.review ?? "Review your answers")}
          <dl className={cn("space-y-1.5 px-3", compact ? "text-xs" : "text-sm")}>
            {fields.map((f) => (
              <div key={f} className="flex gap-3">
                <dt className="w-24 shrink-0 text-muted-foreground">{tabs?.[f] ?? f}</dt>
                <dd className={answers[f] ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {answers[f] ? optionText(f, answers[f]!).label : k?.skipped ?? "Not answered — any"}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center gap-3 px-3">
            <button
              type="button"
              disabled={disabled}
              onClick={submit}
              className={cn("rounded-full bg-foreground px-4 font-medium text-background focus-visible:outline-none disabled:opacity-50", compact ? "py-1.5 text-xs" : "py-2 text-sm")}
            >
              {k?.submit ?? "Submit"}
            </button>
            <span className="text-xs text-muted-foreground">{k?.submitHint ?? "Press Enter to search"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
