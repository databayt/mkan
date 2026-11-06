/** While the numbers load (a cold render reads ~70 queries): the page's shape, not a blank screen. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1184px] px-6 pb-28 pt-6 md:px-8" aria-busy="true">
      <div className="h-7 w-64 animate-pulse rounded bg-muted" />
      <div className="mt-3 h-4 w-80 animate-pulse rounded bg-muted" />
      <div className="mt-8 h-28 animate-pulse rounded-2xl bg-muted" />
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-[1fr_372px]">
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="hidden h-80 animate-pulse rounded-2xl bg-muted md:block" />
      </div>
    </div>
  );
}
