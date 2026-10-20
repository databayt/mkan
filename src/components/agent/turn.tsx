"use client";

import { memo, useState } from "react";
import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";

/** The user's turn: a grey bubble at the end side, as in ChatGPT on iOS. */
export const UserTurn = memo(function UserTurn({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <li className="flex justify-end">
      <p
        dir="auto"
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words rounded-[22px] bg-muted text-foreground",
          compact ? "px-3.5 py-2 text-[15px]" : "px-4 py-2.5 text-[17px] leading-6 md:text-base",
        )}
      >
        {text}
      </p>
    </li>
  );
});

/** The agent's turn: no bubble and no avatar — its steps, then plain full-width text and content. */
export function AgentTurn({ steps, children, compact = false, id }: { steps?: React.ReactNode; children?: React.ReactNode; compact?: boolean; id?: string }) {
  return (
    <li id={id} className={cn("min-w-0 scroll-mt-16 space-y-2.5", compact ? "text-[15px] leading-6" : "text-[17px] leading-7 md:text-base")}>
      {steps}
      {children}
    </li>
  );
}

/** An older agent turn: text only, memoised so a poll does not re-render the history. */
export const PastAgentTurn = memo(function PastAgentTurn({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <AgentTurn compact={compact}>
      <p className="whitespace-pre-wrap leading-[inherit] text-foreground">{text}</p>
    </AgentTurn>
  );
});

/**
 * The row under the latest answer: copy, thumbs up/down and "search again".
 * The thumbs are local — they mark the answer for the tenant, nothing is sent.
 */
export function TurnActions({ text, onRegenerate, disabled }: { text: string; onRegenerate?: () => void; disabled?: boolean }) {
  const dict = useDictionary();
  const c = dict?.agent?.chat;
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const button = "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40";

  return (
    <div className="-ms-1.5 flex items-center gap-0.5">
      <button
        type="button"
        className={button}
        aria-label={copied ? c?.copied ?? "Copied" : c?.copy ?? "Copy"}
        title={copied ? c?.copied ?? "Copied" : c?.copy ?? "Copy"}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
      {vote !== "bad" && (
        <button type="button" className={button} aria-pressed={vote === "good"} aria-label={c?.good ?? "Good answer"} title={c?.good ?? "Good answer"} onClick={() => setVote(vote === "good" ? null : "good")}>
          <ThumbsUp className={cn("size-4", vote === "good" && "fill-current text-foreground")} aria-hidden />
        </button>
      )}
      {vote !== "good" && (
        <button type="button" className={button} aria-pressed={vote === "bad"} aria-label={c?.bad ?? "Bad answer"} title={c?.bad ?? "Bad answer"} onClick={() => setVote(vote === "bad" ? null : "bad")}>
          <ThumbsDown className={cn("size-4", vote === "bad" && "fill-current text-foreground")} aria-hidden />
        </button>
      )}
      {onRegenerate && (
        <button type="button" className={button} disabled={disabled} aria-label={c?.regenerate ?? "Search again"} title={c?.regenerate ?? "Search again"} onClick={onRegenerate}>
          <RotateCcw className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
