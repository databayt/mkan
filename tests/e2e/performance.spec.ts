/**
 * Performance smoke — catches obvious regressions without a full Lighthouse run.
 *
 *   - key pages respond to document request within a reasonable time
 *   - DOMContentLoaded fires quickly on dev (warm cache)
 *   - first contentful paint arrives without a hang
 *
 * These thresholds are generous because we run against `next dev` with HMR
 * overhead. In CI against a built server, tighten them.
 */
import { test, expect } from "@playwright/test";
import { waitForPageLoad } from "./helpers";

// Dev builds are slow. These budgets are generous for `next dev`.
const TTFB_BUDGET_MS = 8_000;
const LOAD_BUDGET_MS = 15_000;

const PAGES = ["/en", "/en/listings", "/en/login"];

test.describe("Perf — server response time", () => {
  for (const path of PAGES) {
    test(`${path} document TTFB < ${TTFB_BUDGET_MS}ms (warm)`, async ({
      request,
      page,
    }) => {
      // Warm the turbopack route first
      await page.goto(path);
      await waitForPageLoad(page);

      // Now measure a fresh document fetch
      const start = Date.now();
      const res = await request.get(path);
      const elapsed = Date.now() - start;

      expect(res.status()).toBeLessThan(400);
      expect(
        elapsed,
        `${path} TTFB ${elapsed}ms exceeded ${TTFB_BUDGET_MS}ms`,
      ).toBeLessThan(TTFB_BUDGET_MS);
    });
  }
});

test.describe("Perf — client load time", () => {
  for (const path of PAGES) {
    test(`${path} DOMContentLoaded < ${LOAD_BUDGET_MS}ms (warm)`, async ({
      page,
    }) => {
      // Warm
      await page.goto(path);
      await waitForPageLoad(page);

      // Measure a second navigation after warm.
      const start = Date.now();
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const elapsed = Date.now() - start;

      expect(
        elapsed,
        `${path} DOMContentLoaded ${elapsed}ms exceeded ${LOAD_BUDGET_MS}ms`,
      ).toBeLessThan(LOAD_BUDGET_MS);
    });
  }
});

test.describe("Perf — payload shape", () => {
  test("/en HTML payload is under 500KB (warm)", async ({ request, page }) => {
    await page.goto("/en");
    await waitForPageLoad(page);

    const res = await request.get("/en");
    const text = await res.text();
    const bytes = Buffer.byteLength(text, "utf8");
    expect(
      bytes,
      `HTML size ${bytes}B exceeded 500KB budget`,
    ).toBeLessThan(500 * 1024);
  });
});
