import { Metadata } from "next";
import { ResetForm } from "@/components/auth/reset/form";
import { createMetadata } from "@/lib/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  return createMetadata({
    title: lang === "ar" ? "إعادة تعيين كلمة المرور" : "Reset Password",
    description:
      lang === "ar"
        ? "أعد تعيين كلمة المرور الخاصة بك"
        : "Reset your password",
    locale: lang,
    path: "/reset",
  });
}

const ResetPage = () => {
  return ( 
    <ResetForm />
  );
}
 
export default ResetPage;