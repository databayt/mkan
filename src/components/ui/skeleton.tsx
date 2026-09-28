import { cn } from "@/lib/utils"

// Deliberate deviation from upstream shadcn: a directional shimmer
// (`animate-shimmer`, globals.css) instead of animate-pulse. The sweep follows
// the reading direction in RTL and stops under reduced motion. Bars are silent;
// the page-level wrapper carries role="status" + the sr-only label.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "animate-shimmer rounded-md bg-gradient-to-r from-accent via-accent/40 to-accent bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
