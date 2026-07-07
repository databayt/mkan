"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

// Self-contained copy map — an error boundary must not depend on the dictionary
// provider (the crash may be the provider itself). Locale comes from the route
// param; the app default is Arabic.
const COPY = {
  en: {
    title: "Something went wrong",
    fallback: "An unexpected error occurred. Please try again.",
    errorId: "Error ID:",
    retry: "Try again",
  },
  ar: {
    title: "حدث خطأ ما",
    fallback: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
    errorId: "معرّف الخطأ:",
    retry: "إعادة المحاولة",
  },
} as const;

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const t = COPY[params?.lang === "en" ? "en" : "ar"];

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Inline SVG: error.tsx in Next 16 cannot reliably import lucide-react */}
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-12 w-12 text-destructive mb-4"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <h2 className="text-xl font-semibold mb-2">{t.title}</h2>
      <p className="text-muted-foreground mb-6 text-center max-w-md">{t.fallback}</p>
      {error.digest && (
        <p className="text-xs text-muted-foreground mb-4">
          {t.errorId} {error.digest}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          {t.retry}
        </button>
      </div>
    </div>
  );
}
