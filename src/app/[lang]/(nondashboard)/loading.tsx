import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, HeaderSkeleton } from "@/components/atom/skeletons";

export default function LoadingPage() {
  return (
    <div className="min-h-screen bg-background">
      <HeaderSkeleton />
      <div className="mx-auto max-w-screen-2xl px-6 py-8 lg:px-12">
        <Skeleton className="mb-10 h-64 w-full rounded-3xl sm:h-80" />
        <Skeleton className="mb-6 h-7 w-56" />
        <CardGridSkeleton count={8} />
      </div>
    </div>
  );
}
