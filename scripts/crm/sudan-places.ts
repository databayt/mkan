/**
 * Moved to `src/lib/geo/sudan-places.ts`.
 *
 * The gazetteer stopped being a CRM-only concern when the marketplace zone
 * analytics started classifying listing coordinates with it: the app needs
 * `classifyPoint` at request time, and `scripts/` is outside the Next build.
 * Its own header argues it should be the single place that knows what a
 * coordinate is called — so it lives in `src/` now and this re-export keeps
 * every existing CRM import working unchanged.
 */
export * from "@/lib/geo/sudan-places";
