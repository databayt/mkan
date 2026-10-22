import { cn } from "@/lib/utils";

/**
 * The chat bar of ChatGPT on iOS: ☰ at the start with the name beside it,
 * new chat and ⋯ at the end, on a translucent bar whose hairline shows only
 * once the conversation scrolls under it. /find and the side panel share it.
 */
export function ChatHeader({ title, start, end, scrolled }: { title: string; start?: React.ReactNode; end?: React.ReactNode; scrolled: boolean }) {
  return (
    <header
      className={cn(
        "z-10 flex h-14 shrink-0 items-center gap-1 bg-background/80 px-2 backdrop-blur-md transition-[border-color] supports-[backdrop-filter]:bg-background/70",
        "border-b",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="flex shrink-0 items-center gap-0.5">{start}</div>
      <p className="min-w-0 flex-1 truncate ps-1 text-[18px] font-medium text-foreground">{title}</p>
      <div className="flex shrink-0 items-center gap-0.5">{end}</div>
    </header>
  );
}

/** The round icon buttons the bar holds. */
export const headerButton =
  "flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-40 [&_svg]:size-[22px]";

/** ChatGPT's ☰: two strokes, the lower one shorter — lucide has no such glyph. */
export function MenuGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden className={cn("rtl:-scale-x-100", className)}>
      <path d="M3.5 8.5h17M3.5 15.5h10" />
    </svg>
  );
}
