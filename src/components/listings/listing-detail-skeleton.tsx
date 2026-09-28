import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonStatus } from "@/components/atom/skeletons";

/**
 * The listing detail skeleton.
 *
 * This used to be `listings/[id]/loading.tsx`. A `loading.tsx` wraps its
 * segment in a Suspense boundary, and Next flushes that boundary's shell with
 * a 200 before the page component runs — which means the page's `notFound()`
 * and `permanentRedirect()` could never set a status (mkan#53). Now it is a
 * plain component the page renders as its own Suspense fallback, *after* the
 * guard has had its chance to 404 or redirect.
 */
export default function ListingDetailSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Layout */}
      <div className="hidden md:block mx-14">
        {/* Header skeleton */}
        <div className="sticky top-0 z-50 border-b bg-muted -mx-14 px-4 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-10 w-64 rounded-full" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>

        {/* Content skeleton */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Title */}
          <Skeleton className="h-8 w-96 mb-2" />
          <Skeleton className="h-5 w-64 mb-6" />

          {/* Image gallery skeleton */}
          <div className="grid grid-cols-2 gap-2 h-[320px] mb-8">
            <Skeleton className="rounded-s-xl" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton />
              <Skeleton className="rounded-se-xl" />
              <Skeleton />
              <Skeleton className="rounded-ee-xl" />
            </div>
          </div>

          {/* Content grid */}
          <div className="flex gap-20">
            <div className="flex-1 max-w-2xl space-y-6">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
            <div className="w-80">
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden">
        {/* Image skeleton */}
        <Skeleton className="w-full h-[50vh]" />

        {/* Content skeleton */}
        <div className="px-4 py-6 space-y-6">
          <div>
            <Skeleton className="h-7 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>

          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/*
 * Section fallbacks for the Suspense boundaries INSIDE the listing page (below
 * its notFound()/permanentRedirect() guard — mkan#53). Each draws its section's
 * real box so nothing shifts when it lands. Never promote these to a
 * listings/[id]/loading.tsx.
 */

/** Desktop "Where you'll be" (listings/map.tsx): heading, 480px map, place lines. */
export function MapSectionSkeleton({ label }: { label?: string }) {
  return (
    <SkeletonStatus label={label} className="py-12">
      <Skeleton className="mb-6 h-[26px] w-48" />
      <Skeleton className="mb-6 h-[480px] w-full rounded-[20px]" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </SkeletonStatus>
  );
}

/** Mobile hero strip + overview (mobile-listing-details.tsx). */
export function MobileDetailsSkeleton({ label }: { label?: string }) {
  return (
    <SkeletonStatus label={label}>
      <Skeleton className="aspect-[100/95] w-full rounded-none" />
      <div className="px-6 py-8 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/5" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </SkeletonStatus>
  );
}

/** Mobile "Where you'll be" (mobile-map.tsx): heading, place line, 420px map. */
export function MobileMapSkeleton({ label }: { label?: string }) {
  return (
    <SkeletonStatus label={label} className="md:hidden px-6 py-8">
      <Skeleton className="h-[26px] w-48" />
      <Skeleton className="mt-2 h-4 w-40" />
      <Skeleton className="mt-4 h-[420px] w-full rounded-[16px]" />
    </SkeletonStatus>
  );
}

/** Mobile reviews (mobile-reviews.tsx): heading + a swipe row of review cards. */
export function MobileReviewsSkeleton({ label }: { label?: string }) {
  return (
    <SkeletonStatus label={label} className="md:hidden px-6 pt-8 pb-6">
      <Skeleton className="mb-6 h-[26px] w-40" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="w-[85%] shrink-0 space-y-3 rounded-xl border p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="flex items-center gap-3 pt-2">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonStatus>
  );
}
