"use client";

import { useEffect } from "react";
import { useDictionary } from "@/components/internationalization/dictionary-context";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dict = useDictionary();
  const t = dict?.transportHost?.error;
  const tCommon = dict?.transportHost?.common;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Inline SVG: error.tsx in Next 16 cannot import lucide-react */}
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
      <h2 className="text-xl font-semibold mb-2">
        {t?.title ?? "Something went wrong"}
      </h2>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        {error.message ||
          (t?.fallback ?? "An unexpected error occurred. Please try again.")}
      </p>
      {error.digest && (
        <p className="text-xs text-muted-foreground mb-4">
          {`${tCommon?.errorId ?? "Error ID"}: ${error.digest}`}
        </p>
      )}
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
        >
          {tCommon?.tryAgain ?? "Try again"}
        </button>
      </div>
    </div>
  );
}
