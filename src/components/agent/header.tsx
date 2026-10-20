import { cn } from "@/lib/utils";

/**
 * The chat bar of ChatGPT on iOS: an icon at each end and the name in the
 * middle, on a translucent bar whose hairline shows only once the
 * conversation scrolls under it. /find and the side panel share it.
 */
export function ChatHeader({ title, start, end, scrolled }: { title: string; start?: React.ReactNode; end?: React.ReactNode; scrolled: boolean }) {
  return (
    <header
      className={cn(
        "z-10 grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 bg-background/80 px-2 backdrop-blur-md transition-[border-color] supports-[backdrop-filter]:bg-background/70",
        "border-b",
        scrolled ? "border-border" : "border-transparent",
      )}
    >
      <div className="flex items-center gap-0.5 justify-self-start">{start}</div>
      <p className="truncate text-[17px] font-semibold text-foreground">{title}</p>
      <div className="flex items-center gap-0.5 justify-self-end">{end}</div>
    </header>
  );
}

/** The round icon buttons the bar holds. */
export const headerButton =
  "flex size-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-40 [&_svg]:size-5";
