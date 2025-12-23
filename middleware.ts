import { NextRequest, NextResponse } from 'next/server';
import { localizationMiddleware } from '@/components/internationalization/middleware';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.') // Static files like .ico, .png, etc.
  ) {
    return NextResponse.next();
  }

  // Apply localization middleware for all other routes
  return localizationMiddleware(request);
}

export const config = {
  matcher: [
    // Match all paths except static files and API
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
