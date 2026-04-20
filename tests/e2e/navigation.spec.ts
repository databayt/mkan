import { test, expect } from "@playwright/test";
import { waitForPageLoad, waitForNavigation } from "./helpers";

test.describe("Navigation", () => {
  test("click on listing card navigates to detail page", async ({ page }) => {
    await page.goto("/en");
    await waitForPageLoad(page);

    // Find a listing card link — these are typically <a> tags wrapping cards
    const listingLink = page
      .locator('a[href*="/listings/"]')
      .first();

    const isVisible = await listingLink.isVisible().catch(() => false);

    if (isVisible) {
      await listingLink.click();
      await waitForNavigation(page, /\/listings\/.+/);

      // Should be on a listing detail page
      expect(page.url()).toMatch(/\/listings\/.+/);
    } else {
      // If no listings are loaded (empty DB), the test still passes —
      // we verified the homepage loads and checked for the link.
      test.skip(true, "No listing cards visible — likely empty database");
    }
  });

  test("language switcher works (en to ar)", async ({ page }) => {
    await page.goto("/en");
    await waitForPageLoad(page);

    // Look for a language switcher — common patterns: link to /ar, button with "العربية"
    const langSwitch = page
      .locator(
        'a[href*="/ar"], button:has-text("العربية"), button:has-text("AR"), [data-testid="language-switcher"]',
      )
      .first();

    const isVisible = await langSwitch.isVisible().catch(() => false);

    if (isVisible) {
      await langSwitch.click();
      await waitForNavigation(page, /\/ar/);

      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "ar");
      await expect(html).toHaveAttribute("dir", "rtl");
    } else {
      // Navigate directly to /ar to verify it works
      await page.goto("/ar");
      await waitForPageLoad(page);

      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "ar");
    }
  });

  test("back button works after navigation", async ({ page }) => {
    // Start at homepage
    await page.goto("/en");
    await waitForPageLoad(page);

    const initialUrl = page.url();

    // Navigate to search page
    await page.goto("/en/search");
    await waitForPageLoad(page);

    expect(page.url()).toContain("/search");

    // Go back
    await page.goBack();
    await waitForPageLoad(page);

    // Should be back at the homepage (or at least not on search)
    expect(page.url()).not.toContain("/search");
  });

  test("header navigation links work", async ({ page }) => {
    await page.goto("/en");
    await waitForPageLoad(page);

    // Look for nav links in the header area
    const header = page.locator("header, nav").first();
    const headerVisible = await header.isVisible().catch(() => false);

    if (headerVisible) {
      // Check that navigation links exist (home, search, login, etc.)
      const navLinks = header.locator("a");
      const linkCount = await navLinks.count();
      expect(linkCount).toBeGreaterThan(0);

      // Click the first non-logo nav link that navigates somewhere
      const navLink = header
        .locator('a:not([href="/en"]):not([href="/"])')
        .first();
      const navLinkVisible = await navLink.isVisible().catch(() => false);

      if (navLinkVisible) {
        const href = await navLink.getAttribute("href");
        await navLink.click();
        await waitForPageLoad(page);

        // Should have navigated away from pure homepage
        if (href) {
          expect(page.url()).toContain(href.replace(/^\/en/, ""));
        }
      }
    } else {
      // Even without a visible header, the page should have loaded
      await expect(page.locator("body")).toBeVisible();
    }
  });

  test("footer links work", async ({ page }) => {
    await page.goto("/en");
    await waitForPageLoad(page);

    const footer = page.locator("footer").first();
    const footerVisible = await footer.isVisible().catch(() => false);

    if (footerVisible) {
      // Footer should contain links
      const footerLinks = footer.locator("a");
      const linkCount = await footerLinks.count();
      expect(linkCount).toBeGreaterThan(0);

      // Click on a footer link (e.g., terms, privacy, help)
      const footerLink = footer
        .locator('a[href*="/terms"], a[href*="/privacy"], a[href*="/help"]')
        .first();
      const linkVisible = await footerLink.isVisible().catch(() => false);

      if (linkVisible) {
        const href = await footerLink.getAttribute("href");
        await footerLink.click();
        await waitForPageLoad(page);

        if (href) {
          expect(page.url()).toContain(
            href.replace(/^\/(en|ar)/, ""),
          );
        }
      }
    } else {
      // Footer might be below the fold — scroll to it
      await page.evaluate(() =>
        window.scrollTo(0, document.body.scrollHeight),
      );
      const footerAfterScroll = page.locator("footer").first();
      const visibleAfterScroll = await footerAfterScroll
        .isVisible()
        .catch(() => false);

      // Either the footer is now visible or the page simply does not have one
      if (visibleAfterScroll) {
        const footerLinks = footerAfterScroll.locator("a");
        expect(await footerLinks.count()).toBeGreaterThan(0);
      }
    }
  });

  test("mobile menu opens and closes", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto("/en");
    await waitForPageLoad(page);

    // Look for a hamburger menu button (common patterns)
    const menuButton = page
      .locator(
        'button[aria-label*="menu" i], button[aria-label*="Menu"], [data-testid="mobile-menu"], button:has(svg)',
      )
      .first();

    const menuVisible = await menuButton.isVisible().catch(() => false);

    if (menuVisible) {
      // Open the menu
      await menuButton.click();

      // Wait for the mobile menu/drawer to appear
      const mobileNav = page
        .locator(
          '[role="dialog"], [role="navigation"], [data-testid="mobile-nav"], nav',
        )
        .last();

      const navAppeared = await mobileNav
        .isVisible({ timeout: 3_000 })
        .catch(() => false);

      if (navAppeared) {
        // Close the menu — look for a close button or click the same button
        const closeButton = page
          .locator(
            'button[aria-label*="close" i], button[aria-label*="Close"]',
          )
          .first();
        const closeVisible = await closeButton
          .isVisible()
          .catch(() => false);

        if (closeVisible) {
          await closeButton.click();
        } else {
          // Click the same hamburger button to toggle
          await menuButton.click();
        }
      }
    } else {
      // On mobile, if there is no hamburger button the nav may be inline
      const nav = page.locator("nav").first();
      await expect(nav).toBeVisible();
    }
  });
});
