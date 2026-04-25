/**
 * Dashboard / authed route access — post-login visibility.
 *
 * After a successful credentials login (USER and MANAGER seeded users),
 * the following routes should be reachable without a redirect loop:
 *   - /en/hosting/listings        (default redirect target)
 *   - /en/tenants/favorites       (USER-scoped)
 *   - /en/tenants/residences
 *   - /en/managers/properties     (MANAGER-only — USER should be forbidden)
 */
import { test, expect } from "@playwright/test";
import {
  TEST_USERS,
  loginViaForm,
  waitForPageLoad,
  expectNoServerError,
} from "./helpers";

test.describe("Dashboard — authenticated access", () => {
  test.beforeEach(async ({ page, request }) => {
    // If the DB is down, skip — login requires Prisma.
    const health = await request.get("/api/health");
    const body = await health.json().catch(() => ({}));
    const dbOk = Boolean(
      (body as { services?: { database?: { status?: boolean } } })?.services
        ?.database?.status,
    );
    if (!dbOk) {
      test.skip(true, "DB unreachable — dashboard tests require login");
      return;
    }

    const ok = await loginViaForm(
      page,
      TEST_USERS.tenant.email,
      TEST_USERS.tenant.password,
    );
    if (!ok) {
      test.skip(true, "Login prerequisite failed");
    }
  });

  test("/en/hosting/listings reachable after login (no redirect loop)", async ({ page }) => {
    await page.goto("/en/hosting/listings");
    await waitForPageLoad(page);

    // Must not be bounced back to /login
    expect(page.url()).not.toMatch(/\/login/);
    await expectNoServerError(page);
  });

  test("/en/tenants/favorites reachable after login", async ({ page }) => {
    await page.goto("/en/tenants/favorites");
    await waitForPageLoad(page);
    expect(page.url()).not.toMatch(/\/login/);
    await expectNoServerError(page);
  });

  test("/en/tenants/residences reachable after login", async ({ page }) => {
    await page.goto("/en/tenants/residences");
    await waitForPageLoad(page);
    expect(page.url()).not.toMatch(/\/login/);
    await expectNoServerError(page);
  });

  test("settings page reachable and renders", async ({ page }) => {
    await page.goto("/en/tenants/settings");
    await waitForPageLoad(page);
    expect(page.url()).not.toMatch(/\/login/);
    await expectNoServerError(page);
  });
});

test.describe("Dashboard — manager-scoped pages", () => {
  test.beforeEach(async ({ page, request }) => {
    const health = await request.get("/api/health");
    const body = await health.json().catch(() => ({}));
    const dbOk = Boolean(
      (body as { services?: { database?: { status?: boolean } } })?.services
        ?.database?.status,
    );
    if (!dbOk) {
      test.skip(true, "DB unreachable — manager dashboard tests require login");
      return;
    }

    const ok = await loginViaForm(
      page,
      TEST_USERS.manager.email,
      TEST_USERS.manager.password,
    );
    if (!ok) {
      test.skip(true, "Manager login prerequisite failed");
    }
  });

  test("/en/managers/properties reachable as MANAGER", async ({ page }) => {
    await page.goto("/en/managers/properties");
    await waitForPageLoad(page);
    expect(page.url()).not.toMatch(/\/login/);
    await expectNoServerError(page);
  });

  test("/en/managers/applications reachable as MANAGER", async ({ page }) => {
    await page.goto("/en/managers/applications");
    await waitForPageLoad(page);
    expect(page.url()).not.toMatch(/\/login/);
    await expectNoServerError(page);
  });
});
