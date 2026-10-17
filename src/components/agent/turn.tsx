import Image from "next/image";
import { cn } from "@/lib/utils";

/** The user's turn: a filled bubble at the end side, as in the assistant apps. */
export function UserTurn({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <li className="flex justify-end">
      <p
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-3xl bg-muted",
          compact ? "px-3.5 py-2 text-sm" : "px-4 py-2.5",
        )}
      >
        {text}
      </p>
    </li>
  );
}

/** The agent's turn: no bubble — an avatar, its steps, then plain text and content. */
export function AgentTurn({ steps, children, compact = false }: { steps?: React.ReactNode; children?: React.ReactNode; compact?: boolean }) {
  return (
    <li className={cn("flex gap-3", compact && "gap-2 text-sm")}>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border bg-background",
          compact ? "size-6" : "size-8",
        )}
      >
        <Image src="/logo.svg" alt="" width={14} height={14} className={compact ? "size-3" : "size-3.5"} />
      </span>
      <div className="min-w-0 flex-1 space-y-2 pt-1">
        {steps}
        {children}
      </div>
    </li>
  );
}
