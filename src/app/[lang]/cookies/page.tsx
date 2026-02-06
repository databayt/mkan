import { createMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "سياسة ملفات تعريف الارتباط" : "Cookie Policy",
    description: lang === "ar" ? "كيف نستخدم ملفات تعريف الارتباط على منصة مكان" : "How we use cookies on the Mkan platform",
    locale: lang,
    path: "/cookies",
  });
}

export default async function CookiesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const isAr = lang === "ar";

  return (
    <div className="mx-auto max-w-3xl px-4 py-16" dir={isAr ? "rtl" : "ltr"}>
      <h1 className="text-3xl font-bold mb-8">{isAr ? "سياسة ملفات تعريف الارتباط" : "Cookie Policy"}</h1>
      <div className="prose prose-neutral dark:prose-invert max-w-none space-y-6">
        <p className="text-muted-foreground">
          {isAr ? "آخر تحديث: فبراير 2026" : "Last updated: February 2026"}
        </p>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "ما هي ملفات تعريف الارتباط" : "What Are Cookies"}</h2>
          <p>{isAr
            ? "ملفات تعريف الارتباط هي ملفات نصية صغيرة تُخزن على جهازك عند زيارة موقعنا."
            : "Cookies are small text files stored on your device when you visit our website."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "ملفات تعريف الارتباط الأساسية" : "Essential Cookies"}</h2>
          <p>{isAr
            ? "نستخدم ملفات تعريف ارتباط أساسية للمصادقة وتفضيلات اللغة وأمان الموقع."
            : "We use essential cookies for authentication, language preferences, and site security."
          }</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold mb-3">{isAr ? "إدارة ملفات تعريف الارتباط" : "Managing Cookies"}</h2>
          <p>{isAr
            ? "يمكنك التحكم في ملفات تعريف الارتباط من خلال إعدادات المتصفح الخاص بك."
            : "You can control cookies through your browser settings."
          }</p>
        </section>
      </div>
    </div>
  );
}
