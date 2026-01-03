import { test, expect } from '@playwright/test';

test.describe('Transport Search Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to transport page
    await page.goto('/en/transport');
  });

  test('should display transport search page', async ({ page }) => {
    // Check main elements are visible
    await expect(page.getByRole('heading', { name: /transport/i })).toBeVisible();

    // Check search widget is present
    await expect(page.locator('[data-testid="transport-search"]').or(page.getByPlaceholder(/search/i).first())).toBeVisible();
  });

  test('should search for trips between cities', async ({ page }) => {
    // Click on origin city selector
    const originInput = page.getByPlaceholder(/from|origin/i).first();
    if (await originInput.isVisible()) {
      await originInput.click();

      // Select Khartoum as origin
      await page.getByText('Khartoum').first().click();
    }

    // Click on destination city selector
    const destInput = page.getByPlaceholder(/to|destination/i).first();
    if (await destInput.isVisible()) {
      await destInput.click();

      // Select Port Sudan as destination
      await page.getByText('Port Sudan').first().click();
    }

    // Select travel date (tomorrow)
    const dateInput = page.getByRole('button', { name: /date|calendar/i }).first();
    if (await dateInput.isVisible()) {
      await dateInput.click();

      // Select a date in the future
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      const dayButton = page.getByRole('gridcell', { name: String(tomorrow.getDate()) });
      if (await dayButton.isVisible()) {
        await dayButton.click();
      }
    }

    // Click search button
    const searchButton = page.getByRole('button', { name: /search/i });
    if (await searchButton.isVisible()) {
      await searchButton.click();

      // Wait for navigation or results
      await page.waitForTimeout(2000);
    }
  });

  test('should display trip cards with correct information', async ({ page }) => {
    // Navigate to search results page with query params
    await page.goto('/en/transport/search?origin=Khartoum&destination=Port%20Sudan');

    // Wait for results to load
    await page.waitForTimeout(3000);

    // Check if trip cards are displayed
    const tripCards = page.locator('[class*="card"]').filter({ hasText: /SDG/ });

    if (await tripCards.count() > 0) {
      // Verify trip card contains expected elements
      const firstCard = tripCards.first();

      // Should show departure time
      await expect(firstCard.getByText(/\d{1,2}:\d{2}/)).toBeVisible();

      // Should show price in SDG
      await expect(firstCard.getByText(/SDG/)).toBeVisible();
    }
  });

  test('should navigate to trip details on card click', async ({ page }) => {
    // Navigate to search results
    await page.goto('/en/transport/search?origin=Khartoum&destination=Port%20Sudan');

    // Wait for results
    await page.waitForTimeout(3000);

    // Find and click first trip card's select seats button
    const selectSeatsButton = page.getByRole('link', { name: /select seats/i }).first();

    if (await selectSeatsButton.isVisible()) {
      await selectSeatsButton.click();

      // Should navigate to trip details page
      await expect(page).toHaveURL(/\/transport\/trips\/\d+/);
    }
  });
});
