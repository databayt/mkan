import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "شروط الخدمة" : "Terms of Service",
    description: lang === "ar" ? "شروط وأحكام استخدام منصة مكان" : "Terms and conditions for using the Mkan platform",
    locale: lang,
    path: "/terms",
  });
}

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{isAr ? "شروط الخدمة" : "Terms of Service"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {isAr ? "آخر تحديث: فبراير 2026" : "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "قبول الشروط" : "Acceptance of Terms"}</h2>
          <p>{isAr
            ? "باستخدام منصة مكان، فإنك توافق على الالتزام بهذه الشروط."
            : "By using the Mkan platform, you agree to be bound by these terms."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "استخدام الخدمة" : "Use of Service"}</h2>
          <p>{isAr
            ? "يجب أن تكون بعمر 18 عامًا أو أكثر لاستخدام خدماتنا. أنت مسؤول عن الحفاظ على أمان حسابك."
            : "You must be 18 years or older to use our services. You are responsible for maintaining the security of your account."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "الحجوزات والمدفوعات" : "Bookings and Payments"}</h2>
          <p>{isAr
            ? "جميع الحجوزات تخضع للتوافر. تتم معالجة المدفوعات بشكل آمن من خلال مزودي خدمة الدفع لدينا."
            : "All bookings are subject to availability. Payments are processed securely through our payment providers."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "تحديد المسؤولية" : "Limitation of Liability"}</h2>
          <p>{isAr
            ? "مكان يعمل كوسيط بين المستأجرين ومديري العقارات. نحن لسنا مسؤولين عن حالة العقارات."
            : "Mkan acts as an intermediary between tenants and property managers. We are not responsible for property conditions."
          }</p>
        </section>
      </div>
    </div>
  );
}
