/**
 * Guard a DB read that runs inside a statically-rendered (ISR) page.
 *
 * At build time there may be no reachable database, and a throw there fails
 * the whole build — so we fall back to an empty result and let the first
 * revalidation fill the page in.
 *
 * At runtime the opposite is true: swallowing the error would publish an empty
 * page into the cache and serve it for the whole revalidate window. Letting it
 * throw makes Next keep serving the last good render instead.
 */
export async function prerenderSafe<T>(read: Promise<T>, buildFallback: T): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (process.env.NEXT_PHASE === "phase-production-build") return buildFallback;
    throw error;
  }
}
