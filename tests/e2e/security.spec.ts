/**
 * Security — middleware-level protections.
 *
 *   - protected routes redirect to /login when anonymous
 *   - security headers present on all HTML responses
 *   - auth routes redirect logged-in users away from /login
 *   - sensitive env values are never exposed in HTML
 *   - Robots.txt exists and does NOT expose private admin paths
 */
import { test, expect } from "@playwright/test";
import { TEST_USERS, loginViaForm, waitForPageLoad } from "./helpers";

// All routes that the proxy must gate for anonymous users.
// `/dashboard` by itself is not a page (only `/dashboard/properties` etc),
// so it's not included here; the test against it would always 404 instead
// of redirecting, which is a different failure mode than the one we care
// about.
const PROTECTED_PATHS = [
  "/managers/properties",
  "/tenants/favorites",
  "/tenants/residences",
  "/hosting/listings",
  "/offices",
  "/verify-listing/1",
] as const;

test.describe("Security — protected route gating", () => {
  for (const path of PROTECTED_PATHS) {
    test(`anonymous user hitting ${path} is redirected to /login`, async ({ page }) => {
      await page.goto(`/en${path}`);
      await page.waitForURL(/\/(en|ar)\/(login|error)/, { timeout: 10_000 });

      expect(page.url()).toMatch(/\/(en|ar)\/login/);
      // callbackUrl should be preserved for post-login redirect
      expect(page.url()).toContain("callbackUrl=");
    });
  }
});

test.describe("Security — auth routes redirect authenticated users", () => {
  test("/login redirects logged-in user away to DEFAULT_LOGIN_REDIRECT", async ({ page }) => {
    const ok = await loginViaForm(
      page,
      TEST_USERS.tenant.email,
      TEST_USERS.tenant.password,
    );
    if (!ok) {
      test.skip(true, "Login prerequisite failed");
      return;
    }

    await page.goto("/en/login");
    // Middleware should immediately redirect to /hosting/listings (or another app route).
    // If the implementation leaves you on /login, that's a bug we want to surface.
    await page.waitForTimeout(1500);
    expect(
      page.url(),
      "/login should not stay open for a signed-in user",
    ).not.toContain("/login");
  });
});

test.describe("Security — HTTP headers", () => {
  test("GET /en returns security headers", async ({ request }) => {
    const res = await request.get("/en");
    expect(res.status()).toBeLessThan(400);
    const h = res.headers();
    expect(h["x-frame-options"]).toMatch(/DENY|SAMEORIGIN/i);
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBeTruthy();
  });

  test("X-Powered-By is NOT leaked", async ({ request }) => {
    const res = await request.get("/en");
    const h = res.headers();
    expect(h["x-powered-by"]).toBeFalsy();
  });
});

test.describe("Security — no secret leakage in HTML", () => {
  const SECRET_PATTERNS = [
    /NEXTAUTH_SECRET\s*=\s*["'][^"']{8,}["']/,
    /DATABASE_URL\s*=\s*["']postgresql:\/\/[^"']+["']/,
    /sk_live_[A-Za-z0-9]{10,}/,        // Stripe secret
    /AWS_SECRET_ACCESS_KEY/,
    /private_[A-Za-z0-9]{20,}/,         // ImageKit private key
  ];

  const PAGES = ["/en", "/en/listings", "/en/login", "/en/help"];

  for (const path of PAGES) {
    test(`${path} HTML does not contain secrets`, async ({ request }) => {
      const res = await request.get(path);
      const html = await res.text();
      for (const pattern of SECRET_PATTERNS) {
        expect(
          html,
          `HTML of ${path} matched secret pattern ${pattern}`,
        ).not.toMatch(pattern);
      }
    });
  }
});

test.describe("Security — CSRF and origin validation", () => {
  // Cross-origin POST to a state-changing endpoint without a matching Origin
  // header should be refused by NextAuth's built-in CSRF guard. NextAuth's
  // default behavior on missing CSRF token is a 302 to /login?error=MissingCSRF.
  test("cross-origin POST to /api/auth/signin is blocked or CSRF-protected", async ({ request }) => {
    const res = await request.post("/api/auth/signin/credentials", {
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      data: "email=x@y.z&password=pw",
      maxRedirects: 0,
    });
    // Not the 200 OK that would indicate the action actually ran.
    expect([302, 400, 401, 403]).toContain(res.status());
    // If 302, it should redirect to an error page, not to a success route.
    if (res.status() === 302) {
      const loc = res.headers()["location"] ?? "";
      expect(loc.toLowerCase()).toMatch(/error|login|missingcsrf/);
    }
  });
});

test.describe("Security — robots.txt", () => {
  test("GET /robots.txt returns non-empty text", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body.length).toBeGreaterThan(5);
    // Should disallow sensitive routes
    expect(body).toMatch(/Disallow:/);
  });

  test("robots.txt disallows /api and /dashboard-type routes", async ({ request }) => {
    const res = await request.get("/robots.txt");
    const body = await res.text();
    // Accept either /api or /admin or /hosting under Disallow
    expect(body.toLowerCase()).toMatch(/disallow:\s*\/(api|admin|hosting|dashboard)/);
  });
});

test.describe("Security — sitemap.xml", () => {
  test("GET /sitemap.xml returns 200", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");
  });
});
