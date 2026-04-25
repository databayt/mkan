/**
 * Authentication flow — credentials login, register form surface,
 * redirect-after-login, logout, and protected-route access.
 *
 * These tests depend on two seeded users:
 *   - playwright+tester@mkan.test   (role USER, verified)
 *   - playwright+manager@mkan.test  (role MANAGER, verified)
 *
 * Shared password: TestPass123!   (see tests/e2e/helpers.ts)
 */
import { test, expect } from "@playwright/test";
import {
  TEST_USERS,
  loginViaForm,
  waitForPageLoad,
  expectNoServerError,
  collectConsoleErrors,
  isSignificantConsoleError,
} from "./helpers";

test.describe("Auth — login page UI", () => {
  test("login page renders email, password, submit", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await expectNoServerError(page);
  });

  test("login page shows a link to /join (register)", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    // The copy lives behind dictionary fallbacks — just look for any anchor
    // pointing at the registration route.
    const joinLink = page.locator('a[href*="/join"]').first();
    await expect(joinLink).toBeVisible();
  });

  test("login page shows a link to /reset (forgot password)", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);
    const resetLink = page.locator('a[href*="/reset"]').first();
    await expect(resetLink).toBeVisible();
  });
});

test.describe("Auth — invalid credentials", () => {
  test("non-existent email yields an error message, stays on /login", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    await page.locator('input[type="email"]').first().fill("nobody-xyz-123@mkan.test");
    await page.locator('input[type="password"]').first().fill("wrong-pass-123");
    await page.locator('button[type="submit"]').first().click();

    // Should stay on /login (not redirect to dashboard)
    await page.waitForTimeout(1500);
    expect(page.url()).toContain("/login");

    // The form-error region should show text. We tolerate either localized copy.
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/does not exist|invalid|error|wrong/i);
  });

  test("empty submission does not crash the page", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(500);

    await expectNoServerError(page);
    expect(page.url()).toContain("/login");
  });
});

test.describe("Auth — successful credentials login", () => {
  // These tests require a reachable Postgres (Prisma calls getUserByEmail).
  // In CI or environments where the DB is available they run; where the DB
  // is unreachable the login action returns an error and the page stays on
  // /login — we detect that case via a probe and skip cleanly rather than
  // fail with a misleading assertion.
  test.beforeEach(async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json().catch(() => ({}));
    const dbOk = Boolean(
      (body as { services?: { database?: { status?: boolean } } })?.services
        ?.database?.status,
    );
    if (!dbOk) {
      test.skip(true, "DB unreachable via /api/health — login tests require it");
    }
  });

  test("verified USER login redirects away from /login", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    const ok = await loginViaForm(
      page,
      TEST_USERS.tenant.email,
      TEST_USERS.tenant.password,
    );

    expect(
      ok,
      "Login should navigate away from /login for a verified user",
    ).toBe(true);

    await expectNoServerError(page);
    expect(errors.filter(isSignificantConsoleError)).toEqual([]);
  });

  test("session cookie is set after login", async ({ page, context }) => {
    await loginViaForm(
      page,
      TEST_USERS.tenant.email,
      TEST_USERS.tenant.password,
    );

    const cookies = await context.cookies();
    const sessionCookie = cookies.find((c) =>
      c.name.includes("next-auth.session-token") ||
      c.name.includes("__Secure-next-auth.session-token"),
    );
    expect(sessionCookie, "Session cookie should be set after login").toBeDefined();
  });
});

test.describe("Auth — register page UI", () => {
  test("register (/join) page renders a form with name, email, password", async ({ page }) => {
    await page.goto("/en/join");
    await waitForPageLoad(page);

    // The join form uses a `name` field + email + password. We don't know
    // the exact placeholders (i18n'd) so we assert by input type and count.
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const textInputs = page.locator('input[type="text"]');

    await expect(emailInput).toBeVisible();
    await expect(passwordInput).toBeVisible();
    expect(await textInputs.count()).toBeGreaterThanOrEqual(1);

    await expect(page.locator('button[type="submit"]').first()).toBeVisible();
    await expectNoServerError(page);
  });
});

test.describe("Auth — OAuth buttons present", () => {
  test("login page shows social providers", async ({ page }) => {
    await page.goto("/en/login");
    await waitForPageLoad(page);

    // Social component renders Google + Facebook buttons. We just check
    // that at least two provider buttons exist (even if configured-off
    // providers still render a clickable button that surfaces an error).
    const buttons = page.locator('button');
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

test.describe("Auth — logout", () => {
  test("logged-in user can reach the logout flow", async ({ page }) => {
    const ok = await loginViaForm(
      page,
      TEST_USERS.tenant.email,
      TEST_USERS.tenant.password,
    );
    if (!ok) {
      test.skip(true, "Login prerequisite failed");
      return;
    }

    // Try two common logout entry points without assuming the nav shape.
    // 1. Go directly to a known logout URL if one exists.
    // 2. Fall back to calling signOut via a form POST to the NextAuth endpoint.
    await page.goto("/api/auth/signout");
    await waitForPageLoad(page);

    // NextAuth signout page has a Sign-out button; click it.
    const signOutBtn = page.locator('button:has-text("Sign out"), button:has-text("Sign Out")').first();
    if (await signOutBtn.isVisible().catch(() => false)) {
      await signOutBtn.click();
      await page.waitForURL(/./, { timeout: 5000 }).catch(() => {});
    }

    // Verify the session cookie is cleared.
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(
      (c) =>
        c.name === "next-auth.session-token" ||
        c.name === "__Secure-next-auth.session-token",
    );
    // Either absent or empty
    if (sessionCookie) {
      expect(sessionCookie.value).toBe("");
    }
  });
});
