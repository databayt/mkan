/**
 * One correct pass over an Airbnb search result set — shared by the slug
 * scraper (`airbnb-scrape.ts`) and the map crawler (`airbnb-bbox.ts`).
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 *
 * The inline version in `airbnb-scrape.ts` had two bugs that together explain
 * why a 30-region sweep of Sudan added exactly one listing:
 *
 *  1. It stopped when a page contributed no *new* ids (`added === 0`). Under
 *     `--merge` the dedupe map is pre-seeded from the previous run, so page 1
 *     of an already-scraped region is entirely known ids — and the loop broke
 *     before page 2 ever loaded. Every repeat region was effectively
 *     single-page. Global dedupe must never drive loop control; the stop
 *     condition is what *Airbnb* returned, not what was new to us.
 *
 *  2. It indexed `pageCursors[p + 1]` by absolute page number. That only works
 *     if `pageCursors` is a full list in page order; the safe move is to find
 *     the current cursor's position in the list Airbnb just handed back.
 *
 * ── What `paginationInfo` actually means (measured 2026-07-26) ───────────────
 *
 * `pageCursors` is Airbnb's DECLARED page count for the viewport, not a sliding
 * window, and it saturates at 15 pages × 18 results:
 *
 *     whole Sudan     declared 15 pages, 263 unique  → truncated
 *     Khartoum metro  declared  6 pages, 106 unique  → complete
 *     Port Sudan box  declared  1 page,    6 unique  → complete
 *
 * So `declaredPages >= PAGE_CAP` is the test for "this viewport is hiding
 * listings and must be split". `nextPageCursor` was never populated in any
 * observed response, so `pageCursors` is the only way to advance.
 */
import type { Page } from 'playwright';
import { findSearchResults } from './airbnb-parse';

/** Measured 2026-07-26. See `scripts/crm/probe-caps.ts` to re-derive. */
export const PAGE_CAP = 15;
export const RESULTS_PER_PAGE = 18;
export const RESULT_CAP = PAGE_CAP * RESULTS_PER_PAGE;

export type PageOutcome =
  /** Airbnb offered fewer pages than the ceiling and we walked them all. */
  | 'COMPLETE'
  /** Declared page count hit the ceiling — listings remain behind it. */
  | 'SATURATED'
  /** Zero results at all. */
  | 'EMPTY'
  /** Navigation or parse failure; retryable. */
  | 'FAILED';

export interface PaginateResult {
  outcome: PageOutcome;
  /** Every raw search-result element, in the order Airbnb returned them. */
  elements: unknown[];
  pagesFetched: number;
  /** `pageCursors.length` from the last page — Airbnb's declared page count. */
  declaredPages: number;
  error: string | null;
}

export interface PaginateOptions {
  /** Milliseconds to let the page hydrate before reading the deferred state. */
  settleMs?: number;
  /** Milliseconds between page loads. */
  delayMs?: number;
  /** Stop early once this many elements have been collected (0 = no cap). */
  maxElements?: number;
  /** Hard ceiling on pages, for smoke runs. Defaults to PAGE_CAP. */
  maxPages?: number;
  onPage?: (info: { page: number; results: number; declaredPages: number }) => void;
}

async function readDeferredState(page: Page): Promise<unknown> {
  const text = await page.evaluate(() => {
    const s = [...document.querySelectorAll('script')].find((x) => (x.id || '').startsWith('data-deferred-state'));
    return s ? s.textContent : null;
  });
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Append `cursor=` to a URL that may or may not already carry a query string. */
function withCursor(baseUrl: string, cursor: string | undefined): string {
  if (!cursor) return baseUrl;
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}cursor=${encodeURIComponent(cursor)}`;
}

/**
 * Walk every page Airbnb offers for `baseUrl` and return the raw result
 * elements plus a verdict on whether the set was complete or truncated.
 *
 * Deliberately returns raw elements rather than parsed records: the caller
 * decides how to classify them (the map crawler needs each element's own
 * coordinates to tell inside-the-viewport from Airbnb's nearby-injections).
 */
export async function paginateSearch(
  page: Page,
  baseUrl: string,
  opts: PaginateOptions = {},
): Promise<PaginateResult> {
  const settleMs = opts.settleMs ?? 7000;
  const delayMs = opts.delayMs ?? 1200;
  const maxPages = Math.min(opts.maxPages ?? PAGE_CAP, PAGE_CAP);

  const elements: unknown[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  let declaredPages = 0;
  let pagesFetched = 0;

  for (let p = 0; p < maxPages; p++) {
    let json: unknown;
    try {
      await page.goto(withCursor(baseUrl, cursor), { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(settleMs);
      json = await readDeferredState(page);
    } catch (e) {
      return {
        outcome: 'FAILED',
        elements,
        pagesFetched,
        declaredPages,
        error: `page ${p + 1}: ${(e as Error).message}`,
      };
    }

    const found = json ? findSearchResults(json) : null;
    if (!found) {
      // Page 1 with no results object is an empty viewport; later on it is a
      // parse failure worth retrying, since we know results existed before.
      return p === 0
        ? { outcome: 'EMPTY', elements, pagesFetched, declaredPages, error: null }
        : { outcome: 'FAILED', elements, pagesFetched, declaredPages, error: `page ${p + 1}: no searchResults` };
    }

    pagesFetched++;
    elements.push(...found.searchResults);

    const cursors = found.paginationInfo?.pageCursors;
    const cursorList: string[] = Array.isArray(cursors) ? cursors.filter((c): c is string => typeof c === 'string') : [];
    declaredPages = Math.max(declaredPages, cursorList.length);
    opts.onPage?.({ page: p + 1, results: found.searchResults.length, declaredPages });

    if (found.searchResults.length === 0) break;
    if (opts.maxElements && elements.length >= opts.maxElements) break;

    // Advance by locating the current cursor in the list Airbnb just returned,
    // rather than trusting an absolute page index.
    const idx = cursor ? cursorList.indexOf(cursor) : 0;
    const next = idx >= 0 ? cursorList[idx + 1] : undefined;
    if (typeof next !== 'string' || seenCursors.has(next)) break;
    seenCursors.add(next);
    cursor = next;
    await sleep(delayMs);
  }

  const outcome: PageOutcome =
    elements.length === 0 ? 'EMPTY' : declaredPages >= PAGE_CAP ? 'SATURATED' : 'COMPLETE';
  return { outcome, elements, pagesFetched, declaredPages, error: null };
}
