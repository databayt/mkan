import {
  HeroSectionSkeleton,
  PropertyFilterSkeleton,
  ListingCarouselSkeleton,
} from "@/components/atom/skeletons";

export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-background">
      <HeroSectionSkeleton />
      
      <div className="sticky top-0 z-40 bg-white border-b">
        <div className="layout-container">
          <PropertyFilterSkeleton />
        </div>
      </div>

      <div className="layout-container py-8">
        <div className="space-y-12">
          <ListingCarouselSkeleton />
          <ListingCarouselSkeleton />
          <ListingCarouselSkeleton />
        </div>
      </div>
    </div>
  );
}
