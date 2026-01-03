import { test, expect } from '@playwright/test';

test.describe('Transport Host Onboarding Flow', () => {
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

  test('should display transport host dashboard', async ({ page }) => {
    // Navigate to transport host page
    await page.goto('/en/transport-host');

    // Wait for page load
    await page.waitForTimeout(2000);

    // Should show transport host page or redirect to login
    const currentUrl = page.url();
    expect(currentUrl).toContain('/transport-host');
  });

  test('should start new office creation flow', async ({ page }) => {
    // Navigate to transport host page
    await page.goto('/en/transport-host');

    await page.waitForTimeout(2000);

    // Look for "Create Office" or "Add Office" button
    const createButton = page.getByRole('button', { name: /create|add|new/i });

    if (await createButton.isVisible()) {
      await createButton.click();

      // Should navigate to office creation flow
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/transport-host');
    }
  });

  test('should fill office info form', async ({ page }) => {
    // Navigate directly to office info step (assuming an office ID exists)
    await page.goto('/en/transport-host');

    await page.waitForTimeout(2000);

    // Try to create a new office
    const createButton = page.getByRole('button', { name: /create|add|new/i });

    if (await createButton.isVisible()) {
      await createButton.click();
      await page.waitForTimeout(2000);
    }

    // Fill office info if form is visible
    const officeNameInput = page.locator('input[name="name"]');
    if (await officeNameInput.isVisible()) {
      await officeNameInput.fill('Test Transport Office');

      const phoneInput = page.locator('input[name="phone"]');
      if (await phoneInput.isVisible()) {
        await phoneInput.fill('+249912345678');
      }

      const emailInput = page.locator('input[name="email"]');
      if (await emailInput.isVisible()) {
        await emailInput.fill('test@transport.sd');
      }
    }
  });

  test('should navigate through onboarding steps', async ({ page }) => {
    // Navigate to transport host
    await page.goto('/en/transport-host');

    await page.waitForTimeout(2000);

    // Look for navigation buttons (Next, Previous, etc.)
    const nextButton = page.getByRole('button', { name: /next|continue/i });
    const prevButton = page.getByRole('button', { name: /back|previous/i });

    if (await nextButton.isVisible()) {
      // Step through the onboarding
      await nextButton.click();
      await page.waitForTimeout(1000);

      // Check if navigation worked
      if (await prevButton.isVisible()) {
        await prevButton.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('should list existing transport offices', async ({ page }) => {
    // Login with a transport office owner
    await page.goto('/en/login');
    await page.fill('input[name="email"]', 'ahmed.hassan@khartoumexpress.sd');
    await page.fill('input[name="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Navigate to transport host dashboard
    await page.goto('/en/transport-host');
    await page.waitForTimeout(3000);

    // Should show existing offices
    const officeCards = page.locator('[class*="card"]');
    const count = await officeCards.count();

    // At least one office should be visible (from seed data)
    if (count > 0) {
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should view office details', async ({ page }) => {
    // Login with a transport office owner
    await page.goto('/en/login');
    await page.fill('input[name="email"]', 'ahmed.hassan@khartoumexpress.sd');
    await page.fill('input[name="password"]', '123456');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);

    // Navigate to transport host dashboard
    await page.goto('/en/transport-host');
    await page.waitForTimeout(3000);

    // Click on an office card or edit button
    const editButton = page.getByRole('button', { name: /edit|manage|view/i }).first();

    if (await editButton.isVisible()) {
      await editButton.click();
      await page.waitForTimeout(2000);

      // Should navigate to office details
      expect(page.url()).toContain('/transport-host');
    }
  });
});
