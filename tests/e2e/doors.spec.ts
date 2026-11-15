import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";

/**
 * The web doors, one test each, at a phone's width (393×852): the homepage's Today strip, /today, /tt,
 * a published /k/K… page and /find (Phase 2 of the doors plan, 2026-11-15). Every door must hand a tenant
 * to Mkan's WhatsApp line with the right words: a home's code, the marker that counts the chat apart
 * (`tiktok_bio`, `mkan_today`, `mkan.sd`) or the chat's `ref:`.
 *
 * /find WRITES (chats, profiles), and the repo's `.env` points at production, so this runs only against a
 * dev server started on a Neon test branch, with the same database url in this process (the fixtures are
 * read from it):
 *
 *   DATABASE_URL=<test branch> DIRECT_URL=<test branch> SLACK_BOT_TOKEN= GROQ_API_KEY= MKAN_WA_OUTBOX=0 pnpm dev
 *   DATABASE_URL=<test branch> AGENT_E2E=1 pnpm test:e2e tests/e2e/doors.spec.ts
 *
 * Fixtures are picked in beforeAll (published TIKTOK / WEB homes, POSTED TikTokPost rows). A door whose
 * fixture is missing on the branch is skipped with the reason — never failed.
 */
test.skip(!process.env.AGENT_E2E || !process.env.DATABASE_URL, "writes to the database — set AGENT_E2E=1 and DATABASE_URL (a Neon test branch, never production) with a dev server on the same branch");
test.use({ viewport: { width: 393, height: 852 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const KIGALI_MS = 2 * 3_600_000;
const DAY = 86_400_000;

interface Fixtures {
  /** A published home (any source): its /k page is indexable. */
  published: number | null;
  /** A home with a POSTED TikTokPost in the last 3 Kigali days (what /today and /tt list). */
  posted: number | null;
}
const fx: Fixtures = { published: null, posted: null };

test.beforeAll(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const p = await client.query<{ id: number }>(
      `SELECT id FROM "Listing" WHERE "isPublished" = true AND "lostAt" IS NULL AND "rentPeriod" = 'MONTHLY' AND "priceMonth" > 0 ORDER BY id DESC LIMIT 1`,
    );
    fx.published = p.rows[0]?.id ?? null;
    // The window /today and /tt read: the Kigali day 3 days back, up to now.
    const local = Date.now() + KIGALI_MS;
    const since = new Date(local - (local % DAY) - 3 * DAY - KIGALI_MS);
    const t = await client.query<{ listingId: number }>(
      `SELECT t."listingId" FROM "TikTokPost" t JOIN "Listing" l ON l.id = t."listingId"
        WHERE t.status = 'POSTED' AND t."postedAt" >= $1 AND t."postedAt" <= now() AND l."lostAt" IS NULL AND l."rentPeriod" = 'MONTHLY' AND l."priceMonth" IS NOT NULL
        ORDER BY t."postedAt" DESC LIMIT 1`,
      [since],
    );
    fx.posted = t.rows[0]?.listingId ?? null;
  } finally {
    await client.end();
  }
});

/** Every WhatsApp link on the page, decoded: the text it prefills and the full href. */
async function waLinks(page: Page): Promise<{ href: string; text: string }[]> {
  const hrefs = await page.locator('a[href*="wa.me/"]').evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  return hrefs.map((href) => ({ href, text: decodeURIComponent(new URL(href).searchParams.get("text") ?? "") }));
}

/** Navigate and wait for the document to settle (dev compiles each route on its first hit). */
async function open(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  expect(res?.status(), `${path} status`).toBeLessThan(400);
  await page.locator("main, body").first().waitFor({ state: "attached" });
}

test("/en: the Today strip points to the chat and to WhatsApp with the `today` marker", async ({ page }) => {
  await open(page, "/en");
  const find = page.getByRole("link", { name: "Tell Mkan what you need" });
  await expect(find).toBeVisible();
  await expect(find).toHaveAttribute("href", "/en/find");
  const wa = (await waLinks(page)).filter((l) => /\bmkan_today\b/.test(l.text));
  expect(wa.length, "a WhatsApp link carrying mkan_today").toBeGreaterThan(0);
  // The strip's posters (when something was posted) go to Mkan's page for the home.
  const posters = page.locator('section[aria-label] ul a[href*="/en/k/K"]');
  if ((await posters.count()) > 0) await expect(posters.first()).toHaveAttribute("href", /\/en\/k\/K\d+/);
  else console.log("– no poster in the strip: nothing posted on the branch in 3 days (the two CTAs are still there)");
});

test("/en/today: renders the day's homes, each to /en/k/K…, each with a WhatsApp CTA carrying its code", async ({ page }) => {
  test.skip(fx.posted == null, "no POSTED TikTokPost on a live home in the last 3 Kigali days on this branch");
  await open(page, "/en/today");
  const homes = page.locator('main a[href*="/en/k/K"]');
  await expect(homes.first()).toBeVisible({ timeout: 30_000 });
  const hrefs = await homes.evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute("href")))]);
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(h).toMatch(/^\/en\/k\/K\d+$/);
  const wa = await waLinks(page);
  const coded = wa.filter((l) => /\bK\d+\b/.test(l.text));
  expect(coded.length, "a WhatsApp CTA with a K-code").toBeGreaterThan(0);
  expect(coded.every((l) => /\bmkan_today\b/.test(l.text)), "each coded CTA carries mkan_today").toBe(true);
  expect(coded.map((l) => l.text.match(/K\d+/)![0])).toContain(`K${fx.posted}`);
  await expect(page.getByRole("link", { name: "Check availability on WhatsApp" }).first()).toBeVisible();
});

