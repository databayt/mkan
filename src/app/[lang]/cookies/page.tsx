import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import { getDictionary } from "@/components/internationalization/dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "ar" }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.pages?.cookies?.title ?? "Cookie Policy",
    description: d.pages?.cookies?.whatAreCookiesText ?? "How we use cookies on the Mkan platform",
    locale: lang,
    path: "/cookies",
  });
}

export default async function CookiesPage({ params }: { params: Promise<{ lang: "en" | "ar" }> }) {
  const { lang } = await params;
  const d = await getDictionary(lang);
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{d.pages?.cookies?.title ?? "Cookie Policy"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {d.pages?.cookies?.lastUpdated ?? "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.cookies?.whatAreCookiesTitle ?? "What Are Cookies"}</h2>
          <p>{d.pages?.cookies?.whatAreCookiesText ?? "Cookies are small text files stored on your device when you visit our website."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.cookies?.essentialTitle ?? "Essential Cookies"}</h2>
          <p>{d.pages?.cookies?.essentialText ?? "We use essential cookies for authentication, language preferences, and site security."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.cookies?.managingTitle ?? "Managing Cookies"}</h2>
          <p>{d.pages?.cookies?.managingText ?? "You can control cookies through your browser settings."}</p>
        </section>
      </div>
    </div>
  );
}
