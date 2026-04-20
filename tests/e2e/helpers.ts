import { Page } from "@playwright/test";

/**
 * Base URL for the local dev server.
 * Playwright config already sets baseURL, but this is available for helpers
 * that need the full URL outside of page.goto().
 */
export const BASE_URL = "http://localhost:3000";

/**
 * Default timeout for waiting on selectors (ms).
 */
export const DEFAULT_WAIT_TIMEOUT = 10_000;

/**
 * Wait for the page to reach a loaded state by checking for the presence
 * of a meaningful DOM element rather than using arbitrary timeouts.
 *
 * Checks in order:
 * 1. `document.readyState` is "complete"
 * 2. A selector matching the main content area is attached to the DOM
 */
export async function waitForPageLoad(
  page: Page,
  /** Optional CSS selector to wait for. Defaults to `main` or `#main-content` or `body`. */
  selector?: string,
): Promise<void> {
  // Wait for network to settle and DOM to be ready
  await page.waitForLoadState("domcontentloaded");

  const target =
    selector ?? "main, #main-content, [role='main'], body > div";
  await page.locator(target).first().waitFor({
    state: "attached",
    timeout: DEFAULT_WAIT_TIMEOUT,
  });
}

/**
 * Wait for navigation to a URL that matches the given pattern.
 * Replaces `waitForTimeout` after click actions that trigger navigation.
 */
export async function waitForNavigation(
  page: Page,
  urlPattern: string | RegExp,
): Promise<void> {
  await page.waitForURL(urlPattern, { timeout: DEFAULT_WAIT_TIMEOUT });
}

/**
 * Navigate to a locale-prefixed path and wait for the page to load.
 */
export async function gotoWithLocale(
  page: Page,
  path: string,
  locale: "en" | "ar" = "en",
): Promise<void> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  await page.goto(`/${locale}${normalizedPath}`);
  await waitForPageLoad(page);
}
