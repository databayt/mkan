"use client";

import { useEffect, useState } from "react";

// global-error replaces the whole document, so the root layout's <html lang>
// is gone — fall back to the browser's preferred language, defaulting to the
// app's Arabic default. Resolved after mount to avoid a hydration mismatch.
const COPY = {
  en: {
    dir: "ltr" as const,
    title: "Something went wrong",
    description: "An unexpected error occurred. Please try again.",
    retry: "Try again",
  },
  ar: {
    dir: "rtl" as const,
    title: "حدث خطأ ما",
    description: "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.",
    retry: "إعادة المحاولة",
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<"en" | "ar">("ar");
  useEffect(() => {
    setLang(
      navigator.language?.toLowerCase().startsWith("en") ? "en" : "ar"
    );
  }, []);
  const t = COPY[lang];

  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang={lang} dir={t.dir}>
      <body>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "1rem", fontFamily: "system-ui, sans-serif" }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "1rem" }}>{t.title}</h2>
          <p style={{ color: "#666", marginBottom: "1.5rem", textAlign: "center" }}>
            {t.description}
          </p>
          <button
            onClick={reset}
            style={{ padding: "0.5rem 1.5rem", backgroundColor: "#000", color: "#fff", border: "none", borderRadius: "0.375rem", cursor: "pointer", fontSize: "0.875rem" }}
          >
            {t.retry}
          </button>
        </div>
      </body>
    </html>
  );
}
