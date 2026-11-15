/**
 * Pure rules for the Airbnb refresh loop (listings-refresh.ts) — no I/O.
 *
 * Three decisions live here so they can be tested without a browser or a DB:
 * who is checked today, when a home is really gone, and what actually changed.
 */

export interface SliceRow {
  id: string | number;
  sourceCapturedAt: Date | null;
}

/**
 * Today's slice, oldest check first (never-checked homes lead), sized so the
 * whole set is visited within `days`: ceil(total / days), capped by `cap`.
 */
export function pickSlice<T extends SliceRow>(rows: T[], _now: Date, opts: { days?: number; cap?: number } = {}): T[] {
  const days = Math.max(1, opts.days ?? 7);
  const size = Math.ceil(rows.length / days);
  const n = opts.cap != null ? Math.min(size, Math.max(0, opts.cap)) : size;
  return [...rows]
    .sort((a, b) => (a.sourceCapturedAt?.getTime() ?? -Infinity) - (b.sourceCapturedAt?.getTime() ?? -Infinity) || String(a.id).localeCompare(String(b.id)))
    .slice(0, n);
}

export type FetchResult =
  | { kind: 'ok' }
  | { kind: 'unavailable' } // the page says it is not available
  | { kind: 'not-found' } // 404
  | { kind: 'blocked' } // 403 / 429 / captcha — says nothing about the home
  | { kind: 'error'; message?: string }; // network, parse — says nothing either

export interface GoneVerdict {
  misses: number;
  /** true only on the second consecutive miss */
  gone: boolean;
}

/** Gone only after two consecutive "not available"/404 results. Anything that
 *  is not a clean ok/miss (blocked, error) leaves the count where it was. */
export function goneVerdict(prev: { misses: number }, res: FetchResult): GoneVerdict {
  if (res.kind === 'ok') return { misses: 0, gone: false };
  if (res.kind === 'unavailable' || res.kind === 'not-found') {
    const misses = prev.misses + 1;
    return { misses, gone: misses >= 2 };
  }
  return { misses: prev.misses, gone: false };
}

export interface Fields {
  pricePerNight: number | null;
  photoUrls: string[];
  averageRating: number | null;
  numberOfReviews: number | null;
  title: string | null;
  description: string | null;
}

export const MIN_PHOTOS = 3;

const nonEmpty = (s: string | null | undefined): s is string => !!s && s.trim().length > 0;
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Only what changed. A fresh value that is missing/empty never overwrites;
 *  photos change only when the fresh gallery keeps at least MIN_PHOTOS. */
export function diffFields(old: Partial<Fields>, fresh: Partial<Fields>): Partial<Fields> {
  const out: Partial<Fields> = {};
  if (fresh.pricePerNight != null && fresh.pricePerNight > 0 && fresh.pricePerNight !== old.pricePerNight) out.pricePerNight = fresh.pricePerNight;
  if (fresh.photoUrls && fresh.photoUrls.length >= MIN_PHOTOS && !sameList(fresh.photoUrls, old.photoUrls ?? [])) out.photoUrls = fresh.photoUrls;
  if (fresh.averageRating != null && fresh.averageRating !== old.averageRating) out.averageRating = fresh.averageRating;
  if (fresh.numberOfReviews != null && fresh.numberOfReviews !== old.numberOfReviews) out.numberOfReviews = fresh.numberOfReviews;
  if (nonEmpty(fresh.title) && fresh.title !== old.title) out.title = fresh.title;
  if (nonEmpty(fresh.description) && fresh.description !== old.description) out.description = fresh.description;
  return out;
}

/** Airbnb's photo identity is the file name, not the host/size query. */
export const isAirbnbPhoto = (u: string) => /muscache\.com/i.test(u);
