import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "إمكانية الوصول" : "Accessibility",
    description: lang === "ar" ? "التزامنا بإمكانية الوصول على منصة مكان" : "Our commitment to accessibility on the Mkan platform",
    locale: lang,
    path: "/accessibility",
  });
}

export default async function AccessibilityPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{isAr ? "إمكانية الوصول" : "Accessibility"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {isAr ? "آخر تحديث: فبراير 2026" : "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "التزامنا" : "Our Commitment"}</h2>
          <p>{isAr
            ? "نلتزم بضمان إمكانية الوصول الرقمي للأشخاص ذوي الإعاقة. نعمل باستمرار على تحسين تجربة المستخدم للجميع."
            : "We are committed to ensuring digital accessibility for people with disabilities. We continually improve the user experience for everyone."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "المعايير" : "Standards"}</h2>
          <p>{isAr
            ? "نسعى للامتثال لإرشادات WCAG 2.1 على المستوى AA."
            : "We aim to conform to WCAG 2.1 Level AA guidelines."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "الميزات" : "Features"}</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>{isAr ? "دعم قارئ الشاشة" : "Screen reader support"}</li>
            <li>{isAr ? "التنقل بلوحة المفاتيح" : "Keyboard navigation"}</li>
            <li>{isAr ? "دعم RTL/LTR" : "RTL/LTR support"}</li>
            <li>{isAr ? "تباين ألوان كافٍ" : "Sufficient color contrast"}</li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "ملاحظات" : "Feedback"}</h2>
          <p>{isAr
            ? "نرحب بملاحظاتك حول إمكانية الوصول إلى موقعنا. يرجى التواصل معنا إذا واجهت أي عوائق."
            : "We welcome your feedback on the accessibility of our site. Please contact us if you encounter any barriers."
          }</p>
        </section>
      </div>
    </div>
  );
}
