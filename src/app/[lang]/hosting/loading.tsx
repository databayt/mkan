import { Skeleton } from "@/components/ui/skeleton";
import { CardGridSkeleton } from "@/components/atom/skeletons";

// Header + bottom nav come from hosting/layout.tsx — ghost the content only.
export default function HostingLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <Skeleton className="h-8 w-64" />
      <CardGridSkeleton
        count={6}
        className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      />
    </div>
  );
}
