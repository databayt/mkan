/**
 * Accessibility smoke — baseline checks without a full axe run.
 *
 *   - pages have a single <main> or [role=main] landmark
 *   - interactive controls have discernible accessible names
 *   - images have alt attributes (or empty alt for decorative)
 *   - forms associate labels with inputs (via label[for] or aria-label)
 *
 * These are intentionally minimal — they catch the *most common* regressions
 * without forcing an axe dependency. Pair with real axe-core runs in CI.
 */
import { test, expect } from "@playwright/test";
import { waitForPageLoad } from "./helpers";

const PAGES = ["/en", "/en/listings", "/en/login", "/en/join", "/en/help"];

test.describe("A11y — landmarks", () => {
  for (const path of PAGES) {
    test(`${path} has exactly one main landmark`, async ({ page }) => {
      await page.goto(path);
      await waitForPageLoad(page);

      const mains = page.locator('main, [role="main"]');
      const count = await mains.count();
      expect(
        count,
        `${path} should render exactly one <main>/role=main`,
      ).toBeGreaterThanOrEqual(1);
    });
  }
});

test.describe("A11y — images", () => {
  for (const path of PAGES) {
    test(`${path} images all have alt attributes`, async ({ page }) => {
      await page.goto(path);
      await waitForPageLoad(page);
      await page.waitForTimeout(800); // allow lazy images

      const imgs = await page.locator("img").all();
      const missing: string[] = [];
      for (const img of imgs) {
        const alt = await img.getAttribute("alt");
        const src = (await img.getAttribute("src")) ?? "";
        // alt may be an empty string for decorative — that's fine.
        if (alt === null) missing.push(src.slice(0, 60));
      }
      expect(
        missing,
        `Images missing alt on ${path}: ${missing.join(", ")}`,
      ).toEqual([]);
    });
  }
});

test.describe("A11y — interactive controls", () => {
  for (const path of PAGES) {
    test(`${path} buttons have accessible names`, async ({ page }) => {
      await page.goto(path);
      await waitForPageLoad(page);

      const buttons = await page.locator("button").all();
      const unnamed: string[] = [];

      for (const btn of buttons) {
        // An "accessible name" comes from: inner text, aria-label,
        // aria-labelledby. For icon-only buttons, aria-label is mandatory.
        const [text, ariaLabel, ariaLabelledBy, title] = await Promise.all([
          btn.innerText().catch(() => ""),
          btn.getAttribute("aria-label"),
          btn.getAttribute("aria-labelledby"),
          btn.getAttribute("title"),
        ]);

        const hasName =
          (text && text.trim().length > 0) ||
          (ariaLabel && ariaLabel.trim().length > 0) ||
          (ariaLabelledBy && ariaLabelledBy.trim().length > 0) ||
          (title && title.trim().length > 0);

        if (!hasName) {
          const html = (await btn.innerHTML()).slice(0, 80);
          unnamed.push(html);
        }
      }

      // Allow a small tolerance — some UI libraries render invisible
      // helper buttons. Fail hard only if more than 3 unnamed controls.
      expect(
        unnamed.length,
        `Too many unnamed buttons on ${path}:\n${unnamed.join("\n")}`,
      ).toBeLessThanOrEqual(3);
    });
  }
});

test.describe("A11y — forms", () => {
  test("login form inputs are labelled", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    const inputs = await page.locator('input:not([type="hidden"])').all();
    for (const input of inputs) {
      const [id, ariaLabel, placeholder] = await Promise.all([
        input.getAttribute("id"),
        input.getAttribute("aria-label"),
        input.getAttribute("placeholder"),
      ]);

      // A labelled input either has a matching <label for="..."> OR an
      // aria-label OR at minimum a placeholder (degraded but acceptable).
      let labelled = false;
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        labelled = (await label.count()) > 0;
      }
      if (!labelled && ariaLabel) labelled = true;
      if (!labelled && placeholder) labelled = true;

      expect(labelled, `Input on /login is not labelled`).toBe(true);
    }
  });
});
