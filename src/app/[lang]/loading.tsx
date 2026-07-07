import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, HeaderSkeleton } from "@/components/atom/skeletons";

export default function RootLoading() {
  return (
    <div className="min-h-screen bg-background">
      <HeaderSkeleton />
      <div className="mx-auto max-w-screen-2xl px-6 py-8 lg:px-12">
        <Skeleton className="mb-6 h-7 w-56" />
        <CardGridSkeleton count={8} />
        <Skeleton className="mb-6 mt-12 h-7 w-64" />
        <CardGridSkeleton count={4} className="hidden sm:grid" />
      </div>
    </div>
  );
}
