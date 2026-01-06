import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
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
            <Skeleton className="rounded-l-xl" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton />
              <Skeleton className="rounded-tr-xl" />
              <Skeleton />
              <Skeleton className="rounded-br-xl" />
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
