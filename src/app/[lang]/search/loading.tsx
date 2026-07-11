import { Skeleton } from "@/components/ui/skeleton";
import { CardSkeleton, HeaderSkeleton } from "@/components/atom/skeletons";

export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-background">
      <HeaderSkeleton />
      {/* Same 638px results / fluid map split as search-results-area.tsx, so
          the real page lands without a layout shift. */}
      {/* i18n-exempt — layout CSS, not user-facing copy */}
      <style>{`@media(min-width:1024px){[data-search-skeleton]{grid-template-columns:638px minmax(0,1fr);column-gap:48px}}`}</style>
      <div className="px-6 lg:px-12">
        <div data-search-skeleton className="grid grid-cols-1">
          <div>
            <div className="flex items-center justify-between pb-5 pt-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="hidden h-5 w-48 sm:block" />
            </div>
            <div className="grid grid-cols-1 gap-x-4 gap-y-10 pb-12 sm:grid-cols-2 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          </div>
          {/* Map pane ghost — desktop only, pinned like the real map. */}
          <div className="hidden lg:block">
            <div className="sticky" style={{ top: 64, height: "calc(100vh - 64px)" }}>
              <Skeleton className="h-full w-full rounded-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
