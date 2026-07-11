import { Skeleton } from "@/components/ui/skeleton";

export default function VerifyListingIdLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-5 w-full max-w-md" />
      <Skeleton className="mt-6 aspect-[4/3] w-full rounded-2xl sm:aspect-[16/9]" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-5 w-2/3" />
    </div>
  );
}
