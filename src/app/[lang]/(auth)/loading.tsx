import { Skeleton } from "@/components/ui/skeleton";

// (auth)/layout.tsx already centers children in a max-w-[27rem] column —
// ghost just the auth card.
export default function AuthLoading() {
  return (
    <div className="w-full space-y-4 py-10">
      <Skeleton className="mx-auto h-8 w-40" />
      <Skeleton className="mx-auto h-4 w-56" />
      <Skeleton className="mt-6 h-12 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-11 w-full rounded-full" />
      <Skeleton className="mx-auto h-4 w-48" />
    </div>
  );
}
