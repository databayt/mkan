import { Skeleton } from "@/components/ui/skeleton";

/**
 * /find while the visitor's task loads (the page reads its cookie, so it is
 * dynamic): the chat bar, the greeting's place and the composer pill, in the
 * shapes the page draws so nothing jumps when it arrives.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col bg-background" aria-busy="true">
      <div className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-2">
        <Skeleton className="ms-2 size-6 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full" />
        <Skeleton className="me-2 size-6 justify-self-end rounded-full" />
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <Skeleton className="h-8 w-72 max-w-full rounded-full" />
      </div>
      <div className="mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),10px)] sm:px-4">
        <div className="h-[54px] rounded-[26px] border bg-background" />
        <Skeleton className="mx-auto mt-2 h-3 w-56 rounded-full" />
      </div>
    </div>
  );
}
