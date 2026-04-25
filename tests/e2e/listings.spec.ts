/**
 * Listings browse + detail — the central rental catalog.
 *
 * Asserts:
 *   - /en/listings renders a catalog container
 *   - filters don't crash the page
 *   - an individual listing detail page renders
 *   - /ar/listings renders with RTL direction
 *
 * These tests tolerate an empty DB — they assert structural invariants
 * (no server error, URL params preserved) rather than specific card counts.
 */
import { test, expect } from "@playwright/test";
import {
  waitForPageLoad,
  expectNoServerError,
  collectConsoleErrors,
  isSignificantConsoleError,
} from "./helpers";

test.describe("Listings — browse", () => {
  test("/en/listings renders without a server error", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/en/listings");
    await waitForPageLoad(page);

    await expectNoServerError(page);
    await expect(page.locator("body")).toBeVisible();
    expect(errors.filter(isSignificantConsoleError)).toEqual([]);
  });

  test("/en/listings responds with HTTP 200", async ({ page }) => {
    const response = await page.goto("/en/listings");
    expect(response?.status()).toBeLessThan(400);
  });

  test("/ar/listings renders with dir=rtl", async ({ page }) => {
    await page.goto("/ar/listings");
    await waitForPageLoad(page);

    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
  });

  test("listing cards link to /listings/:id", async ({ page }) => {
    await page.goto("/en/listings");
    await waitForPageLoad(page);

    // Wait briefly for async cards to render
    await page.waitForTimeout(800);

    const cards = page.locator('a[href*="/listings/"][href*="/en/"]');
    const count = await cards.count();

    if (count === 0) {
      test.skip(true, "No listings rendered — likely no published listings in DB");
      return;
    }

    const first = cards.first();
    const href = await first.getAttribute("href");
    expect(href).toMatch(/\/listings\/\d+/);
  });
});

test.describe("Listings — filters", () => {
  test("price range filter params don't crash", async ({ page }) => {
    await page.goto("/en/listings?priceMin=50&priceMax=500");
    await waitForPageLoad(page);
    await expectNoServerError(page);
    expect(page.url()).toContain("priceMin=50");
  });

  test("beds filter param doesn't crash", async ({ page }) => {
    await page.goto("/en/listings?beds=2");
    await waitForPageLoad(page);
    await expectNoServerError(page);
  });

  test("invalid price values (negative) are rejected gracefully", async ({ page }) => {
    await page.goto("/en/listings?priceMin=-100&priceMax=abc");
    await waitForPageLoad(page);
    await expectNoServerError(page);
  });

  test("absurdly large price values are clamped or rejected without 500", async ({ page }) => {
    await page.goto("/en/listings?priceMin=999999999999&priceMax=999999999999");
    await waitForPageLoad(page);
    await expectNoServerError(page);
  });

  test("propertyType filter accepted", async ({ page }) => {
    await page.goto("/en/listings?propertyType=Apartment");
    await waitForPageLoad(page);
    await expectNoServerError(page);
  });

  test("amenities (comma list) accepted", async ({ page }) => {
    await page.goto("/en/listings?amenities=WiFi,Parking");
    await waitForPageLoad(page);
    await expectNoServerError(page);
  });
});

test.describe("Listings — detail page", () => {
  test("detail page renders for a real listing id", async ({ page, request }) => {
    // First check how many published listings exist via the public API.
    const apiRes = await request.get("/api/listings/published");
    if (apiRes.status() !== 200) {
      test.skip(true, `API /api/listings/published returned ${apiRes.status()}`);
      return;
    }

    const listings = (await apiRes.json()) as Array<{ id: number }>;
    if (!Array.isArray(listings) || listings.length === 0) {
      test.skip(true, "No published listings in DB");
      return;
    }

    const id = listings[0].id;
    await page.goto(`/en/listings/${id}`);
    await waitForPageLoad(page);
    await expectNoServerError(page);

    // The page title should still contain the site name — SSR didn't fail.
    await expect(page).toHaveTitle(/Mkan|مكان/i);
  });

  test("detail page for non-existent id shows a 404 or graceful not-found", async ({ page }) => {
    await page.goto("/en/listings/99999999");
    await waitForPageLoad(page);

    const body = await page.locator("body").innerText();
    // Either a dedicated 404 page OR an empty-state — both acceptable.
    // What must NOT happen is a raw 500/server error.
    expect(body).not.toMatch(/500\s*[-:]\s*internal server error|prisma/i);
  });
});

test.describe("Listings — photos route", () => {
  test("/listings/:id/photos reachable for a real listing", async ({ page, request }) => {
    const apiRes = await request.get("/api/listings/published");
    if (apiRes.status() !== 200) {
      test.skip(true, "API unreachable");
      return;
    }
    const listings = (await apiRes.json()) as Array<{ id: number }>;
    if (!listings || listings.length === 0) {
      test.skip(true, "No listings");
      return;
    }

    await page.goto(`/en/listings/${listings[0].id}/photos`);
    await waitForPageLoad(page);
    await expectNoServerError(page);
  });
});
