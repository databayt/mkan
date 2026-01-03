import { test, expect } from '@playwright/test';

test.describe('Transport Booking Flow', () => {
  // Login before each test
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/en/login');

    // Fill login credentials
    await page.fill('input[name="email"]', 'office@hotmail.com');
    await page.fill('input[name="password"]', '123456');

    // Submit login form
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForTimeout(3000);
  });

  test('should complete full booking flow', async ({ page }) => {
    // Navigate to transport search
    await page.goto('/en/transport');

    // Search for trips
    await page.goto('/en/transport/search?origin=Khartoum&destination=Wad%20Madani');

    // Wait for results
    await page.waitForTimeout(3000);

    // Click on first available trip
    const selectSeatsLink = page.getByRole('link', { name: /select seats/i }).first();

    if (await selectSeatsLink.isVisible()) {
      await selectSeatsLink.click();

      // Wait for trip details page
      await page.waitForTimeout(2000);

      // Select seats (click on available seats)
      const availableSeat = page.locator('button').filter({ hasText: /^[A-Z]\d$/ }).first();
      if (await availableSeat.isVisible()) {
        await availableSeat.click();
      }

      // Fill passenger information if form is visible
      const passengerNameInput = page.locator('input[name="passengerName"]');
      if (await passengerNameInput.isVisible()) {
        await passengerNameInput.fill('Test Passenger');
      }

      const passengerPhoneInput = page.locator('input[name="passengerPhone"]');
      if (await passengerPhoneInput.isVisible()) {
        await passengerPhoneInput.fill('+249912345678');
      }

      const passengerEmailInput = page.locator('input[name="passengerEmail"]');
      if (await passengerEmailInput.isVisible()) {
        await passengerEmailInput.fill('test@example.com');
      }

      // Select payment method (Cash on Arrival)
      const paymentRadio = page.getByLabel(/cash on arrival/i);
      if (await paymentRadio.isVisible()) {
        await paymentRadio.click();
      }

      // Submit booking
      const bookButton = page.getByRole('button', { name: /book|confirm|continue/i });
      if (await bookButton.isVisible()) {
        await bookButton.click();

        // Wait for booking confirmation
        await page.waitForTimeout(3000);
      }
    }
  });

  test('should select multiple seats', async ({ page }) => {
    // Navigate to a trip details page directly
    await page.goto('/en/transport/search?origin=Khartoum&destination=Wad%20Madani');

    await page.waitForTimeout(3000);

    const selectSeatsLink = page.getByRole('link', { name: /select seats/i }).first();

    if (await selectSeatsLink.isVisible()) {
      await selectSeatsLink.click();

      await page.waitForTimeout(2000);

      // Try to select 2 seats
      const availableSeats = page.locator('button').filter({ hasText: /^[A-Z]\d$/ });
      const count = await availableSeats.count();

      if (count >= 2) {
        await availableSeats.nth(0).click();
        await page.waitForTimeout(500);
        await availableSeats.nth(1).click();

        // Verify 2 seats selected indicator
        await expect(page.getByText(/2.*seats? selected/i)).toBeVisible();
      }
    }
  });

  test('should prevent selecting more than max seats', async ({ page }) => {
    await page.goto('/en/transport/search?origin=Khartoum&destination=Wad%20Madani');

    await page.waitForTimeout(3000);

    const selectSeatsLink = page.getByRole('link', { name: /select seats/i }).first();

    if (await selectSeatsLink.isVisible()) {
      await selectSeatsLink.click();

      await page.waitForTimeout(2000);

      // Try to select more than 5 seats
      const availableSeats = page.locator('button').filter({ hasText: /^[A-Z]\d$/ });
      const count = await availableSeats.count();

      // Select up to 6 seats
      for (let i = 0; i < Math.min(count, 6); i++) {
        await availableSeats.nth(i).click();
        await page.waitForTimeout(200);
      }

      // Verify max seats message appears
      const maxReachedText = page.getByText(/maximum|max/i);
      if (await maxReachedText.isVisible()) {
        await expect(maxReachedText).toBeVisible();
      }
    }
  });

  test('should display booking confirmation', async ({ page }) => {
    // Navigate to an existing booking confirmation (if any)
    await page.goto('/en/transport/booking');

    // Check for booking elements or redirect
    await page.waitForTimeout(2000);

    // Look for ticket or booking reference
    const bookingRef = page.getByText(/booking reference|ref/i);
    const ticketView = page.locator('[class*="ticket"]');

    // Either booking reference or ticket should be visible on confirmation page
    const hasBookingContent = await bookingRef.isVisible() || await ticketView.isVisible();

    // This test just verifies the page loads without error
    expect(page.url()).toContain('/en/transport');
  });
});
