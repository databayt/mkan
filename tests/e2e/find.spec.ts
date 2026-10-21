import { expect, test, type Page } from "@playwright/test";

/**
 * The rental agent end to end: chats in the URL, the ☰ sheet (chats, Saved
 * homes, Memory), welcome back, Arabic, and the bubble.
 *
 * These tests WRITE (chats, profiles, memory). The repo's `.env` points at
 * production, so they run only against a dev server already started on a Neon
 * test branch, with Slack off:
 *
 *   DATABASE_URL=<test branch> DIRECT_URL=<test branch> SLACK_BOT_TOKEN= GROQ_API_KEY= pnpm dev
 *   AGENT_E2E=1 pnpm test:e2e tests/e2e/find.spec.ts
 *
 * Without GROQ_API_KEY (and no Claude key) the turn reads with the rules alone,
 * so every run reads the same words the same way.
 */
test.skip(!process.env.AGENT_E2E, "writes to the database — set AGENT_E2E=1 with a dev server on a test branch");
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const MESSAGE = "2 bedroom in Kicukiro";

async function search(page: Page, text = MESSAGE) {
  await page.goto("/en/find");
  const box = page.getByRole("textbox").first();
  // Typed before React hydrates (slow in dev), an Enter goes nowhere and hydration clears
  // the box: send until the chat has its address — never again once it has one.
  await expect(async () => {
    if (!/[?&]c=/.test(page.url())) {
      await box.fill(text);
      await box.press("Enter");
    }
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  await expect(page.getByText("homes that match").first()).toBeVisible({ timeout: 45_000 });
}

const sheet = (page: Page) => page.locator('[data-slot="sheet-content"]');

test("a first message gets cards and its own address", async ({ page }) => {
  await search(page);
  await expect(page.getByText("Best match").first()).toBeVisible();
});

test("☰ lists the chat; New chat empties; the chat reopens with its transcript", async ({ page }) => {
  await search(page);
  const url = page.url();
  await page.getByRole("button", { name: "Chats" }).first().click();
  await expect(sheet(page).getByText("Today")).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: /Kicukiro · 2 bedrooms/ })).toBeVisible();
  await sheet(page).getByRole("button", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/en\/find$/);
  await page.getByRole("button", { name: "Chats" }).first().click();
  await sheet(page).getByRole("button", { name: /Kicukiro · 2 bedrooms/ }).click();
  await expect(page).toHaveURL(url);
  await expect(page.getByText(MESSAGE).first()).toBeVisible();
});

test("a chat can be deleted", async ({ page }) => {
  await search(page);
  await page.getByRole("button", { name: "Chats" }).first().click();
  const row = sheet(page).getByRole("listitem").filter({ hasText: "Kicukiro · 2 bedrooms" });
  await row.getByRole("button", { name: "Chat options" }).click();
  await sheet(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(sheet(page).getByText("No chats yet")).toBeVisible();
});

test("♥ keeps a home in Saved homes", async ({ page }) => {
  await search(page);
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByRole("button", { name: "Remove from saved" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Chats" }).first().click();
  await sheet(page).getByRole("button", { name: /Saved homes/ }).click();
  await expect(sheet(page).getByRole("link")).toHaveCount(1);
});

test("Memory shows the search and forgets it on request", async ({ page }) => {
  await search(page);
  await page.getByRole("button", { name: "Chats" }).first().click();
  await sheet(page).getByRole("button", { name: /^Memory/ }).click();
  await expect(sheet(page).getByRole("button", { name: "2 bedrooms", exact: true })).toBeVisible();
  await sheet(page).getByRole("button", { name: "Forget everything" }).click();
  await sheet(page).getByRole("button", { name: "Forget", exact: true }).click();
  await expect(sheet(page).getByText("Nothing yet.")).toBeVisible();
});

test("a returning tenant continues in one tap", async ({ page }) => {
  await search(page);
  await page.goto("/en/find");
  await expect(page.getByText("Welcome back")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: /Continue your search/ }).click();
  await expect(page).toHaveURL(/[?&]c=/);
  await expect(page.getByText("homes that match").first()).toBeVisible({ timeout: 45_000 });
});

test("in Arabic the sheet opens from the right edge", async ({ page }) => {
  await page.goto("/ar/find");
  await page.getByRole("button", { name: "المحادثات" }).first().click();
  const width = page.viewportSize()!.width;
  // It slides in from the right; measure once it has landed against that edge.
  await expect.poll(async () => {
    const box = await sheet(page).boundingBox();
    return box ? Math.round(box.x + box.width) : null;
  }).toBe(width);
});

test("the bubble's ☰ opens above its panel", async ({ page }) => {
  await page.goto("/en/listings");
  await page.evaluate(() => window.dispatchEvent(new Event("open-agent")));
  const panel = page.locator('section[role="dialog"]');
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Chats" }).click();
  await expect(sheet(page)).toBeVisible();
  // Once it has slid in, the point under its list belongs to the sheet, not to the panel (z-55) below.
  await expect
    .poll(async () => {
      const box = await sheet(page).boundingBox();
      if (!box || box.x < 0) return false;
      return page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-slot="sheet-content"]'), { x: box.x + 30, y: box.y + 100 });
    })
    .toBe(true);
});
