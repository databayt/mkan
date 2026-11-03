import { cn } from "@/lib/utils";
import type { Health } from "@/lib/monetize/types";

const DOT: Record<Health, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

const PILL: Record<Health, string> = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  yellow: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function HealthBadge({ health, label, className }: { health: Health; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", PILL[health], className)}>
      <span className={cn("size-1.5 rounded-full", DOT[health])} aria-hidden />
      {label}
    </span>
  );
}
