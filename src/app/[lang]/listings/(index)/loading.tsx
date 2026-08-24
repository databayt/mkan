import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton, HeaderSkeleton } from "@/components/atom/skeletons";

export default function ListingsLoading() {
  return (
    <div className="min-h-screen bg-background">
      <HeaderSkeleton />
      {/* Category-tabs row of the listings header. */}
      <div className="flex items-center gap-8 overflow-hidden border-b px-6 py-4 lg:px-12">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="px-6 py-8 lg:px-12">
        <CardGridSkeleton count={12} />
      </div>
    </div>
  );
}
