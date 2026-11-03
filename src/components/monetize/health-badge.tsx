import { cn } from "@/lib/utils";
import type { Health } from "@/lib/monetize/types";

const TONE: Record<Health, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-destructive",
  unknown: "bg-muted-foreground/40",
};

export function HealthBadge({ health, label, className }: { health: Health; label: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      <span className={cn("size-2 rounded-full", TONE[health])} aria-hidden />
      {label}
    </span>
  );
}
