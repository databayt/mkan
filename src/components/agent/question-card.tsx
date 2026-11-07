"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { fill } from "./format";
import { MAX_ANSWER_TEXT, type Question, type QuestionContext, type QuestionId, type QuestionPicks } from "./questions";
import type { Requirements } from "./requirements";

/** What the question builders need from the screen: the words, the language, money in RWF. */
export function useQuestionContext(requirements?: Partial<Requirements> | null): QuestionContext {
  const dict = useDictionary();
  const { locale } = useLocale();
  const a = dict?.agent;
  return useMemo(() => ({ a, locale, money: (n: number) => formatCurrency(n, locale, "RWF"), requirements }), [a, locale, requirements]);
}

/** Focus the composer of whichever surface is showing (/find or the side panel). */
export const focusComposer = () => document.querySelector<HTMLTextAreaElement>("textarea[data-agent-composer]")?.focus();

/**
 * Questions asked the way the Claude iOS app asks them (2026-11-07): one card,
 * one question at a time — "‹ 1 of 3 ›" and a round ×, the question large, each
 * option a title with a grey line under it and a blue ✓ once picked, a last
 * "Other" that opens a box in the card, and a black "Next →" that becomes
 * "Submit" on the last question. Next stays grey until the question in view has
 * an answer; the chevrons move without one, and a skipped question stays unset —
 * nothing is guessed for it.
 *
 * `dock` takes the composer's place over a veiled chat (content.tsx, the bubble
 * panel). `inline` is one question inside the conversation: a tap sends at once,
 * and "Other" hands over to the composer (`onOther`).
 * Keys (dock): 1–n pick, Enter = Next / Submit, ←/→ move (mirrored in Arabic), Esc closes.
 */
