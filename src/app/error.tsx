'use client';

import { useEffect } from 'react';

// Inline SVG + native buttons instead of `lucide-react` / `@/components/ui/button`:
// Turbopack's error.tsx boundary fires before lazy chunks finish loading, so any
// external component import fails with "module factory is not available". Keep
// this file dependency-light — only `react` is safe to import here.
function AlertTriangle({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured client-side error log; the structured logger picks this up
    // via the Next.js framework's runtime logs (Vercel) or stdout (dev). No
    // external SaaS — Sentry was removed for Next 16 / Vercel ESM compat.
    console.error("client_error", {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      url: typeof window !== "undefined" ? window.location.href : null,
    });
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-red-100 p-4">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">
            Oops! Something went wrong
          </h1>
          <p className="text-gray-600">
            We encountered an unexpected error. Our team has been notified and is working on a fix.
          </p>
          
          {process.env.NODE_ENV === 'development' && error.message && (
            <details className="mt-4 text-start">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Error details (development only)
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs font-mono bg-gray-100 p-2 rounded overflow-auto">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="text-xs text-gray-500">
                    Error ID: {error.digest}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Try again
          </button>
          <button
            onClick={() => (window.location.href = '/')}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Go home
          </button>
        </div>

        <p className="text-xs text-gray-500">
          If this problem persists, please contact support
        </p>
      </div>
    </div>
  );
}