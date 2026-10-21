"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, Mic, Plus, Square } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { cn } from "@/lib/utils";

/** About six lines of text before the box scrolls. */
const MAX_HEIGHT_PX = 168;
const SPEECH_LANG: Record<string, string> = { ar: "ar-SA", en: "en-US", rw: "rw-RW" };

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const noop = () => () => {};

function speechCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * The composer of ChatGPT on iOS: a floating pill with `+` at the start, a
 * textarea that grows to six lines, and at the end a mic while it is empty
 * (dictation, where the browser has it) that turns into the black send button
 * once there is text. Enter sends, Shift+Enter breaks a line.
 */
export function Composer({
  onSend,
  onPlus,
  plusActive = false,
  disabled,
  size = "lg",
  autoFocus,
  canSendEmpty = false,
}: {
  /** Resolves true when the message was accepted; the text is cleared then. */
  onSend: (text: string) => Promise<boolean>;
  /** The `+` button — opens the guided search. Hidden when not given. */
  onPlus?: () => void;
  plusActive?: boolean;
  disabled?: boolean;
  size?: "lg" | "sm";
  autoFocus?: boolean;
  /** Badges are picked, so an empty box can still send. */
  canSendEmpty?: boolean;
}) {
  const dict = useDictionary();
  const a = dict?.agent;
  const c = a?.chat;
  const { locale } = useLocale();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  // Known only in the browser: false on the server, so the mic appears after hydration.
  const speech = useSyncExternalStore(noop, () => !!speechCtor(), () => false);
  // Typing before hydration was lost: React reset the box and the Enter went nowhere
  // (seen on prod, slow phones). Read-only until the page can take the message.
  const ready = useSyncExternalStore(noop, () => true, () => false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  useEffect(() => () => recognition.current?.stop(), []);

  // `field-sizing: content` is not in Safari yet.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const canSend = !disabled && (!!text.trim() || canSendEmpty);
  const submit = async () => {
    if (!canSend) return;
    recognition.current?.stop();
    if (await onSend(text)) setText("");
  };

  const listen = () => {
    if (listening) return recognition.current?.stop();
    const Ctor = speechCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = SPEECH_LANG[locale] ?? "en-US";
    r.interimResults = true;
    r.continuous = false;
    const before = text ? `${text.trimEnd()} ` : "";
    r.onresult = (e) => {
      const said = Array.from(e.results, (res) => res[0]?.transcript ?? "").join("");
      setText(before + said);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  };

  const lg = size === "lg";
  const iconButton = cn("flex shrink-0 items-center justify-center rounded-full transition-colors", lg ? "size-9" : "size-8");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cn(
        "flex items-end gap-1.5 border bg-background shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-shadow focus-within:shadow-[0_2px_16px_rgba(0,0,0,0.1)] dark:shadow-none",
        lg ? "rounded-[26px] p-2" : "rounded-[22px] p-1.5",
      )}
    >
      {onPlus && (
        <button
          type="button"
          onClick={onPlus}
          aria-label={c?.more ?? "Guided search"}
          aria-pressed={plusActive}
          title={c?.more ?? "Guided search"}
          className={cn(iconButton, "text-foreground hover:bg-muted", plusActive && "bg-muted")}
        >
          <Plus className={cn("size-5 transition-transform", plusActive && "rotate-45")} aria-hidden />
        </button>
      )}
      <textarea
        ref={ref}
        data-agent-composer
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void submit();
          }
        }}
        rows={1}
        readOnly={!ready}
        maxLength={600}
        autoFocus={autoFocus}
        enterKeyHint="send"
        placeholder={c?.placeholder ?? "Describe the home you need"}
        aria-label={a?.placeholder ?? "Describe the home you need"}
        className={cn(
          "min-w-0 flex-1 resize-none self-center bg-transparent outline-none placeholder:text-muted-foreground",
          !onPlus && (lg ? "ps-3" : "ps-2.5"),
          lg ? "py-1.5 text-[17px] leading-6 md:text-base" : "py-1 text-[15px]",
        )}
      />
      {!text.trim() && !canSendEmpty && speech ? (
        <button
          type="button"
          onClick={listen}
          disabled={disabled}
          aria-label={listening ? c?.stopVoice ?? "Stop listening" : c?.voice ?? "Speak"}
          aria-pressed={listening}
          className={cn(iconButton, listening ? "bg-foreground text-background" : "text-foreground hover:bg-muted", "disabled:opacity-40")}
        >
          {listening ? <Square className="size-3.5 fill-current" aria-hidden /> : <Mic className="size-5" aria-hidden />}
        </button>
      ) : (
        <button
          type="submit"
          aria-label={a?.send ?? "Send"}
          disabled={!canSend}
          className={cn(iconButton, "bg-foreground text-background disabled:bg-muted disabled:text-muted-foreground")}
        >
          <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
        </button>
      )}
    </form>
  );
}