export function QuestionCard({
  questions,
  onSubmit,
  onClose,
  onChange,
  onOther,
  submitLabel,
  label,
  disabled,
  compact = false,
  variant = "dock",
}: {
  questions: Question[];
  onSubmit: (picks: QuestionPicks) => void;
  onClose?: () => void;
  /** Every change of the answers — a message typed in the composer instead goes out with them. */
  onChange?: (picks: QuestionPicks) => void;
  /** "Other" hands over to the composer instead of opening a box in the card. */
  onOther?: () => void;
  submitLabel?: string;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
  variant?: "dock" | "inline";
}) {
  const dict = useDictionary();
  const qc = dict?.agent?.questionCard;
  const { isRTL } = useLocale();
  const id = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [picks, setPicks] = useState<QuestionPicks>({});
  const [typing, setTyping] = useState<QuestionId | null>(null);

  const dock = variant === "dock";
  const total = questions.length;
  const at = Math.min(index, Math.max(0, total - 1));
  const q = questions[at];
  const last = at >= total - 1;
  const answered = (qid: QuestionId) => !!picks[qid]?.key || !!picks[qid]?.text?.trim();
  const ready = !!q && answered(q.id) && !disabled;

  const update = (next: QuestionPicks) => {
    setPicks(next);
    onChange?.(next);
  };
  const pick = (key: string) => {
    if (!q || disabled) return;
    if (!dock) return onSubmit({ [q.id]: { key } });
    update({ ...picks, [q.id]: picks[q.id]?.key === key ? undefined : { key } });
    setTyping(null);
  };
  const type = (text: string) => q && update({ ...picks, [q.id]: text ? { text } : undefined });
  const other = () => {
    if (!q || disabled) return;
    if (onOther) return onOther();
    setTyping(q.id);
  };
  const go = (step: 1 | -1) => {
    setDir(step);
    setIndex((i) => Math.max(0, Math.min(total - 1, i + step)));
    setTyping(null);
  };
  const primary = () => {
    if (!ready) return;
    if (last) onSubmit(picks);
    else go(1);
  };

  // A docked card takes the focus the composer had, so the keys below reach it.
  useEffect(() => {
    if (dock) cardRef.current?.focus({ preventScroll: true });
  }, [dock]);

  // Keys, bound once per enable: the latest state is read through a ref.
  const latest = useRef({ q, pick, other, go, primary, onClose, isRTL });
  useEffect(() => {
    latest.current = { q, pick, other, go, primary, onClose, isRTL };
  });
  useEffect(() => {
    if (!dock || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      const { q, pick, other, go, primary, onClose, isRTL } = latest.current;
      if (!q || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const field = el?.closest("input, textarea, select, [contenteditable=true]");
      // Typing anywhere else (the ☰ sheet…) is not ours; in our own "Other" box only Enter and Esc are.
      if (field && !cardRef.current?.contains(field)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (field) setTyping(null);
        else onClose?.();
        return;
      }
      if (e.key === "Enter") {
        // A focused button answers Enter itself.
        if (el?.closest("button")) return;
        e.preventDefault();
        primary();
        return;
      }
      if (field) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        // Arabic reads right to left: → goes back.
        go((e.key === "ArrowRight") !== isRTL ? 1 : -1);
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1) return;
      const option = q.options[n - 1];
      if (option) pick(option.key);
      else if (n === q.options.length + 1 && q.other) {
        e.preventDefault();
        other();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dock, disabled]);

  if (!q) return null;
  const typed = picks[q.id]?.text ?? "";
  const groupLabel = label ?? qc?.label ?? "Questions";
  const submitText = submitLabel ?? qc?.submit ?? "Submit";
  const otherOpen = !onOther && (typing === q.id || !!typed);
  const pad = compact ? "px-4" : dock ? "px-6" : "px-5";
  const pagerButton = cn(
    "flex items-center justify-center rounded-full transition-colors hover:bg-agent-chip disabled:text-agent-ink-off disabled:hover:bg-transparent",
    compact ? "size-7 [&_svg]:size-[18px]" : "size-9 [&_svg]:size-[22px]",
  );
  const check = (on: boolean) => <Check className={cn("shrink-0 text-agent-link", compact ? "size-[18px]" : "size-[22px]", !on && "invisible")} strokeWidth={2} aria-hidden />;

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      role="group"
      aria-label={groupLabel}
      className={cn(
        "flex flex-col overflow-hidden border border-agent-line bg-agent-card text-agent-ink outline-none",
        compact ? "rounded-[22px]" : "rounded-[28px]",
        dock && "max-h-[min(78dvh,660px)] shadow-[0_12px_48px_-12px_rgba(0,0,0,0.22)] animate-in fade-in slide-in-from-bottom-4 duration-300 motion-reduce:animate-none",
      )}
    >
      {dock && (
        <div className={cn("flex shrink-0 items-center", compact ? "px-3 pt-3" : "px-5 pt-5")}>
          {total > 1 && (
            <div className={cn("flex items-center text-agent-ink-2", compact ? "text-[14px]" : "text-[17px]")}>
              <button type="button" onClick={() => go(-1)} disabled={at === 0} aria-label={qc?.prev ?? "Previous question"} className={pagerButton}>
                <ChevronLeft className="rtl:rotate-180" aria-hidden />
              </button>
              <span className="px-1 tabular-nums" aria-live="polite">
                {fill(qc?.of ?? "{n} of {total}", { n: at + 1, total })}
              </span>
              <button type="button" onClick={() => go(1)} disabled={last} aria-label={qc?.nextQuestion ?? "Next question"} className={pagerButton}>
                <ChevronRight className="rtl:rotate-180" aria-hidden />
              </button>
            </div>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={qc?.close ?? "Close"}
              title={qc?.close ?? "Close"}
              className={cn(
                "ms-auto flex shrink-0 items-center justify-center rounded-full bg-agent-chip text-agent-ink transition-colors hover:bg-agent-line",
                compact ? "size-9 [&_svg]:size-[18px]" : "size-11 [&_svg]:size-[22px]",
              )}
            >
              <X aria-hidden />
            </button>
          )}
        </div>
      )}

      <div
        key={at}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          pad,
          dock && "animate-in fade-in duration-200 motion-reduce:animate-none",
          dock && (dir > 0 ? "slide-in-from-right-4 rtl:slide-in-from-left-4" : "slide-in-from-left-4 rtl:slide-in-from-right-4"),
        )}
      >
        <p
          id={`${id}-q`}
          className={cn(
            "font-medium tracking-[-0.01em] text-agent-ink-strong",
            dock ? (compact ? "mt-2 text-[17px] leading-snug" : "mt-4 text-[22px] leading-[1.3]") : compact ? "pt-3 text-[15px] leading-snug" : "pt-4 text-[17px] leading-snug",
          )}
        >
          {q.title}
        </p>
        <ul role="radiogroup" aria-labelledby={`${id}-q`} className={cn("list-none divide-y divide-agent-line", dock ? (compact ? "mt-1.5" : "mt-4") : "mt-1")}>
          {q.options.map((o) => {
            const on = picks[q.id]?.key === o.key;
            return (
              <li key={o.key}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => pick(o.key)}
                  className={cn("flex w-full items-center text-start transition-opacity disabled:opacity-50", compact ? "gap-3 py-2.5" : "gap-4 py-4")}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block font-medium text-agent-ink-strong", compact ? "text-[14.5px] leading-snug" : "text-[17px] leading-snug")}>
                      {o.label}
                      {o.recommended && ` ${qc?.recommended ?? "(Recommended)"}`}
                    </span>
                    {o.hint && <span className={cn("mt-0.5 block text-agent-ink-2", compact ? "text-[12.5px] leading-[1.4]" : "text-[15px] leading-[1.45]")}>{o.hint}</span>}
                  </span>
                  {check(on)}
                </button>
              </li>
            );
          })}
          {q.other && (
            <li>
              {otherOpen ? (
                <label className={cn("flex items-center", compact ? "gap-3 py-2" : "gap-4 py-3")}>
                  <input
                    autoFocus
                    value={typed}
                    onChange={(e) => type(e.target.value)}
                    maxLength={MAX_ANSWER_TEXT}
                    dir="auto"
                    disabled={disabled}
                    placeholder={qc?.otherPlaceholder ?? "Type your answer…"}
                    aria-label={qc?.other ?? "Other"}
                    className={cn(
                      "min-w-0 flex-1 bg-transparent py-1 text-agent-ink-strong outline-none placeholder:text-agent-ink-2",
                      compact ? "text-[14.5px]" : "text-[17px]",
                    )}
                  />
                  {check(!!typed.trim())}
                </label>
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={other}
                  className={cn("w-full text-start text-agent-ink-2 disabled:opacity-50", compact ? "py-2.5 text-[14.5px]" : "py-4 text-[17px]")}
                >
                  {qc?.other ?? "Other"}
                </button>
              )}
            </li>
          )}
        </ul>
      </div>

      {dock && (
        <div className={cn("flex shrink-0 justify-end", compact ? "px-3 pb-3 pt-2" : "px-5 pb-5 pt-3")}>
          <button
            type="button"
            onClick={primary}
            disabled={!ready}
            className={cn(
              "inline-flex items-center rounded-full bg-agent-btn font-medium text-agent-btn-ink transition-colors disabled:bg-agent-btn-off disabled:text-agent-btn-off-ink",
              compact ? "h-10 gap-1.5 px-5 text-[15px]" : "h-12 gap-2 px-7 text-[17px]",
            )}
          >
            {last ? submitText : (qc?.next ?? "Next")}
            {!last && <ArrowRight className={cn("rtl:rotate-180", compact ? "size-4" : "size-5")} aria-hidden />}
          </button>
        </div>
      )}
    </div>
  );
}
