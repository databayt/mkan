import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests exercise the Next.js 16 proxy (renamed from middleware) against the
 * same observable surface: status code + `location` header + response
 * headers. Covers every route class so a silent rename won't break auth
 * gating again (see OPTIMIZATION_PLAN.md §0 and BMAD Epic F3).
 */

const mocks = vi.hoisted(() => ({
  matchFn: vi.fn().mockReturnValue("en"),
  negotiatorLanguages: vi.fn().mockReturnValue(["en"]),
}));

vi.mock("@formatjs/intl-localematcher", () => ({
  match: mocks.matchFn,
}));

vi.mock("negotiator", () => ({
  default: class MockNegotiator {
    languages() {
      return mocks.negotiatorLanguages();
    }
  },
}));

vi.mock("@/components/internationalization/config", () => ({
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ar"],
  },
}));

vi.mock("../../routes", () => ({
  publicRoutes: ["/", "/listings", "/search", "/help"],
  authRoutes: ["/login", "/join", "/register", "/reset", "/new-password"],
  protectedPrefixes: ["/dashboard", "/hosting"],
  apiAuthPrefix: "/api/auth",
  DEFAULT_LOGIN_REDIRECT: "/hosting/listings",
}));

import { proxy } from "../../src/proxy";
import { NextRequest, NextResponse } from "next/server";

function createRequest(
  path: string,
  options?: {
    method?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  }
): NextRequest {
  const url = new URL(path, "http://localhost:3000");
  const req = new NextRequest(url, {
    method: options?.method ?? "GET",
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

describe("proxy — locale detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.matchFn.mockReturnValue("en");
    mocks.negotiatorLanguages.mockReturnValue(["en"]);
  });

  it("redirects bare / to /en when no locale cookie", () => {
    const res = proxy(createRequest("/"));
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/en");
  });

  it("redirects to /ar when NEXT_LOCALE cookie is ar", () => {
    const res = proxy(
      createRequest("/", { cookies: { NEXT_LOCALE: "ar" } })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/ar");
  });

  it("uses Accept-Language header when no cookie", () => {
    mocks.matchFn.mockReturnValue("ar");
    const res = proxy(
      createRequest("/listings", {
        headers: { "accept-language": "ar,en;q=0.5" },
      })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/ar/listings");
  });

  it("defaults to en when locale is unknown", () => {
    mocks.matchFn.mockReturnValue("en");
    const res = proxy(createRequest("/about"));
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/en/about");
  });

  it("sets NEXT_LOCALE cookie on locale redirect", () => {
    const res = proxy(createRequest("/"));
    const setCookie = res!.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("NEXT_LOCALE");
  });

  it("does not redirect when locale already in URL", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(isRedirect(res!)).toBe(false);
  });
});

describe("proxy — skip rules", () => {
  it("passes through /_next requests", () => {
    const res = proxy(createRequest("/_next/static/chunk.js"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("passes through /api/auth requests", () => {
    const res = proxy(createRequest("/api/auth/callback/google"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("passes through /api requests (GET)", () => {
    const res = proxy(createRequest("/api/listings"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("passes through file requests (paths with dots)", () => {
    const res = proxy(createRequest("/favicon.ico"));
    expect(isRedirect(res!)).toBe(false);
  });
});

describe("proxy — public routes", () => {
  it("allows unauthenticated access to public route with locale", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("allows unauthenticated access to root with locale", () => {
    const res = proxy(createRequest("/en"));
    expect(isRedirect(res!)).toBe(false);
  });
});

describe("proxy — auth routes", () => {
  it("allows unauthenticated user to access /en/login", () => {
    const res = proxy(createRequest("/en/login"));
    expect(isRedirect(res!)).toBe(false);
  });

  it("redirects authenticated user away from /en/login", () => {
    const res = proxy(
      createRequest("/en/login", {
        cookies: { "next-auth.session-token": "valid-token" },
      })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/hosting/listings");
  });

  it("redirects authenticated user from /en/join to default redirect", () => {
    const res = proxy(
      createRequest("/en/join", {
        cookies: { "next-auth.session-token": "valid-token" },
      })
    );
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/hosting/listings");
  });
});

describe("proxy — protected routes", () => {
  it("redirects unauthenticated user from /en/dashboard to login", () => {
    const res = proxy(createRequest("/en/dashboard"));
    expect(isRedirect(res!)).toBe(true);
    expect(getRedirectLocation(res!)).toContain("/en/login");
  });

  it("includes callbackUrl when redirecting to login", () => {
    const res = proxy(createRequest("/en/hosting/listings"));
    expect(isRedirect(res!)).toBe(true);
    const location = getRedirectLocation(res!);
    expect(location).toContain("callbackUrl=");
  });

  it("allows authenticated user to access protected route", () => {
    const res = proxy(
      createRequest("/en/dashboard", {
        cookies: { "next-auth.session-token": "valid-token" },
      })
    );
    expect(isRedirect(res!)).toBe(false);
  });
});

describe("proxy — security headers", () => {
  it("sets X-Frame-Options on public route response", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(res!.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options header", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(res!.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets Referrer-Policy header", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(res!.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
  });

  it("sets X-XSS-Protection header", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(res!.headers.get("X-XSS-Protection")).toBe("1; mode=block");
  });

  it("sets Permissions-Policy header", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(res!.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()"
    );
  });

  it("sets X-Mw-Ran sanity marker on every response", () => {
    const res = proxy(createRequest("/en/listings"));
    expect(res!.headers.get("X-Mw-Ran")).toBe("1");
  });

  it("emits Content-Security-Policy-Report-Only in dev", () => {
    const res = proxy(createRequest("/en/listings"));
    // In test env NODE_ENV=test, so dev CSP applies
    const csp = res!.headers.get("Content-Security-Policy-Report-Only");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
  });
});

describe("proxy — Origin/Host CSRF defense", () => {
  it("blocks cross-origin POST to /api/upload", () => {
    const res = proxy(
      createRequest("/api/upload", {
        method: "POST",
        headers: {
          origin: "https://evil.example.com",
          host: "localhost:3000",
        },
      })
    );
    expect(res!.status).toBe(403);
  });

  it("allows same-origin POST to /api/upload", () => {
    const res = proxy(
      createRequest("/api/upload", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
      })
    );
    expect(res!.status).not.toBe(403);
  });

  it("allows POST without Origin header (top-level form submit)", () => {
    const res = proxy(
      createRequest("/api/upload", {
        method: "POST",
        headers: { host: "localhost:3000" },
      })
    );
    expect(res!.status).not.toBe(403);
  });

  it("allows GET cross-origin (not state-changing)", () => {
    const res = proxy(
      createRequest("/api/listings", {
        method: "GET",
        headers: {
          origin: "https://evil.example.com",
          host: "localhost:3000",
        },
      })
    );
    expect(res!.status).not.toBe(403);
  });

  it("skips Origin check for /api/auth (NextAuth has own CSRF)", () => {
    const res = proxy(
      createRequest("/api/auth/callback/google", {
        method: "POST",
        headers: {
          origin: "https://accounts.google.com",
          host: "localhost:3000",
        },
      })
    );
    expect(res!.status).not.toBe(403);
  });
});
