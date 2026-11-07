import { Skeleton } from "@/components/ui/skeleton";

/** /tt while the homes load: the title, the general button and three cards in the shapes the page draws. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-6" aria-busy="true">
      <Skeleton className="h-7 w-48 rounded-full" />
      <Skeleton className="mt-2 h-4 w-64 max-w-full rounded-full" />
      <Skeleton className="mt-4 h-12 w-full rounded-full" />
      <div className="mt-6 space-y-6">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
            <Skeleton className="mt-3 h-5 w-40 rounded-full" />
            <Skeleton className="mt-2 h-4 w-56 max-w-full rounded-full" />
            <Skeleton className="mt-3 h-11 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