test("/ar/today: renders right to left", async ({ page }) => {
  await open(page, "/ar/today");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("main, body").first()).toBeVisible();
  // No horizontal scroll at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "horizontal overflow").toBeLessThanOrEqual(1);
});

test("/en/tt: every home's Ask on WhatsApp carries its code and tiktok_bio", async ({ page }) => {
  test.skip(fx.posted == null, "no POSTED TikTokPost on a live home in the last 3 Kigali days on this branch");
  await open(page, "/en/tt");
  const asks = page.getByRole("link", { name: /Ask on WhatsApp/i });
  await expect(asks.first()).toBeVisible({ timeout: 30_000 });
  const wa = await waLinks(page);
  const coded = wa.filter((l) => /\bK\d+\b/.test(l.text));
  expect(coded.length, "per-home WhatsApp links").toBeGreaterThan(0);
  for (const l of coded) {
    expect(l.text, l.href).toMatch(/\bK\d+\b/);
    expect(l.text, l.href).toContain("tiktok_bio");
  }
  expect(coded.map((l) => l.text.match(/K\d+/)![0])).toContain(`K${fx.posted}`);
  // The general button has the marker too (no code).
  expect(wa.some((l) => !/\bK\d+\b/.test(l.text) && l.text.includes("tiktok_bio")), "the general button").toBe(true);
});

test("/en/k/K…: a published home's page has a WhatsApp CTA with Check K…", async ({ page }) => {
  test.skip(fx.published == null, "no published monthly home on this branch");
  await open(page, `/en/k/K${fx.published}`);
  const wa = await waLinks(page);
  const check = wa.filter((l) => l.text.includes(`Check K${fx.published}`));
  expect(check.length, `a WhatsApp CTA with "Check K${fx.published}"`).toBeGreaterThan(0);
  expect(check[0]!.text).toContain("mkan.sd");
});

test("/en/find: the starters have Today's homes, a search offers Continue on WhatsApp with its ref", async ({ page }) => {
  await page.goto("/en/find", { waitUntil: "domcontentloaded", timeout: 90_000 });
  const todayCard = page.getByRole("button", { name: /Today's homes/ });
  await expect(todayCard.first()).toBeVisible({ timeout: 45_000 });

  // Sent before React hydrates, a click goes nowhere: retry until the chat has its address.
  await expect(async () => {
    // The card goes once the chat starts (the turn takes ~10 s in dev): click only while it is there.
    if (!/[?&]c=/.test(page.url()) && (await todayCard.count()) > 0) await todayCard.first().click({ timeout: 3_000 }).catch(() => {});
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 20_000 });
  }).toPass({ timeout: 60_000 });
  // Home cards, or the nothing-posted line — either answers it.
  await expect(page.getByText(/Posted today on Mkan's TikTok|Nothing posted yet today|Nothing has been posted/).first()).toBeVisible({ timeout: 60_000 });

  // A normal search on a chat of its own.
  await page.goto("/en/find", { waitUntil: "domcontentloaded" });
  const box = page.getByRole("textbox").first();
  await expect(async () => {
    if (!/[?&]c=/.test(page.url())) {
      await box.fill("2 bedroom in Kicukiro");
      await box.press("Enter");
    }
    await expect(page).toHaveURL(/[?&]c=/, { timeout: 5_000 });
  }).toPass({ timeout: 45_000 });
  await expect(page.getByText("homes that match").first()).toBeVisible({ timeout: 60_000 });
  const cont = page.getByRole("link", { name: /Continue on WhatsApp|Get the broker's answer on WhatsApp/ });
  await expect(cont.first()).toBeVisible({ timeout: 30_000 });
  const wa = await waLinks(page);
  expect(wa.some((l) => /\bref:[\w-]+/.test(l.text)), "a WhatsApp link whose text carries ref:<chat id>").toBe(true);
});
