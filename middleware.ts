import { NextRequest, NextResponse } from 'next/server';
import { match } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';
import { i18n } from './src/components/internationalization/config';
import {
  publicRoutes,
  authRoutes,
  protectedPrefixes,
  apiAuthPrefix,
  DEFAULT_LOGIN_REDIRECT,
} from './routes';

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
// Security headers
// ---------------------------------------------------------------------------

function addSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://api.mapbox.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.mapbox.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https://api.mapbox.com https://*.imagekit.io https://*.sentry.io",
      "frame-src 'self' https://www.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ');

    response.headers.set('Content-Security-Policy', csp);
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
// Middleware
// ---------------------------------------------------------------------------

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files, API routes, and auth API
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

  // If no locale in URL, redirect to add it (existing i18n behavior)
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
    // Not logged in — let them through to the auth page
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

  // Protected routes (and any non-public route): require session cookie
  if (!loggedIn && (isProtectedRoute(path) || !isPublicRoute(path))) {
    const callbackUrl = encodeURIComponent(pathname);
    request.nextUrl.pathname = `/${locale}/login`;
    request.nextUrl.search = `?callbackUrl=${callbackUrl}`;
    const response = NextResponse.redirect(request.nextUrl);
    addSecurityHeaders(response);
    return response;
  }

  // Authenticated user on a non-public/non-auth route — let through
  const response = NextResponse.next();
  addSecurityHeaders(response);
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
