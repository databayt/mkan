import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { localizationMiddleware } from '@/components/internationalization/middleware';
import { i18n } from '@/components/internationalization/config';
import { rateLimitWithFallback, rateLimitResponse } from '@/lib/rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Apply localization middleware first for non-API and non-static routes
  const shouldApplyLocalization = !pathname.startsWith('/api/') &&
                                  !pathname.startsWith('/_next/') &&
                                  !pathname.startsWith('/favicon.ico') &&
                                  !pathname.includes('.');

  if (shouldApplyLocalization) {
    // Check if pathname already has a locale
    const pathnameHasLocale = i18n.locales.some(
      (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
    );

    if (!pathnameHasLocale) {
      // Apply localization redirect
      return localizationMiddleware(request);
    }
  }

  const response = NextResponse.next();

  // Security headers for all environments
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');

  if (isProduction) {
    // Strict Transport Security (HSTS)
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );

    // Enhanced Content Security Policy for production
    const cspDirectives = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: https: blob: https://ik.imagekit.io",
      "connect-src 'self' https://api.imagekit.io https://upload.imagekit.io https://www.google-analytics.com wss: https://vitals.vercel-insights.com",
      "frame-src 'self' https://www.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "manifest-src 'self'",
      "upgrade-insecure-requests"
    ];

    response.headers.set('Content-Security-Policy', cspDirectives.join('; '));

    // Additional security headers
    response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
    response.headers.set('X-Download-Options', 'noopen');
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  // Enhanced rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Determine rate limit tier based on endpoint
    let limiterType: 'api' | 'auth' | 'upload' | 'search' | 'payment' = 'api';

    const apiPath = request.nextUrl.pathname;
    if (apiPath.includes('/auth/') || apiPath.includes('/login') || apiPath.includes('/register')) {
      limiterType = 'auth';
    } else if (apiPath.includes('/upload')) {
      limiterType = 'upload';
    } else if (apiPath.includes('/search')) {
      limiterType = 'search';
    } else if (apiPath.includes('/payment') || apiPath.includes('/stripe')) {
      limiterType = 'payment';
    }

    // Apply rate limiting
    const rateLimitResult = await rateLimitWithFallback(request, limiterType);

    if (!rateLimitResult.success) {
      const retryAfter = rateLimitResult.reset - Date.now();
      return rateLimitResponse(
        `Too many requests. Please try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
        retryAfter
      );
    }

    // Add rate limit headers to response
    response.headers.set('X-RateLimit-Limit', String(rateLimitResult.limit));
    response.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
    response.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.reset).toISOString());
  }

  // CSRF Protection for state-changing requests
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');

    if (isProduction && origin) {
      // Validate origin in production
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [`https://${host}`];
      if (!allowedOrigins.includes(origin)) {
        return NextResponse.json(
          { error: 'CSRF validation failed' },
          { status: 403 }
        );
      }
    }
  }

  // Protected routes check (with locale support)
  const protectedPaths = [
    '/dashboard',
    '/managers',
    '/tenants',
    '/hosting',
    '/host',
  ];

  // Check if path contains protected routes (accounting for locale prefix)
  const pathWithoutLocale = pathname.replace(
    new RegExp(`^/(${i18n.locales.join('|')})`),
    ''
  );

  const isProtectedPath = protectedPaths.some(path =>
    pathWithoutLocale.startsWith(path) || pathname.startsWith(path)
  );

  if (isProtectedPath) {
    const session = await auth();

    if (!session) {
      // Extract locale from pathname if present
      const localeMatch = pathname.match(new RegExp(`^/(${i18n.locales.join('|')})`));
      const locale = localeMatch ? localeMatch[1] : i18n.defaultLocale;

      const url = new URL(`/${locale}/login`, request.url);
      url.searchParams.set('callbackUrl', request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }

    // Role-based access control (check both with and without locale prefix)
    const checkPath = (path: string) => {
      return pathWithoutLocale.startsWith(path) || pathname.startsWith(path);
    };

    if (checkPath('/managers') && session.user.role !== 'MANAGER') {
      const localeMatch = pathname.match(new RegExp(`^/(${i18n.locales.join('|')})`));
      const locale = localeMatch ? localeMatch[1] : i18n.defaultLocale;
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }

    if (checkPath('/tenants') && session.user.role !== 'TENANT') {
      const localeMatch = pathname.match(new RegExp(`^/(${i18n.locales.join('|')})`));
      const locale = localeMatch ? localeMatch[1] : i18n.defaultLocale;
      return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths INCLUDING API routes for comprehensive protection
     * Exclude only static assets
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
