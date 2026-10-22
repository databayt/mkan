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
  onerror: ((e: { error: string }) => void) | null;
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
 * The composer of ChatGPT on iOS: a grey round `+` beside a grey pill whose
 * textarea grows to six lines. Inside the pill's end sit the mic (dictation
 * into the box, where the browser has it) and one black round button: send,
 * or a stop square while a turn runs. Enter sends, Shift+Enter breaks a line.
 */
export function Composer({
  onSend,
  onPlus,
  plusActive = false,
  disabled,
  busy = false,
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
  /** A turn is running: the black button shows ChatGPT's stop square. */
  busy?: boolean;
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
  const [voiceError, setVoiceError] = useState<string | null>(null);
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
    // A denied mic or a missing language used to end in silence; say what happened.
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "aborted") return;
      setVoiceError(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? c?.voiceDenied ?? "Allow the microphone to speak your search."
          : e.error === "no-speech"
            ? c?.voiceNoSpeech ?? "Didn't hear anything. Tap the mic and speak."
            : c?.voiceFailed ?? "Voice isn't working here. Please type instead.",
      );
    };
    recognition.current = r;
    setVoiceError(null);
    setListening(true);
    try {
      r.start();
    } catch {
      setListening(false);
    }
  };

  const lg = size === "lg";
  const round = cn("flex shrink-0 items-center justify-center rounded-full transition-colors", lg ? "size-10" : "size-8");
  const black = cn(round, "bg-foreground text-background");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cn("flex flex-wrap items-end", lg ? "gap-x-2" : "gap-x-1.5")}
    >
      {onPlus && (
        <button
          type="button"
          onClick={onPlus}
          aria-label={c?.more ?? "Guided search"}
          aria-pressed={plusActive}
          title={c?.more ?? "Guided search"}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70",
            lg ? "size-[52px]" : "size-10",
            plusActive && "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          <Plus className={cn("transition-transform", lg ? "size-6" : "size-5", plusActive && "rotate-45")} strokeWidth={1.75} aria-hidden />
        </button>
      )}
      <div
        className={cn(
          "flex min-w-0 flex-1 items-end gap-1 bg-muted transition-shadow focus-within:ring-1 focus-within:ring-border",
          lg ? "min-h-[52px] rounded-[26px] p-1.5 ps-5" : "min-h-10 rounded-[20px] p-1 ps-3.5",
        )}
      >
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
            lg ? "py-1.5 text-[17px] leading-6 md:text-base" : "py-1 text-[15px]",
          )}
        />
        {speech && !busy && (
          <button
            type="button"
            onClick={listen}
            disabled={disabled}
            aria-label={listening ? c?.stopVoice ?? "Stop listening" : c?.voice ?? "Speak"}
            aria-pressed={listening}
            title={listening ? c?.stopVoice ?? "Stop listening" : c?.voice ?? "Speak"}
            className={cn(round, listening ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground", "disabled:opacity-40")}
          >
            {listening ? <Square className={cn("animate-pulse fill-current", lg ? "size-3.5" : "size-3")} aria-hidden /> : <Mic className={lg ? "size-[22px]" : "size-5"} aria-hidden />}
          </button>
        )}
        {busy ? (
          // The turn runs on the server and cannot be cut short; the square only marks it, as ChatGPT's does.
          <span role="status" aria-label={a?.reply?.working ?? "Working"} className={black}>
            <Square className={cn("fill-current", lg ? "size-3.5" : "size-3")} aria-hidden />
          </span>
        ) : (
          <button type="submit" aria-label={a?.send ?? "Send"} disabled={!canSend} className={cn(black, "disabled:bg-foreground/20")}>
            <ArrowUp className={lg ? "size-5" : "size-4"} strokeWidth={2.5} aria-hidden />
          </button>
        )}
      </div>
      {voiceError && (
        <p role="alert" className="basis-full pt-1.5 text-center text-xs text-muted-foreground">
          {voiceError}
        </p>
      )}
    </form>
  );
}
