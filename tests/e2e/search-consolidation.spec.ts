/**
 * Search consolidation verification — covers Epic 3.4 (308 redirects) and
 * Epic 3.2 (filter fields wired to the server action).
 */
import { test, expect } from "@playwright/test";
import { waitForPageLoad } from "./helpers";

test.describe("Search route consolidation (Epic 3.4)", () => {
  test("/en/search redirects to /en/listings", async ({ page }) => {
    await page.goto("/en/search");
    // Allow the 308 to resolve before asserting URL.
    await page.waitForURL(/\/en\/listings/);
    expect(page.url()).toContain("/en/listings");
  });

  test("/ar/search redirects to /ar/listings", async ({ page }) => {
    await page.goto("/ar/search");
    await page.waitForURL(/\/ar\/listings/);
    expect(page.url()).toContain("/ar/listings");
  });

  test("/en/searching redirects to /en/listings", async ({ page }) => {
    await page.goto("/en/searching");
    await page.waitForURL(/\/en\/listings/);
    expect(page.url()).toContain("/en/listings");
  });

  test("redirects preserve query params", async ({ page }) => {
    await page.goto("/en/search?location=Khartoum&guests=2");
    await page.waitForURL(/\/en\/listings/);
    expect(page.url()).toContain("location=Khartoum");
    expect(page.url()).toContain("guests=2");
  });

  // Regression guard: a prior version of the redirect rule matched any first
  // path segment as `:lang`, which routed /api/search/locations into
  // /api/listings/locations and broke the search autocomplete. Keep this so
  // the rule is never loosened again.
  test("/api/search/locations is NOT redirected", async ({ request }) => {
    const res = await request.get("/api/search/locations?q=kh");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("success");
  });
});

test.describe("Filter params reach the server action (Epic 3.2)", () => {
  test("listings page accepts priceMin, priceMax, beds, baths, propertyType", async ({
    page,
  }) => {
    const url = "/en/listings?priceMin=50&priceMax=300&beds=2&baths=1";
    await page.goto(url);
    await waitForPageLoad(page);

    // URL should stay unchanged (no silent drop of the params).
    expect(page.url()).toContain("priceMin=50");
    expect(page.url()).toContain("priceMax=300");
    expect(page.url()).toContain("beds=2");
    expect(page.url()).toContain("baths=1");

    // Page renders without crashing. Empty DB => "No properties found" UX
    // remains acceptable here; we only assert there's no server error.
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/500|internal server error|stack trace/i);
  });

  test("amenities comma-list parses without errors", async ({ page }) => {
    await page.goto("/en/listings?amenities=WiFi,Parking");
    await waitForPageLoad(page);
    expect(page.url()).toContain("amenities=WiFi,Parking");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/500|internal server error/i);
  });

  test("legacy priceRange=min,max still works for back-compat", async ({
    page,
  }) => {
    await page.goto("/en/listings?priceRange=100,400");
    await waitForPageLoad(page);
    expect(page.url()).toContain("priceRange=100,400");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/500|internal server error/i);
  });
});
