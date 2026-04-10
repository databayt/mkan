import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import { getDictionary } from "@/components/internationalization/dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "ar" }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.pages?.privacy?.title ?? "Privacy Policy",
    description: d.pages?.privacy?.collectText ?? "Privacy policy for the Mkan platform",
    locale: lang,
    path: "/privacy",
  });
}

export default async function PrivacyPage({ params }: { params: Promise<{ lang: "en" | "ar" }> }) {
  const { lang } = await params;
  const d = await getDictionary(lang);
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{d.pages?.privacy?.title ?? "Privacy Policy"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {d.pages?.privacy?.lastUpdated ?? "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.privacy?.collectTitle ?? "Information We Collect"}</h2>
          <p>{d.pages?.privacy?.collectText ?? "We collect information you provide directly when creating an account, making a booking, or contacting us."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.privacy?.useTitle ?? "How We Use Your Information"}</h2>
          <p>{d.pages?.privacy?.useText ?? "We use your information to provide, improve, and protect our services and our users."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.privacy?.sharingTitle ?? "Information Sharing"}</h2>
          <p>{d.pages?.privacy?.sharingText ?? "We do not sell your personal information. We share information only as described in this policy."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.privacy?.contactTitle ?? "Contact Us"}</h2>
          <p>{d.pages?.privacy?.contactText ?? "If you have questions about this privacy policy, please contact us."}</p>
        </section>
      </div>
    </div>
  );
}
