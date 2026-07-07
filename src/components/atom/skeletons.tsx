import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Airbnb-pattern loading placeholders. Every route's loading.tsx paints a
 * content-shaped ghost of its real page — image blocks + text lines in the
 * page's own grid — instead of a fullscreen spinner, so navigation feels like
 * the page assembling in place. Compose these; keep each loading.tsx thin.
 */

/** One listing-card ghost — 4:3 image at the ImageCarousel's 20px radius + 3 lines. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="aspect-[4/3] w-full rounded-[20px]" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
    </div>
  );
}

/** Card grid ghost — defaults to the /listings grid; override cols via className. */
export function CardGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4",
        className
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Site-header ghost: logo · center search pill · avatar cluster. */
export function HeaderSkeleton({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "flex h-20 items-center justify-between border-b px-6 lg:px-12",
        className
      )}
    >
      <Skeleton className="h-8 w-8 rounded-full sm:w-24" />
      <Skeleton className="hidden h-12 w-72 rounded-full md:block" />
      <div className="flex items-center gap-3">
        <Skeleton className="hidden h-9 w-20 rounded-full lg:block" />
        <Skeleton className="h-9 w-9 rounded-full" />
      </div>
    </header>
  );
}

/** Dashboard/table ghost: title row + header bar + avatar-and-lines rows. */
export function TableSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <div className="border-b bg-muted/40 p-4">
          <Skeleton className="h-5 w-1/3" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b p-4 last:border-b-0">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="hidden h-8 w-20 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Host-onboarding wizard ghost: slim top bar, centered question, footer nav. */
export function WizardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex h-20 items-center justify-between px-6 lg:px-12">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-6 py-8">
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-6 aspect-[4/3] w-full rounded-2xl sm:aspect-[16/9]" />
      </div>
      <div className="border-t px-6 py-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-16" />
          <Skeleton className="h-11 w-24 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Category icon bar loading ghost. */
export function PropertyFilterSkeleton() {
  return (
    <div className="w-full">
      {/* Desktop Layout */}
      <div className="hidden md:flex items-start justify-between py-1">
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className="flex flex-col items-center flex-1 py-1">
            <div className="flex items-center justify-center w-12 h-12">
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
            <Skeleton className="h-3 w-10 mt-1" />
          </div>
        ))}
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden -mx-3 overflow-x-auto no-scrollbar">
        <div className="flex w-max px-3">
          {Array.from({ length: 11 }, (_, i) => (
            <div key={i} className="flex flex-col items-center shrink-0 px-2 py-1">
              <div className="flex items-center justify-center w-12 h-12">
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
              <Skeleton className="h-3 w-10 mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Horizontal listing carousel loading ghost. */
export function ListingCarouselSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("w-full", className)}>
      <Skeleton className="h-7 w-56 mb-6" />
      <div className="flex -ms-4 overflow-hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="ps-4 basis-[85%] sm:basis-1/2 lg:basis-1/4 shrink-0"
          >
            <CardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full-viewport Hero image and Search Form loading ghost. */
export function HeroSectionSkeleton() {
  return (
    <div className="relative h-screen w-full overflow-hidden bg-accent/20 animate-pulse">
      {/* Transparent Navbar Overlay */}
      <HeaderSkeleton className="absolute top-0 start-0 w-full z-50 border-b-0 bg-transparent" />

      {/* Booking Form (Vertical Search) Card */}
      {/* Mobile view */}
      <div className="md:hidden absolute top-[53%] start-4 transform -translate-y-1/2 z-20 w-[calc(100%-2rem)]">
        <div 
          className="relative bg-white w-full overflow-hidden px-6 pt-9 pb-24 shadow-sm flex flex-col justify-between"
          style={{ height: "min(78vh, 560px)" }}
        >
          <div>
            <div className="space-y-2 mb-7">
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-7 w-1/2" />
            </div>

            <div className="space-y-5">
              <div>
                <Skeleton className="h-3 w-16 mb-1.5" />
                <Skeleton className="w-full h-14 border border-gray-100 rounded-xs animate-none bg-gray-100" />
              </div>
              <div>
                <div className="grid grid-cols-2">
                  <Skeleton className="h-3 w-16 mb-1.5" />
                  <Skeleton className="h-3 w-16 mb-1.5" />
                </div>
                <div className="flex border border-gray-100 rounded-xs overflow-hidden">
                  <Skeleton className="flex-1 h-14 rounded-none border-r border-gray-100 animate-none bg-gray-100" />
                  <Skeleton className="flex-1 h-14 rounded-none animate-none bg-gray-100" />
                </div>
              </div>
              <div>
                <Skeleton className="h-3 w-16 mb-1.5" />
                <Skeleton className="w-full h-14 border border-gray-100 rounded-xs animate-none bg-gray-100" />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Skeleton className="w-24 h-12 rounded-sm" />
          </div>
        </div>
      </div>

      {/* Desktop view */}
      <div className="hidden md:block absolute top-[46%] start-8 transform -translate-y-1/2 z-20 w-[340px]">
        <div className="bg-white px-5 py-6 shadow-sm flex flex-col gap-4">
          <div className="space-y-1.5 mb-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-1/2" />
          </div>
          <div>
            <Skeleton className="h-3 w-12 mb-1" />
            <Skeleton className="w-full h-12 border border-gray-100 rounded-xs animate-none bg-gray-100" />
          </div>
          <div>
            <div className="grid grid-cols-2">
              <Skeleton className="h-3 w-12 mb-1" />
              <Skeleton className="h-3 w-12 mb-1" />
            </div>
            <div className="flex border border-gray-100 rounded-xs overflow-hidden">
              <Skeleton className="flex-1 h-12 rounded-none border-r border-gray-100 animate-none bg-gray-100" />
              <Skeleton className="flex-1 h-12 rounded-none animate-none bg-gray-100" />
            </div>
          </div>
          <div>
            <Skeleton className="h-3 w-12 mb-1" />
            <Skeleton className="w-full h-12 border border-gray-100 rounded-xs animate-none bg-gray-100" />
          </div>
          <div className="pt-2 flex justify-end">
            <Skeleton className="w-24 h-10 rounded-xs" />
          </div>
        </div>
      </div>
    </div>
  );
}
