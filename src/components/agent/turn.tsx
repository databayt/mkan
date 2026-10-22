"use client";

import { Fragment, memo, useEffect, useState } from "react";
import { Check, Copy, MoreHorizontal, RotateCcw, Share, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { cn } from "@/lib/utils";
import { noteAgentFeedback } from "./actions";

const SPEECH_LANG: Record<string, string> = { ar: "ar-SA", en: "en-US", rw: "rw-RW" };

/** The user's turn: a grey bubble at the end side, as in ChatGPT on iOS. */
export const UserTurn = memo(function UserTurn({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <li className="flex justify-end">
      <p
        dir="auto"
        className={cn(
          "max-w-[80%] whitespace-pre-wrap break-words bg-muted text-foreground",
          compact ? "rounded-[20px] px-3.5 py-2 text-[15px]" : "rounded-[26px] px-[18px] py-3 text-[17px] leading-[1.45] md:text-base",
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
      <Prose text={text} />
    </AgentTurn>
  );
});

/** `**bold**` inside a line; everything else stays text (no HTML is ever parsed). */
function inline(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type Block = { kind: "p"; lines: string[] } | { kind: "h"; lines: string[] } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

/**
 * An answer as ChatGPT sets it: paragraphs, bold heads, `-`/`•` bullets and
 * `1.` steps. The writer's templates are plain sentences and pass through as
 * paragraphs; Claude's renting answers may carry this light markdown.
 */
export function Prose({ text, className }: { text: string; className?: string }) {
  const blocks: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    const step = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,4}\s+(.*)$/.exec(line);
    const last = blocks.at(-1);
    if (!line.trim()) blocks.push({ kind: "p", lines: [] });
    else if (bullet || step) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? step)![1]!;
      if (last && (last.kind === "ul" || last.kind === "ol") && last.kind === kind) last.items.push(item);
      else blocks.push(kind === "ul" ? { kind, items: [item] } : { kind, items: [item] });
    } else if (head) blocks.push({ kind: "h", lines: [head[1]!] });
    else if (last?.kind === "p") last.lines.push(line);
    else blocks.push({ kind: "p", lines: [line] });
  }

  return (
    <div dir="auto" className={cn("space-y-3 text-start leading-[inherit] text-foreground", className)}>
      {blocks.map((b, i) =>
        b.kind === "ul" || b.kind === "ol" ? (
          <Fragment key={i}>
            {b.kind === "ul" ? (
              <ul className="list-disc space-y-1.5 ps-6 marker:text-foreground">
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </ul>
            ) : (
              <ol className="list-decimal space-y-2 ps-6 marker:text-foreground">
                {b.items.map((item, j) => (
                  <li key={j} className="ps-1">
                    {inline(item)}
                  </li>
                ))}
              </ol>
            )}
          </Fragment>
        ) : b.kind === "h" ? (
          <h3 key={i} className="pt-2 text-[1.15em] font-semibold leading-snug">
            {inline(b.lines[0]!)}
          </h3>
        ) : b.lines.length ? (
          <p key={i} className="whitespace-pre-wrap break-words text-foreground">
            {inline(b.lines.join("\n"))}
          </p>
        ) : null,
      )}
    </div>
  );
}

/**
 * The row under the latest answer, as ChatGPT has it: copy, read aloud,
 * thumbs up/down, share and ⋯ (search again). A thumb is saved on the chat
 * (a silent trace row), so answer quality can be counted; a failed save
 * leaves the tenant's mark in place.
 */
export function TurnActions({ text, onRegenerate, disabled, taskId, at }: { text: string; onRegenerate?: () => void; disabled?: boolean; taskId?: string; at?: string }) {
  const dict = useDictionary();
  const c = dict?.agent?.chat;
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"good" | "bad" | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const plain = text.replace(/\*\*/g, "").replace(/^#{1,4}\s+/gm, "");
  const mark = (next: "good" | "bad" | null) => {
    setVote(next);
    if (taskId && at) void noteAgentFeedback({ taskId, at, kind: next }).catch(() => {});
  };
  const copy = () => {
    void navigator.clipboard?.writeText(plain).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const speak = () => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      return setSpeaking(false);
    }
    const u = new SpeechSynthesisUtterance(plain);
    u.lang = SPEECH_LANG[locale] ?? "en-US";
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };
  // The answer's text goes to the phone's share sheet; without one it is copied.
  const share = () => {
    if (navigator.share) void navigator.share({ text: plain }).catch(() => {});
    else copy();
  };
  useEffect(() => () => void (speaking && window.speechSynthesis?.cancel()), [speaking]);

  const button = "flex size-9 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-[19px]";

  return (
    <div className="-ms-2 flex items-center">
      <button type="button" className={button} aria-label={copied ? c?.copied ?? "Copied" : c?.copy ?? "Copy"} title={copied ? c?.copied ?? "Copied" : c?.copy ?? "Copy"} onClick={copy}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </button>
      <button
        type="button"
        className={button}
        aria-pressed={speaking}
        aria-label={speaking ? c?.stopReading ?? "Stop reading" : c?.readAloud ?? "Read aloud"}
        title={speaking ? c?.stopReading ?? "Stop reading" : c?.readAloud ?? "Read aloud"}
        onClick={speak}
      >
        {speaking ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
      </button>
      {vote !== "bad" && (
        <button type="button" className={button} aria-pressed={vote === "good"} aria-label={c?.good ?? "Good answer"} title={c?.good ?? "Good answer"} onClick={() => mark(vote === "good" ? null : "good")}>
          <ThumbsUp className={cn(vote === "good" && "fill-current text-foreground")} aria-hidden />
        </button>
      )}
      {vote !== "good" && (
        <button type="button" className={button} aria-pressed={vote === "bad"} aria-label={c?.bad ?? "Bad answer"} title={c?.bad ?? "Bad answer"} onClick={() => mark(vote === "bad" ? null : "bad")}>
          <ThumbsDown className={cn(vote === "bad" && "fill-current text-foreground")} aria-hidden />
        </button>
      )}
      <button type="button" className={button} aria-label={c?.share ?? "Share"} title={c?.share ?? "Share"} onClick={share}>
        <Share aria-hidden />
      </button>
      {onRegenerate && (
        <DropdownMenu>
          <DropdownMenuTrigger className={button} aria-label={c?.moreActions ?? "More"} title={c?.moreActions ?? "More"}>
            <MoreHorizontal aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-[70] min-w-44 rounded-2xl p-1.5">
            <DropdownMenuItem disabled={disabled} onSelect={onRegenerate} className="gap-2.5 rounded-xl px-3 py-2.5 text-[15px]">
              <RotateCcw className="size-4" aria-hidden />
              {c?.regenerate ?? "Search again"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
