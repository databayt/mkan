import { cn } from "@/lib/utils";

/**
 * The page's few layout pieces, in the Airbnb manner the rest of mkan follows:
 * generous whitespace, one hairline between sections, rounded-2xl surfaces,
 * large numbers with quiet labels under them.
 */
export function Section({ id, title, desc, aside, children, className }: { id?: string; title: React.ReactNode; desc?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-28 border-t py-10 first:border-t-0 first:pt-0 sm:py-12", className)}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl space-y-1.5">
          <h2 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h2>
          {desc && <p className="text-[15px] leading-relaxed text-muted-foreground">{desc}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Surface({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border bg-card p-5 sm:p-6", className)}>{children}</div>;
}

export function Stat({ label, value, sub, tone, big }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "pos" | "neg"; big?: boolean }) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "font-semibold tabular-nums tracking-tight text-foreground",
          big ? "text-[28px] leading-9 sm:text-[32px]" : "text-lg",
          tone === "pos" && "text-emerald-600 dark:text-emerald-500",
          tone === "neg" && "text-destructive",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{label}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Chip({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground/80", className)}>{children}</span>;
}

/** A label/value row with a dotted leader feel, like a price breakdown. */
export function Row({ label, value, strong, hint }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; hint?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2.5", strong && "border-t pt-4 font-semibold")}>
      <div className="min-w-0">
        <p className={cn("text-[15px]", strong ? "text-foreground" : "text-foreground/90")}>{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <p className="text-foreground shrink-0 tabular-nums">{value}</p>
    </div>
  );
}
