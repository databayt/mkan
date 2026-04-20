import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock references are available inside vi.mock factories.
const mocks = vi.hoisted(() => ({
  matchFn: vi.fn().mockReturnValue("en"),
  negotiatorLanguages: vi.fn().mockReturnValue(["en"]),
}));

vi.mock("@formatjs/intl-localematcher", () => ({
  match: mocks.matchFn,
}));

vi.mock("negotiator", () => {
  // Negotiator is called with `new`, so the default export must be a class.
  return {
    default: class MockNegotiator {
      languages() {
        return mocks.negotiatorLanguages();
      }
    },
  };
});

// Mock the i18n config
vi.mock("@/components/internationalization/config", () => ({
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ar"],
  },
}));

// Mock routes
vi.mock("../../routes", () => ({
  publicRoutes: ["/", "/listings", "/search", "/help"],
  authRoutes: ["/login", "/join", "/register", "/reset", "/new-password"],
  protectedPrefixes: ["/dashboard", "/hosting"],
  apiAuthPrefix: "/api/auth",
  DEFAULT_LOGIN_REDIRECT: "/hosting/listings",
}));

import { middleware } from "../../middleware";
import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createRequest(
  path: string,
  options?: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  }
): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  const req = new NextRequest(url, {
    headers: new Headers(options?.headers),
  });

  if (options?.cookies) {
    for (const [name, value] of Object.entries(options.cookies)) {
      req.cookies.set(name, value);
    }
  }

  return req;
}

function isRedirect(response: NextResponse): boolean {
  return response.status >= 300 && response.status < 400;
}

function getRedirectLocation(response: NextResponse): string {
  return response.headers.get("location") ?? "";
}

// ---------------------------------------------------------------------------
// Locale detection & redirect
// ---------------------------------------------------------------------------

describe("middleware — locale detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.matchFn.mockReturnValue("en");
    mocks.negotiatorLanguages.mockReturnValue(["en"]);
  });

  it("redirects bare / to /en when no locale cookie", () => {
    const res = middleware(createRequest("/"));
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/en");
  });

  it("redirects to /ar when NEXT_LOCALE cookie is ar", () => {
    const res = middleware(
      createRequest("/", { cookies: { NEXT_LOCALE: "ar" } })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/ar");
  });

  it("uses Accept-Language header when no cookie", () => {
    mocks.matchFn.mockReturnValue("ar");
    const res = middleware(
      createRequest("/listings", {
        headers: { "accept-language": "ar,en;q=0.5" },
      })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/ar/listings");
  });

  it("defaults to en when locale is unknown", () => {
    mocks.matchFn.mockReturnValue("en");
    const res = middleware(createRequest("/about"));
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/en/about");
  });

  it("sets NEXT_LOCALE cookie on locale redirect", () => {
    const res = middleware(createRequest("/"));
    const setCookie = res!.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("NEXT_LOCALE");
  });

  it("does not redirect when locale already in URL", () => {
    const res = middleware(createRequest("/en/listings"));
    // Should not be a redirect (public route with locale)
    expect(isRedirect(res!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Static & API skipping
// ---------------------------------------------------------------------------

describe("middleware — skip rules", () => {
  it("passes through /_next requests", () => {
    const res = middleware(createRequest("/_next/static/chunk.js"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("passes through /api/auth requests", () => {
    const res = middleware(createRequest("/api/auth/callback/google"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("passes through /api requests", () => {
    const res = middleware(createRequest("/api/listings"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("passes through file requests (paths with dots)", () => {
    const res = middleware(createRequest("/favicon.ico"));
    expect(isRedirect(res!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

describe("middleware — public routes", () => {
  it("allows unauthenticated access to public route with locale", () => {
    const res = middleware(createRequest("/en/listings"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("allows unauthenticated access to root with locale", () => {
    const res = middleware(createRequest("/en"));
    expect(isRedirect(res!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

describe("middleware — auth routes", () => {
  it("allows unauthenticated user to access /en/login", () => {
    const res = middleware(createRequest("/en/login"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("redirects authenticated user away from /en/login", () => {
    const res = middleware(
      createRequest("/en/login", {
        cookies: { "next-auth.session-token": "valid-token" },
      })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/hosting/listings");
  });

  it("redirects authenticated user from /en/join to default redirect", () => {
    const res = middleware(
      createRequest("/en/join", {
        cookies: { "next-auth.session-token": "valid-token" },
      })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/hosting/listings");
  });
});

// ---------------------------------------------------------------------------
// Protected routes
// ---------------------------------------------------------------------------

describe("middleware — protected routes", () => {
  it("redirects unauthenticated user from /en/dashboard to login", () => {
    const res = middleware(createRequest("/en/dashboard"));
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/en/login");
  });

  it("includes callbackUrl when redirecting to login", () => {
    const res = middleware(createRequest("/en/hosting/listings"));
    expect(isRedirect(res!)).toBe(true);
    const location = getRedirectLocation(res!);
    expect(location).toContain("callbackUrl=");
  });

  it("allows authenticated user to access protected route", () => {
    const res = middleware(
      createRequest("/en/dashboard", {
        cookies: { "next-auth.session-token": "valid-token" },
      })
    );
    expect(isRedirect(res!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

describe("middleware — security headers", () => {
  it("sets X-Frame-Options on public route response", () => {
    const res = middleware(createRequest("/en/listings"));
    expect(res!.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options header", () => {
    const res = middleware(createRequest("/en/listings"));
    expect(res!.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Referrer-Policy header", () => {
    const res = middleware(createRequest("/en/listings"));
    expect(res!.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("sets X-XSS-Protection header", () => {
    const res = middleware(createRequest("/en/listings"));
    expect(res!.headers.get("X-XSS-Protection")).toBe("1; mode=block");
  });

  it("sets Permissions-Policy header", () => {
    const res = middleware(createRequest("/en/listings"));
    expect(res!.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });
});
