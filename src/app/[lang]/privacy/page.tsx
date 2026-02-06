import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "سياسة الخصوصية" : "Privacy Policy",
    description: lang === "ar" ? "سياسة الخصوصية لمنصة مكان" : "Privacy policy for the Mkan platform",
    locale: lang,
    path: "/privacy",
  });
}

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{isAr ? "سياسة الخصوصية" : "Privacy Policy"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {isAr ? "آخر تحديث: فبراير 2026" : "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "المعلومات التي نجمعها" : "Information We Collect"}</h2>
          <p>{isAr
            ? "نجمع المعلومات التي تقدمها مباشرة عند إنشاء حساب أو إجراء حجز أو التواصل معنا."
            : "We collect information you provide directly when creating an account, making a booking, or contacting us."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "كيف نستخدم معلوماتك" : "How We Use Your Information"}</h2>
          <p>{isAr
            ? "نستخدم معلوماتك لتقديم خدماتنا وتحسينها وحماية مستخدمينا."
            : "We use your information to provide, improve, and protect our services and our users."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "مشاركة المعلومات" : "Information Sharing"}</h2>
          <p>{isAr
            ? "لا نبيع معلوماتك الشخصية. نشارك المعلومات فقط كما هو موضح في هذه السياسة."
            : "We do not sell your personal information. We share information only as described in this policy."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "اتصل بنا" : "Contact Us"}</h2>
          <p>{isAr
            ? "إذا كانت لديك أسئلة حول سياسة الخصوصية، يرجى التواصل معنا."
            : "If you have questions about this privacy policy, please contact us."
          }</p>
        </section>
      </div>
    </div>
  );
}
