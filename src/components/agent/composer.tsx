"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 200;

/**
 * The pill input of chat assistants: a textarea that grows with its text and a
 * round send button inside the pill. Enter sends, Shift+Enter breaks a line.
 */
export function Composer({
  onSend,
  disabled,
  size = "lg",
  autoFocus,
  canSendEmpty = false,
}: {
  /** Resolves true when the message was accepted; the text is cleared then. */
  onSend: (text: string) => Promise<boolean>;
  disabled?: boolean;
  size?: "lg" | "sm";
  autoFocus?: boolean;
  /** Badges are picked, so an empty box can still send. */
  canSendEmpty?: boolean;
}) {
  const dict = useDictionary();
  const a = dict?.agent;
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  // `field-sizing: content` is not in Safari yet.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const submit = async () => {
    if (disabled || (!text.trim() && !canSendEmpty)) return;
    if (await onSend(text)) setText("");
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cn(
        "flex items-end gap-2 border bg-background shadow-sm transition-shadow focus-within:shadow-md",
        size === "lg" ? "rounded-3xl p-2.5 ps-5" : "rounded-2xl p-1.5 ps-3.5",
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
        maxLength={600}
        autoFocus={autoFocus}
        placeholder={a?.placeholder ?? "Describe the home you need"}
        aria-label={a?.placeholder ?? "Describe the home you need"}
        className={cn(
          "flex-1 resize-none self-center bg-transparent outline-none placeholder:text-muted-foreground",
          size === "lg" ? "py-1.5 text-base" : "py-1 text-sm",
        )}
      />
      <button
        type="submit"
        aria-label={a?.send ?? "Send"}
        disabled={disabled || (!text.trim() && !canSendEmpty)}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-25",
          size === "lg" ? "size-9" : "size-8",
        )}
      >
        <ArrowUp className="size-4" aria-hidden />
      </button>
    </form>
  );
}
