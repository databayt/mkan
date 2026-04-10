import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import { getDictionary } from "@/components/internationalization/dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "ar" }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.pages?.accessibility?.title ?? "Accessibility",
    description: d.pages?.accessibility?.commitmentText ?? "Our commitment to accessibility on the Mkan platform",
    locale: lang,
    path: "/accessibility",
  });
}

export default async function AccessibilityPage({ params }: { params: Promise<{ lang: "en" | "ar" }> }) {
  const { lang } = await params;
  const d = await getDictionary(lang);
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{d.pages?.accessibility?.title ?? "Accessibility"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {d.pages?.accessibility?.lastUpdated ?? "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.accessibility?.commitmentTitle ?? "Our Commitment"}</h2>
          <p>{d.pages?.accessibility?.commitmentText ?? "We are committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.accessibility?.standardsTitle ?? "Standards"}</h2>
          <p>{d.pages?.accessibility?.standardsText ?? "We aim to conform to WCAG 2.1 Level AA guidelines."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.accessibility?.featuresTitle ?? "Features"}</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>{d.pages?.accessibility?.screenReader ?? "Screen reader support"}</li>
            <li>{d.pages?.accessibility?.keyboard ?? "Keyboard navigation"}</li>
            <li>{d.pages?.accessibility?.rtlLtr ?? "RTL/LTR support"}</li>
            <li>{d.pages?.accessibility?.colorContrast ?? "Sufficient color contrast"}</li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.accessibility?.feedbackTitle ?? "Feedback"}</h2>
          <p>{d.pages?.accessibility?.feedbackText ?? "We welcome your feedback on the accessibility of our site. Please contact us if you encounter any barriers."}</p>
        </section>
      </div>
    </div>
  );
}
