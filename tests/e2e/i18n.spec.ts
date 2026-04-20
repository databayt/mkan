/**
 * i18n smoke matrix — covers Epic 5.2 from the audit plan.
 *
 * For each canonical public page we assert:
 *   - `/en/...` renders with `lang="en"` and `dir="ltr"`
 *   - `/ar/...` renders with `lang="ar"` and `dir="rtl"`
 *   - No English leaks in Arabic view (watchlist of common untranslated strings)
 *   - No Arabic leaks in English view (Arabic Unicode range)
 *
 * Skip rules:
 *   - Anonymous-only pages; no authentication needed for this matrix.
 *   - If a route redirects to /login (protected), the test records that and moves on.
 */
import { test, expect, Page } from "@playwright/test";
import { waitForPageLoad } from "./helpers";

// English tokens that should never surface on an Arabic page. Chosen for
// high signal: short, unique, and present in multiple components we've
// translated. Extend the list as new flows enter the i18n net.
const EN_LEAKS = [
  "Sign In",
  "Sign Up",
  "Submit",
  "Cancel",
  "per month",
  "per night",
  "Pets Allowed",
  "Parking Included",
  "Help Center",
  "Support",
  "Hosting",
  "Company",
  "Resources",
  "Newsroom",
  "Careers",
  "Investors",
  "AirCover",
  "Gift cards",
] as const;

// Minimal set that verifies an English page hasn't been stomped by Arabic.
const AR_RANGE = /[\u0600-\u06FF]/;

async function visibleText(page: Page): Promise<string> {
  // Scrape *visible* text only — hidden fallback labels inside aria-only
  // components would otherwise produce false positives.
  return page.evaluate(() => document.body.innerText || "");
}

const PAGES = [
  { path: "/", label: "home" },
  { path: "/listings", label: "listings" },
  { path: "/transport", label: "transport" },
  { path: "/help", label: "help" },
  { path: "/terms", label: "terms" },
  { path: "/privacy", label: "privacy" },
] as const;

test.describe("i18n smoke — /en", () => {
  for (const p of PAGES) {
    test(`English ${p.label} has lang=en, dir=ltr, no Arabic leaks`, async ({
      page,
    }) => {
      await page.goto(`/en${p.path === "/" ? "" : p.path}`);
      await waitForPageLoad(page);

      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "en");
      await expect(html).toHaveAttribute("dir", "ltr");

      const text = await visibleText(page);
      const arabicChars = [...text].filter((c) => AR_RANGE.test(c)).length;

      // Small amount of Arabic is allowed (e.g., locale-switcher label or
      // brand name if it ever appears). Threshold is conservative: if more
      // than ~10 Arabic characters show up on the EN page, something leaked.
      expect(arabicChars).toBeLessThan(10);
    });
  }
});

test.describe("i18n smoke — /ar", () => {
  for (const p of PAGES) {
    test(`Arabic ${p.label} has lang=ar, dir=rtl, no known English leaks`, async ({
      page,
    }) => {
      await page.goto(`/ar${p.path === "/" ? "" : p.path}`);
      await waitForPageLoad(page);

      const html = page.locator("html");
      await expect(html).toHaveAttribute("lang", "ar");
      await expect(html).toHaveAttribute("dir", "rtl");

      const text = await visibleText(page);

      const leaked = EN_LEAKS.filter((token) => text.includes(token));

      // Report the offending tokens in the failure so fixes can target them.
      expect(
        leaked,
        `Untranslated English tokens on /ar${p.path}: ${leaked.join(", ")}`,
      ).toEqual([]);
    });
  }
});

test.describe("i18n smoke — formatter adoption", () => {
  test("Arabic listings page renders currency without raw $", async ({
    page,
  }) => {
    await page.goto("/ar/listings");
    await waitForPageLoad(page);

    const text = await visibleText(page);

    // If any property cards render, they must NOT show raw `$NNN/month`.
    // Empty DB or no cards => no price text => test still passes.
    const dollarMatches = text.match(/\$\d{2,}/g) ?? [];
    expect(
      dollarMatches,
      `AR listings should not show raw USD via \$: found ${dollarMatches.join(", ")}`,
    ).toEqual([]);
  });

  test("Arabic homepage does not contain /night in English", async ({
    page,
  }) => {
    await page.goto("/ar");
    await waitForPageLoad(page);

    const text = await visibleText(page);
    expect(text).not.toMatch(/\/night\b/);
    expect(text).not.toMatch(/\/month\b/);
  });
});
