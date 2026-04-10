import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";
import { getDictionary } from "@/components/internationalization/dictionaries";

export async function generateMetadata({ params }: { params: Promise<{ lang: "en" | "ar" }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({
    title: d.pages?.terms?.title ?? "Terms of Service",
    description: d.pages?.terms?.acceptanceText ?? "Terms and conditions for using the Mkan platform",
    locale: lang,
    path: "/terms",
  });
}

export default async function TermsPage({ params }: { params: Promise<{ lang: "en" | "ar" }> }) {
  const { lang } = await params;
  const d = await getDictionary(lang);
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{d.pages?.terms?.title ?? "Terms of Service"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {d.pages?.terms?.lastUpdated ?? "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.terms?.acceptanceTitle ?? "Acceptance of Terms"}</h2>
          <p>{d.pages?.terms?.acceptanceText ?? "By using the Mkan platform, you agree to be bound by these terms."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.terms?.useTitle ?? "Use of Service"}</h2>
          <p>{d.pages?.terms?.useText ?? "You must be 18 years or older to use our services. You are responsible for maintaining the security of your account."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.terms?.bookingsTitle ?? "Bookings and Payments"}</h2>
          <p>{d.pages?.terms?.bookingsText ?? "All bookings are subject to availability. Payments are processed securely through our payment providers."}</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{d.pages?.terms?.liabilityTitle ?? "Limitation of Liability"}</h2>
          <p>{d.pages?.terms?.liabilityText ?? "Mkan acts as an intermediary between tenants and property managers. We are not responsible for property conditions."}</p>
        </section>
      </div>
    </div>
  );
}
