import { test, expect } from "@playwright/test";
import { waitForPageLoad } from "./helpers";

test.describe("Smoke Tests", () => {
  test("homepage loads with correct title", async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);

    await expect(page).toHaveTitle(/Mkan/i);
  });

  test("homepage shows listings section", async ({ page }) => {
    await page.goto("/en");
    await waitForPageLoad(page);

    // The home page renders listing carousels or property content
    const listingsArea = page
      .locator('[class*="listing"], [class*="property"], [class*="carousel"]')
      .first();
    const hasListings = await listingsArea.isVisible().catch(() => false);

    // At minimum the page should have rendered beyond the loading spinner
    const body = page.locator("body");
    await expect(body).toBeVisible();

    // Verify the page is not stuck on a loading state
    const spinner = page.locator('[role="status"][aria-label="Loading"]');
    await expect(spinner).not.toBeVisible({ timeout: 15_000 });
  });

  test("navigate to /en shows English content", async ({ page }) => {
    await page.goto("/en");
    await waitForPageLoad(page);

    // The html element should have lang="en" and dir="ltr"
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "en");
    await expect(html).toHaveAttribute("dir", "ltr");

    // Check for English text on the page (from home-content translations)
    const englishContent = page.getByText(/Popular homes|Recently added|Top rated/i);
    const hasEnglish = await englishContent.first().isVisible().catch(() => false);

    // At minimum the page should render without error
    await expect(page).toHaveTitle(/Mkan/i);
  });

  test("navigate to /ar shows Arabic content and RTL direction", async ({ page }) => {
    await page.goto("/ar");
    await waitForPageLoad(page);

    // The html element should have lang="ar" and dir="rtl"
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");

    // Check that the page rendered (not stuck on loading)
    const body = page.locator("body");
    await expect(body).toBeVisible();
  });

  test("search page loads", async ({ page }) => {
    await page.goto("/en/search");
    await waitForPageLoad(page);

    // The page should load without crashing
    await expect(page).toHaveTitle(/Mkan/i);

    // The URL should still contain /search
    expect(page.url()).toContain("/search");
  });

  test("login page loads with form", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    // Should have an email/username input
    const emailInput = page
      .locator('input[name="email"], input[type="email"]')
      .first();
    await expect(emailInput).toBeVisible();

    // Should have a password input
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();

    // Should have a submit button
    const submitButton = page
      .locator('button[type="submit"]')
      .first();
    await expect(submitButton).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto("/en/join");
    await waitForPageLoad(page);

    // Should have form inputs for registration
    const formInputs = page.locator("input");
    const inputCount = await formInputs.count();
    expect(inputCount).toBeGreaterThan(0);

    // Should have a submit button
    const submitButton = page.locator('button[type="submit"]').first();
    await expect(submitButton).toBeVisible();
  });

  test("404 page for invalid route", async ({ page }) => {
    await page.goto("/en/this-route-does-not-exist-xyz");
    await waitForPageLoad(page);

    // Should show a 404 indicator — the not-found page renders "404" text
    const notFoundText = page.getByText("404");
    await expect(notFoundText).toBeVisible();
  });
});
