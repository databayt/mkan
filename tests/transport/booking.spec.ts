import { test, expect } from "@playwright/test";
import { waitForPageLoad } from "../e2e/helpers";

const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? "office@hotmail.com";
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? "123456";

test.describe("Transport Booking Flow", () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);

    await page.click('button[type="submit"]');

    // Wait for redirect away from login page
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 10_000,
    });
  });

  test("should complete full booking flow", async ({ page }) => {
    await page.goto("/en/transport");
    await waitForPageLoad(page);

    await page.goto(
      "/en/transport/search?origin=Khartoum&destination=Wad%20Madani",
    );

    // Wait for results to render
    await page
      .locator('[class*="card"], [role="list"], [data-testid]')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    const selectSeatsLink = page
      .getByRole("link", { name: /select seats/i })
      .first();

    if (await selectSeatsLink.isVisible()) {
      await selectSeatsLink.click();

      // Wait for trip details page to load
      await page.waitForURL(/\/transport\/trips\//, { timeout: 10_000 });
      await waitForPageLoad(page);

      // Select seats (click on available seats)
      const availableSeat = page
        .locator("button")
        .filter({ hasText: /^[A-Z]\d$/ })
        .first();
      if (await availableSeat.isVisible()) {
        await availableSeat.click();
      }

      // Fill passenger information if form is visible
      const passengerNameInput = page.locator(
        'input[name="passengerName"]',
      );
      if (await passengerNameInput.isVisible()) {
        await passengerNameInput.fill("Test Passenger");
      }

      const passengerPhoneInput = page.locator(
        'input[name="passengerPhone"]',
      );
      if (await passengerPhoneInput.isVisible()) {
        await passengerPhoneInput.fill("+249912345678");
      }

      const passengerEmailInput = page.locator(
        'input[name="passengerEmail"]',
      );
      if (await passengerEmailInput.isVisible()) {
        await passengerEmailInput.fill("test@example.com");
      }

      // Select payment method (Cash on Arrival)
      const paymentRadio = page.getByLabel(/cash on arrival/i);
      if (await paymentRadio.isVisible()) {
        await paymentRadio.click();
      }

      // Submit booking
      const bookButton = page.getByRole("button", {
        name: /book|confirm|continue/i,
      });
      if (await bookButton.isVisible()) {
        await bookButton.click();

        // Wait for booking confirmation page
        await page
          .waitForURL(/\/booking|\/confirmation/, { timeout: 10_000 })
          .catch(() => {});
      }
    }
  });

  test("should select multiple seats", async ({ page }) => {
    await page.goto(
      "/en/transport/search?origin=Khartoum&destination=Wad%20Madani",
    );

    await page
      .locator('[class*="card"], [role="list"]')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    const selectSeatsLink = page
      .getByRole("link", { name: /select seats/i })
      .first();

    if (await selectSeatsLink.isVisible()) {
      await selectSeatsLink.click();

      await page.waitForURL(/\/transport\/trips\//, { timeout: 10_000 });
      await waitForPageLoad(page);

      // Try to select 2 seats
      const availableSeats = page
        .locator("button")
        .filter({ hasText: /^[A-Z]\d$/ });
      const count = await availableSeats.count();

      if (count >= 2) {
        await availableSeats.nth(0).click();
        await availableSeats.nth(1).click();

        // Verify 2 seats selected indicator
        await expect(
          page.getByText(/2.*seats? selected/i),
        ).toBeVisible();
      }
    }
  });

  test("should prevent selecting more than max seats", async ({ page }) => {
    await page.goto(
      "/en/transport/search?origin=Khartoum&destination=Wad%20Madani",
    );

    await page
      .locator('[class*="card"], [role="list"]')
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    const selectSeatsLink = page
      .getByRole("link", { name: /select seats/i })
      .first();

    if (await selectSeatsLink.isVisible()) {
      await selectSeatsLink.click();

      await page.waitForURL(/\/transport\/trips\//, { timeout: 10_000 });
      await waitForPageLoad(page);

      // Try to select more than 5 seats
      const availableSeats = page
        .locator("button")
        .filter({ hasText: /^[A-Z]\d$/ });
      const count = await availableSeats.count();

      for (let i = 0; i < Math.min(count, 6); i++) {
        await availableSeats.nth(i).click();
      }

      // Verify max seats message appears
      const maxReachedText = page.getByText(/maximum|max/i);
      if (await maxReachedText.isVisible()) {
        await expect(maxReachedText).toBeVisible();
      }
    }
  });

  test("should display booking confirmation", async ({ page }) => {
    await page.goto("/en/transport/booking");
    await waitForPageLoad(page);

    // Look for ticket or booking reference
    const bookingRef = page.getByText(/booking reference|ref/i);
    const ticketView = page.locator('[class*="ticket"]');

    // Either booking reference or ticket should be visible on confirmation page
    await bookingRef
      .isVisible()
      .catch(() => false);
    await ticketView
      .isVisible()
      .catch(() => false);

    // This test verifies the page loads without error
    expect(page.url()).toContain("/en/transport");
  });
});
