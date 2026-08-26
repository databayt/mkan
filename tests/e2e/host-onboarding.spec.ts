/**
 * Host (homes) onboarding — full create flow.
 *
 * Proves the end-to-end path a real host takes:
 *   1. log in as a RANDOM seeded homes account (0001..0020 / 1234),
 *   2. start a new listing from /host/overview ("Get started"),
 *   3. land in the wizard on a freshly-created draft they OWN,
 *   4. advance through the first step (ownership gate passes for own listing),
 *   5. and confirm the route-boundary ownership gate rejects a listing the
 *      logged-in host does NOT own (the bug this flow regressed on).
 *
 * Note on scope: a true *publish* requires a photo upload (ImageKit), which is
 * out of scope for reliable headless automation — the per-step UI widgets and
 * the publish requirements are covered by the unit tests. This spec verifies
 * the create + ownership behaviour, which is what actually broke.
 */
import { test, expect, type Page } from "@playwright/test";
import { waitForPageLoad } from "./helpers";

// Seeded "homes" demo hosts: 0001 .. 0020, password 1234. The account number is the
// whole identity — there is no address behind it any more.
const HOMES_ACCOUNTS = Array.from(
  { length: 20 },
  (_, i) => String(i + 1).padStart(4, "0"),
);
const PASSWORD = process.env.HOMES_TEST_PASSWORD ?? "1234";

function pickRandomAccount(): string {
  return HOMES_ACCOUNTS[Math.floor(Math.random() * HOMES_ACCOUNTS.length)];
}

async function dismissCookieBanner(page: Page): Promise<void> {
  const accept = page.getByRole("button", { name: /accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click().catch(() => {});
  }
}

/** Log in via the real credentials form (the `identifier` field accepts email). */
async function login(page: Page, email: string): Promise<void> {
  await page.goto("/en/login");
  await waitForPageLoad(page);
  await dismissCookieBanner(page);

  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  // Submit with Enter — the credentials action can be slow on a cold DB
  // connection, so allow generous headroom before the post-login redirect.
  await page.press('input[name="password"]', "Enter");

  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 45_000,
  });
}

test.describe("Host onboarding — create a listing", () => {
  // Credentials login + draft creation cross several Prisma round-trips that can
  // be slow on a cold Neon connection; give each test plenty of headroom.
  test.setTimeout(90_000);

  // Login + create touch Postgres (Prisma). The probe both gates on DB
  // reachability AND warms the connection before the timed login. Where the DB
  // is unreachable, skip cleanly rather than fail (mirrors auth.spec).
  test.beforeEach(async ({ request }) => {
    const res = await request.get("/api/health");
    const body = (await res.json().catch(() => ({}))) as {
      services?: { database?: { status?: boolean } };
    };
    test.skip(
      !body?.services?.database?.status,
      "DB unreachable via /api/health — onboarding tests require it",
    );
  });

  test("a random homes host creates a draft and enters the wizard they own", async ({
    page,
  }) => {
    const account = pickRandomAccount();
    await login(page, account);

    await page.goto("/en/host/overview");
    await waitForPageLoad(page);
    await dismissCookieBanner(page);

    // "Get started" creates the draft listing and routes into the wizard.
    await page.getByRole("button", { name: /get started/i }).click();
    await page.waitForURL(/\/host\/\d+\/about-place/, { timeout: 15_000 });

    const match = page.url().match(/\/host\/(\d+)\//);
    expect(match, "wizard URL should carry a numeric listing id").not.toBeNull();
    const listingId = Number(match![1]);
    expect(listingId).toBeGreaterThan(0);

    // The owner can advance — the route-boundary ownership gate lets them
    // through for their own listing (about-place -> structure).
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.waitForURL(/\/host\/\d+\/structure/, { timeout: 10_000 });
    expect(page.url()).toContain(`/host/${listingId}/structure`);
  });

  test("the wizard redirects a host away from a listing they do not own", async ({
    page,
  }) => {
    await login(page, pickRandomAccount());

    // No host owns id 99999999 — the ownership gate must redirect to the
    // locale home instead of rendering the wizard.
    await page.goto("/en/host/99999999/about-place");
    await page.waitForURL((url) => !url.pathname.includes("/host/99999999"), {
      timeout: 10_000,
    });

    expect(new URL(page.url()).pathname).toBe("/en");
  });
});
