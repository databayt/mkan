'use client';

import { useEffect, useState } from 'react';

function AlertTriangle({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

// Self-contained copy — this root boundary sits above the [lang] segment, so
// the locale is read from <html lang> (set by the locale layout) with the app
// default of Arabic as the fallback.
const COPY = {
  en: {
    title: 'Oops! Something went wrong',
    description:
      'We encountered an unexpected error. Our team has been notified and is working on a fix.',
    devDetails: 'Error details (development only)',
    errorId: 'Error ID:',
    retry: 'Try again',
    goHome: 'Go home',
    contact: 'If this problem persists, please contact support',
  },
  ar: {
    title: 'عذرًا! حدث خطأ ما',
    description: 'حدث خطأ غير متوقع. تم إخطار فريقنا ويعمل على إصلاحه.',
    devDetails: 'تفاصيل الخطأ (وضع التطوير فقط)',
    errorId: 'معرّف الخطأ:',
    retry: 'إعادة المحاولة',
    goHome: 'الصفحة الرئيسية',
    contact: 'إذا استمرت المشكلة، يرجى التواصل مع الدعم',
  },
} as const;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Resolve after mount so SSR and the first client render agree (avoids a
  // hydration mismatch); the app default of Arabic is used until then.
  const [lang, setLang] = useState<'en' | 'ar'>('ar');
  useEffect(() => {
    setLang(document.documentElement.lang === 'en' ? 'en' : 'ar');
  }, []);
  const t = COPY[lang];

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
          <h1 className="text-2xl font-bold text-gray-900">{t.title}</h1>
          <p className="text-gray-600">{t.description}</p>

          {process.env.NODE_ENV === 'development' && error.message && (
            <details className="mt-4 text-start">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                {t.devDetails}
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs font-mono bg-gray-100 p-2 rounded overflow-auto">
                  {error.message}
                </p>
                {error.digest && (
                  <p className="text-xs text-gray-500">
                    {t.errorId} {error.digest}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>

        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-gray-900 px-6 py-3 text-sm font-medium text-white hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            {t.retry}
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-6 py-3 text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
          >
            {t.goHome}
          </button>
        </div>

        <p className="text-xs text-gray-500">{t.contact}</p>
      </div>
    </div>
  );
}
