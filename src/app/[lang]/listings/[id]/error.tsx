"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

// Self-contained copy — an error boundary must not depend on the dictionary
// provider. Locale comes from the route param; the app default is Arabic.
const COPY = {
  en: {
    title: "Unable to load listing",
    description:
      "We encountered an error while loading this listing. Please try again.",
    errorId: "Error ID:",
    retry: "Try again",
    goBack: "Go back",
  },
  ar: {
    title: "تعذّر تحميل الإعلان",
    description: "حدث خطأ أثناء تحميل هذا الإعلان. يرجى المحاولة مرة أخرى.",
    errorId: "معرّف الخطأ:",
    retry: "إعادة المحاولة",
    goBack: "رجوع",
  },
} as const;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const t = COPY[params?.lang === "en" ? "en" : "ar"];

  useEffect(() => {
    console.error("Listing page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="text-center max-w-md">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
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
              className="w-8 h-8 text-red-600"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>

        <h2 className="text-2xl font-semibold mb-2 text-gray-900">{t.title}</h2>

        <p className="text-gray-600 mb-6">{t.description}</p>

        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            {t.errorId} {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M8 16H3v5" />
            </svg>
            {t.retry}
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            {t.goBack}
          </Button>
        </div>
      </div>
    </div>
  );
}
