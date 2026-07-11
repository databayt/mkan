import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, HeaderSkeleton } from "@/components/atom/skeletons";

export default function LoadingPage() {
  return (
    <div className="min-h-screen bg-background">
      <HeaderSkeleton />
      <div className="mx-auto max-w-screen-2xl px-6 py-8 lg:px-12">
        {/* Big-search pill ghost */}
        <Skeleton className="mx-auto mb-10 h-16 w-full max-w-3xl rounded-full" />
        <Skeleton className="mb-6 h-7 w-56" />
        <CardGridSkeleton
          count={6}
          className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        />
      </div>
    </div>
  );
}
