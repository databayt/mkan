/**
 * Next.js 16 Proxy (formerly "middleware"). Runs at the edge before pages
 * and API routes resolve. Responsibilities:
 *   1. Enforce locale prefix on all page routes (redirect if missing).
 *   2. Route-level auth gating (redirect anonymous users to /login).
 *   3. Attach security headers (X-Frame-Options, CSP in production, etc.).
 *
 * File was renamed from middleware.ts to proxy.ts per the Next 16
 * migration: https://nextjs.org/docs/messages/middleware-to-proxy
 */
import { NextRequest, NextResponse } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { i18n } from './components/internationalization/config';
import {
  publicRoutes,
  authRoutes,
  protectedPrefixes,
  apiAuthPrefix,
  DEFAULT_LOGIN_REDIRECT,
} from '../routes';

const locales: readonly string[] = i18n.locales;
const defaultLocale = i18n.defaultLocale;

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

function isAuthenticated(request: NextRequest): boolean {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieName = isProduction
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';
  return !!request.cookies.get(cookieName)?.value;
}

function getPathWithoutLocale(pathname: string): string {
  for (const locale of locales) {
    if (pathname.startsWith(`/${locale}/`)) return pathname.slice(locale.length + 1);
    if (pathname === `/${locale}`) return '/';
  }
  return pathname;
}

function isPublicRoute(path: string): boolean {
  return (
    publicRoutes.includes(path) ||
    publicRoutes.some((route) => path.startsWith(route + '/'))
  );
}

function isAuthRoute(path: string): boolean {
  return authRoutes.includes(path);
}

function isProtectedRoute(path: string): boolean {
  return protectedPrefixes.some((prefix) => path.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Origin check (CSRF defense-in-depth beyond NextAuth's own token)
// ---------------------------------------------------------------------------

/**
 * For state-changing methods, require Origin header to match Host header.
 * Blocks cross-origin form posts from attacker-controlled pages that ride
 * the victim's session cookie. Browsers omit Origin on top-level form GETs
 * but send it on POST/PUT/PATCH/DELETE, so same-origin flows pass cleanly.
 */
function isOriginMismatch(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;

  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;

  // ALLOWED_ORIGINS lets staging/preview environments accept known external
  // origins (Stripe webhooks, Vercel preview frames, etc.). Comma-separated.
  const extraOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  try {
    const originHost = new URL(origin).host;
    if (originHost === host) return false;
    if (extraOrigins.some((allowed) => origin === allowed)) return false;
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

function buildCsp(options: { isDev: boolean }): string {
  // unsafe-eval is required by Next dev for HMR. In production it's dropped.
  // unsafe-inline is retained until Phase 4 ships per-request nonce threading
  // through `next/headers` into inline <script> tags (see plan EPIC F2.S5 and
  // Phase 4 Q3). Removing it prematurely breaks Next.js inline bootstrap.
  const scriptSrc = options.isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://api.mapbox.com https://js.stripe.com"
    : "script-src 'self' 'unsafe-inline' https://maps.googleapis.com https://api.mapbox.com https://js.stripe.com";

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.mapbox.com https://*.imagekit.io https://api.stripe.com https://translation.googleapis.com",
    "frame-src 'self' https://www.google.com https://js.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
}

function addSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Sanity marker — integration tests assert this to confirm the proxy
  // actually executed on a given response.
  response.headers.set('X-Mw-Ran', '1');

  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
    response.headers.set('Content-Security-Policy', buildCsp({ isDev: false }));
  } else {
    // Dev ships CSP in Report-Only mode so violations surface in the console
    // without breaking the inner-loop. Upgrade to enforced once Phase 4 ships
    // the nonce flow.
    response.headers.set(
      'Content-Security-Policy-Report-Only',
      buildCsp({ isDev: true })
    );
  }
}

// ---------------------------------------------------------------------------
// Locale detection
// ---------------------------------------------------------------------------

function getLocale(request: NextRequest) {
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value;
  if (cookieLocale && locales.includes(cookieLocale)) {
    return cookieLocale;
  }

  const headers = {
    'accept-language': request.headers.get('accept-language') ?? '',
  };

  const languages = new Negotiator({ headers }).languages();
  return match(languages, locales, defaultLocale);
}

// ---------------------------------------------------------------------------
// Proxy (Next 16 export name)
// ---------------------------------------------------------------------------

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Origin/Host check runs for every state-changing request, including API
  // routes. NextAuth's own endpoints handle CSRF via rotating tokens, so we
  // skip them here to avoid double-rejecting legitimate OAuth callbacks.
  if (!pathname.startsWith(apiAuthPrefix) && isOriginMismatch(request)) {
    return new NextResponse('Forbidden: cross-origin request blocked', {
      status: 403,
      headers: { 'X-Mw-Ran': '1' },
    });
  }

  // Skip proxy for static files, API routes, and auth API
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith(apiAuthPrefix) ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // --- Locale handling ---------------------------------------------------

  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  // Determine the locale (from URL, cookie, or Accept-Language)
  const locale = pathnameHasLocale
    ? locales.find(
        (l) => pathname.startsWith(`/${l}/`) || pathname === `/${l}`
      )!
    : getLocale(request);

  // If no locale in URL, redirect to add it
  if (!pathnameHasLocale) {
    request.nextUrl.pathname = `/${locale}${pathname}`;
    const response = NextResponse.redirect(request.nextUrl);

    response.cookies.set('NEXT_LOCALE', locale, {
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    addSecurityHeaders(response);
    return response;
  }

  // --- Auth checking (runs only when locale is present) ------------------

  const path = getPathWithoutLocale(pathname);
  const loggedIn = isAuthenticated(request);

  // Auth routes: if already logged in, redirect away from login/join pages
  if (isAuthRoute(path)) {
    if (loggedIn) {
      request.nextUrl.pathname = `/${locale}${DEFAULT_LOGIN_REDIRECT}`;
      const response = NextResponse.redirect(request.nextUrl);
      addSecurityHeaders(response);
      return response;
    }
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Public routes: always accessible
  if (isPublicRoute(path)) {
    const response = NextResponse.next();
    addSecurityHeaders(response);
    return response;
  }

  // Protected routes: require session cookie.
  // NOTE: only redirect when the route is *explicitly* protected. Unknown
  // paths fall through so Next's not-found handler can render a 404 —
  // previously we redirected every non-public path to /login which hid
  // legitimate 404s behind an auth wall.
  if (!loggedIn && isProtectedRoute(path)) {
    const callbackUrl = encodeURIComponent(pathname);
    request.nextUrl.pathname = `/${locale}/login`;
    request.nextUrl.search = `?callbackUrl=${callbackUrl}`;
    const response = NextResponse.redirect(request.nextUrl);
    addSecurityHeaders(response);
    return response;
  }

  // Everything else (authenticated users on any route, anonymous users on
  // unknown paths, etc.) — let through so the app router can resolve.
  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
