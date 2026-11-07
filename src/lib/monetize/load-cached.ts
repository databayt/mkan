import "server-only";

import { unstable_cache } from "next/cache";

import { loadMonetize, type MonetizeOverview } from "./load";

/**
 * /monetize's numbers, shared by every viewer for 60 s. A render costs about 70 queries and every
 * open tab refreshes once a minute (prompt-card.tsx), so each viewer used to cost its own 70 a minute.
 * What is per viewer stays outside: auth() and the public redaction (page.tsx). The admin writes
 * invalidate the tag (monetize-actions.ts); the Mac's writes show within the minute.
 *
 * Not inside load.ts: the Mac's sprint scripts call loadMonetize under tsx, where unstable_cache
 * throws. The result goes through JSON on a miss too, so a hit and a miss are the same shape.
 */
export const MONETIZE_TAG = "monetize";

export const loadMonetizeCached = unstable_cache(
  async (days: 7 | 30): Promise<MonetizeOverview> => JSON.parse(JSON.stringify(await loadMonetize(days))) as MonetizeOverview,
  ["monetize-v4"],
  { revalidate: 60, tags: [MONETIZE_TAG] },
);
