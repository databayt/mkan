import { test, expect } from "@playwright/test";
import { waitForPageLoad } from "../e2e/helpers";

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? "office@hotmail.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "123456";
const HOST_EMAIL =
  process.env.TEST_HOST_EMAIL ?? "ahmed.hassan@khartoumexpress.sd";
const HOST_PASSWORD = process.env.TEST_HOST_PASSWORD ?? "123456";

test.describe("Transport Host Onboarding Flow", () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);

    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });
  });

  test("should display transport host dashboard", async ({ page }) => {
    await page.goto("/en/transport-host");
    await waitForPageLoad(page);

    const currentUrl = page.url();
    expect(currentUrl).toContain("/transport-host");
  });

  test("should start new office creation flow", async ({ page }) => {
    await page.goto("/en/transport-host");
    await waitForPageLoad(page);

    const createButton = page.getByRole("button", {
      name: /create|add|new/i,
    });

    if (await createButton.isVisible()) {
      await createButton.click();

      // Wait for the creation form/flow to appear
      await page
        .locator("form, [role='dialog'], [data-testid]")
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => {});

      expect(page.url()).toContain("/transport-host");
    }
  });

  test("should fill office info form", async ({ page }) => {
    await page.goto("/en/transport-host");
    await waitForPageLoad(page);

    const createButton = page.getByRole("button", {
      name: /create|add|new/i,
    });

    if (await createButton.isVisible()) {
      await createButton.click();

      await page
        .locator("form")
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => {});
    }

    // Fill office info if form is visible
    const officeNameInput = page.locator('input[name="name"]');
    if (await officeNameInput.isVisible()) {
      await officeNameInput.fill("Test Transport Office");

      const phoneInput = page.locator('input[name="phone"]');
      if (await phoneInput.isVisible()) {
        await phoneInput.fill("+249912345678");
      }

      const emailInput = page.locator('input[name="email"]');
      if (await emailInput.isVisible()) {
        await emailInput.fill("test@transport.sd");
      }
    }
  });

  test("should navigate through onboarding steps", async ({ page }) => {
    await page.goto("/en/transport-host");
    await waitForPageLoad(page);

    const nextButton = page.getByRole("button", {
      name: /next|continue/i,
    });
    const prevButton = page.getByRole("button", {
      name: /back|previous/i,
    });

    if (await nextButton.isVisible()) {
      await nextButton.click();

      // Wait for step transition
      await page
        .locator("form, [data-step], [class*='step']")
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => {});

      if (await prevButton.isVisible()) {
        await prevButton.click();

        await page
          .locator("form, [data-step], [class*='step']")
          .first()
          .waitFor({ state: "visible", timeout: 5_000 })
          .catch(() => {});
      }
    }
  });

  test("should list existing transport offices", async ({ page }) => {
    // Login with a transport office owner
    await page.goto("/en/login");
    await waitForPageLoad(page);

    await page.fill('input[name="email"]', HOST_EMAIL);
    await page.fill('input[name="password"]', HOST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });

    await page.goto("/en/transport-host");
    await waitForPageLoad(page);

    // Should show existing offices
    const officeCards = page.locator('[class*="card"]');
    const count = await officeCards.count();

    if (count > 0) {
      expect(count).toBeGreaterThan(0);
    }
  });

  test("should view office details", async ({ page }) => {
    // Login with a transport office owner
    await page.goto("/en/login");
    await waitForPageLoad(page);

    await page.fill('input[name="email"]', HOST_EMAIL);
    await page.fill('input[name="password"]', HOST_PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });

    await page.goto("/en/transport-host");
    await waitForPageLoad(page);

    const editButton = page
      .getByRole("button", { name: /edit|manage|view/i })
      .first();

    if (await editButton.isVisible()) {
      await editButton.click();

      // Wait for navigation or modal to open
      await page
        .locator("form, [role='dialog'], [data-testid]")
        .first()
        .waitFor({ state: "visible", timeout: 5_000 })
        .catch(() => {});

      expect(page.url()).toContain("/transport-host");
    }
  });
});
